import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { config } from "./config.js";
import { swaps, type Swap } from "./db.js";
import { log } from "./log.js";
import { ASSET_WNEAR } from "./oneclick.js";
import { COUNTRY, paj, PajError } from "./paj.js";
import { preview } from "./quote.js";
import { applyPayout, createSwap, recordDeposit } from "./swaps.js";

export const app = new Hono();

// Listed origins always; any localhost port while orders are simulated.
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
app.use(
  "*",
  cors({
    origin: (origin) => (config.corsOrigins.includes(origin) || (config.demo && LOCALHOST.test(origin)) ? origin : null),
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.onError((e, c) => {
  if (e instanceof z.ZodError) {
    const first = e.issues[0];
    return c.json({ error: `${first.path.join(".") || "request"}: ${first.message}` }, 400);
  }
  if (e instanceof PajError && e.status === 401) {
    const fresh = e.message === "Sign in first";
    return c.json({ error: fresh ? "Sign in with your email first." : "Your session expired. Sign in again.", code: "SIGN_IN" }, 401);
  }
  return c.json({ error: e.message }, 400);
});

const NEAR_ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const accountId = z.string().min(2).max(64).regex(NEAR_ACCOUNT, "Not a NEAR account id");
const currency = z
  .string()
  .length(3)
  .transform((s) => s.toUpperCase())
  .refine((s) => Boolean(COUNTRY[s]), "Unsupported currency");

/** The user's PAJ session, sent by the frontend as a Bearer token. */
function session(c: Context, required: true): string;
function session(c: Context, required?: false): string | undefined;
function session(c: Context, required = false) {
  const h = c.req.header("authorization") ?? "";
  const t = h.startsWith("Bearer ") ? h.slice(7).trim() : undefined;
  if (required && !t) throw new PajError("Sign in first", 401);
  return t;
}

/* ---------- reference ---------- */

app.get("/health", (c) => c.json({ ok: true, demo: config.demo, feePercent: config.FEE_PERCENT }));

app.get("/currencies", (c) =>
  c.json(Object.entries(COUNTRY).map(([code, x]) => ({ code, name: x.country, symbol: x.symbol, flag: x.flag, country: x.country }))),
);

let nearPrice: { at: number; usd: number } | null = null;
app.get("/prices", async (c) => {
  if (!nearPrice || Date.now() - nearPrice.at > 60_000) {
    const r = await fetch("https://1click.chaindefuser.com/v0/tokens", { signal: AbortSignal.timeout(10000) });
    const t = (await r.json()) as { assetId: string; price: number }[];
    nearPrice = { at: Date.now(), usd: t.find((x) => x.assetId === ASSET_WNEAR)?.price ?? 0 };
  }
  const ngnPerUsd = await paj.publicNgnRate().catch(() => null);
  return c.json({ nearUsd: nearPrice.usd, ngnPerUsd });
});

app.get("/quote", async (c) => {
  const q = z
    .object({ near: z.coerce.number().positive().max(1_000_000), currency, account: accountId.optional() })
    .parse(c.req.query());
  return c.json(await preview(q.near, q.currency, q.account ?? "near", session(c)));
});

/* ---------- PAJ session (email OTP) ---------- */

const email = z.string().email().max(200).transform((s) => s.trim().toLowerCase());

app.post("/auth/start", async (c) => {
  const b = z.object({ email }).parse(await c.req.json());
  await paj.startSession(b.email);
  return c.json({ sent: true, email: b.email });
});

app.post("/auth/verify", async (c) => {
  const b = z
    .object({ email, otp: z.string().regex(/^\d{4,8}$/, "Enter the code from the email"), deviceId: z.string().min(8).max(100) })
    .parse(await c.req.json());
  const v = await paj.verifySession(b.email, b.otp, b.deviceId);
  log("auth", `session for ${b.email} until ${v.expiresAt}`);
  return c.json({ token: v.token, expiresAt: v.expiresAt, email: b.email });
});

/* ---------- banks (user session) ---------- */

app.get("/banks", async (c) => {
  const cur = currency.parse(c.req.query("currency") ?? "NGN");
  const all = await paj.banks(session(c, true));
  const iso = COUNTRY[cur].iso;
  // PAJ may label a bank's country as "NG", "Nigeria" or "NGN".
  const match = new Set([iso, COUNTRY[cur].country, cur].map((x) => x.toLowerCase()));
  const inCountry = all.filter((b) => !b.country || match.has(b.country.toLowerCase()));
  return c.json(inCountry.sort((a, b) => a.name.localeCompare(b.name)));
});

app.post("/bank-accounts/resolve", async (c) => {
  const b = z.object({ bankId: z.string().min(1), accountNumber: z.string().regex(/^\d{6,20}$/) }).parse(await c.req.json());
  const r = await paj.resolveAccount(session(c, true), b.bankId, b.accountNumber);
  return c.json({ accountName: r.accountName, accountNumber: r.accountNumber, bank: r.bank });
});

app.get("/bank-accounts", async (c) => c.json(await paj.savedAccounts(session(c, true))));

app.post("/bank-accounts", async (c) => {
  const b = z.object({ bankId: z.string().min(1), accountNumber: z.string().regex(/^\d{6,20}$/) }).parse(await c.req.json());
  return c.json(await paj.saveAccount(session(c, true), b.bankId, b.accountNumber));
});

app.post("/kyc", async (c) => {
  const b = z
    .object({ idType: z.enum(["BVN", "NIN"]), idNumber: z.string().regex(/^\d{11}$/, "11 digits"), country: z.string().length(2) })
    .parse(await c.req.json());
  return c.json(await paj.submitKyc(session(c, true), b.idType, b.idNumber, b.country));
});

/* ---------- swaps ---------- */

app.post("/swaps", async (c) => {
  const b = z
    .object({
      accountId,
      near: z.number().positive().max(1_000_000),
      currency,
      bankId: z.string().min(1),
      bankName: z.string().min(1).max(120),
      accountNumber: z.string().regex(/^\d{6,20}$/),
      accountName: z.string().min(2).max(120),
    })
    .parse(await c.req.json());
  const { swap, deposit } = await createSwap(b, session(c, true));
  return c.json({
    swap: publicSwap(swap),
    transaction: deposit ? wrapAndSend(deposit.depositAddress, deposit.amountYocto) : null,
  });
});

app.post("/swaps/:id/deposit", async (c) => {
  const { txHash } = z.object({ txHash: z.string().min(4) }).parse(await c.req.json());
  return c.json(publicSwap(await recordDeposit(c.req.param("id"), txHash)));
});

app.get("/swaps/:id", (c) => {
  const s = swaps.byId(c.req.param("id"));
  return s ? c.json(publicSwap(s)) : c.json({ error: "Not found" }, 404);
});

app.get("/swaps", (c) => c.json(swaps.forAccount(accountId.parse(c.req.query("account"))).map(publicSwap)));

/* ---------- PAJ webhook ---------- */

// PAJ webhooks aren't signed, so the payload is only a hint: re-read the order with the stored session.
app.post("/webhooks/paj", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { id?: string };
  const s = body.id ? swaps.byPajOrderId(body.id) : undefined;
  if (s?.paj_token && s.paj_order_id) {
    const t = await paj.transaction(s.paj_token, s.paj_order_id);
    applyPayout(s, t.status, t.signature);
    log("webhook", `${s.id} ${t.status}`);
  }
  return c.text("ok");
});

/* ---------- shapes ---------- */

/**
 * One transaction, all actions on wrap.near: register the user and the
 * deposit address (no-ops if already registered; deposit refunded), wrap the
 * NEAR, send it to the Intents deposit address.
 */
function wrapAndSend(depositAddress: string, amountYocto: string) {
  const fc = (methodName: string, args: object, deposit: string) => ({
    type: "FunctionCall" as const,
    params: { methodName, args, gas: "30000000000000", deposit },
  });
  return {
    receiverId: "wrap.near",
    actions: [
      // Register the user first: otherwise near_deposit deducts storage from the wrapped amount.
      fc("storage_deposit", { registration_only: true }, "1250000000000000000000"),
      fc("storage_deposit", { account_id: depositAddress, registration_only: true }, "1250000000000000000000"),
      fc("near_deposit", {}, amountYocto),
      fc("ft_transfer", { receiver_id: depositAddress, amount: amountYocto, memo: "paya" }, "1"),
    ],
  };
}

const mask = (s: string) => (s.length <= 4 ? s : `•••• ${s.slice(-4)}`);

function publicSwap(s: Swap) {
  return {
    id: s.id,
    status: s.status,
    demo: Boolean(s.demo),
    nearIn: Number(BigInt(s.amount_in) / 10n ** 18n) / 1e6,
    currency: s.currency,
    fiatAmount: s.fiat_amount,
    rate: s.rate,
    usdcAmount: Number(s.usdc_amount),
    feeUsdc: Number(s.fee_usdc),
    recipient: { bankName: s.bank_name, account: mask(s.account_number), name: s.account_name },
    depositTx: s.deposit_tx,
    paymentReference: s.payment_reference,
    error: s.error,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}
