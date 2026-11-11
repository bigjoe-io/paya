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
import { BUY_CURRENCIES, MIN_BUY, createBuy, markSent, previewBuy } from "./buys.js";
import { buys, type Buy } from "./db.js";
import { admin } from "./admin.js";
import { audit, last4 } from "./audit.js";

export const app = new Hono();

/** Which email a PAJ session belongs to, for the audit log (memory only; never persisted). */
const sessionEmail = new Map<string, string>();
const actorOf = (c: Context) => {
  const t = (c.req.header("authorization") ?? "").replace(/^Bearer /, "");
  return (t && sessionEmail.get(t)) || undefined;
};

// Listed origins always; any localhost port while orders are simulated.
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
const publicCors = cors({
    origin: (origin) => (config.corsOrigins.includes(origin) || (config.demo && LOCALHOST.test(origin)) ? origin : null),
    allowHeaders: ["Content-Type", "Authorization"],
});
// No CORS on /admin: it's server-to-server only, so browsers can never read it.
app.use("*", (c, next) => (c.req.path.startsWith("/admin") ? next() : publicCors(c, next)));

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
  .refine((s) => s !== "USD", "USD payouts are coming soon")
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

/** Shown in the app but not payable yet. */
const COMING_SOON = [{ code: "USD", name: "US Dollar", symbol: "$", flag: "🇺🇸", country: "United States", comingSoon: true }];

app.get("/currencies", (c) =>
  c.json([
    ...Object.entries(COUNTRY).map(([code, x]) => ({ code, name: x.country, symbol: x.symbol, flag: x.flag, country: x.country })),
    ...COMING_SOON,
  ]),
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
  audit("sign_in_code_sent", b.email);
  return c.json({ sent: true, email: b.email });
});

app.post("/auth/verify", async (c) => {
  const b = z
    .object({ email, otp: z.string().regex(/^\d{4,8}$/, "Enter the code from the email"), deviceId: z.string().min(8).max(100) })
    .parse(await c.req.json());
  let v;
  try {
    v = await paj.verifySession(b.email, b.otp, b.deviceId);
  } catch (e) {
    audit("sign_in_failed", b.email, { error: (e as Error).message });
    throw e;
  }
  sessionEmail.set(v.token, b.email);
  audit("signed_in", b.email, { device: b.deviceId.slice(0, 8), expiresAt: v.expiresAt });
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
  const saved = await paj.saveAccount(session(c, true), b.bankId, b.accountNumber);
  audit("bank_account_saved", actorOf(c), { bankId: b.bankId, account: last4(b.accountNumber), name: saved.accountName });
  return c.json(saved);
});

app.post("/kyc", async (c) => {
  const b = z
    .object({ idType: z.enum(["BVN", "NIN"]), idNumber: z.string().regex(/^\d{11}$/, "11 digits"), country: z.string().length(2) })
    .parse(await c.req.json());
  const r = await paj.submitKyc(session(c, true), b.idType, b.idNumber, b.country);
  audit("kyc_submitted", actorOf(c), { idType: b.idType, country: b.country }); // never the ID number
  return c.json(r);
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
  let created;
  try {
    created = await createSwap(b, session(c, true));
  } catch (e) {
    // The user tried and was refused before any record existed: keep it for support.
    audit("swap_rejected", actorOf(c) ?? b.accountId, {
      wallet: b.accountId,
      near: b.near,
      currency: b.currency,
      bank: b.bankName,
      account: last4(b.accountNumber),
      error: (e as Error).message,
    });
    throw e;
  }
  const { swap, deposit } = created;
  audit("swap_created", actorOf(c) ?? b.accountId, { swapId: swap.id, wallet: b.accountId, near: b.near, currency: b.currency, simulated: Boolean(swap.demo) });
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

/* ---------- buy: fiat → NEAR ---------- */

app.get("/buy/currencies", (c) => c.json(BUY_CURRENCIES.map((code) => ({ code, min: MIN_BUY[code] ?? 0 }))));

app.get("/buy/quote", async (c) => {
  const q = z
    .object({
      fiat: z.coerce.number().positive().max(50_000_000),
      currency: z.string().length(3).transform((s) => s.toUpperCase()),
      account: accountId.optional(),
    })
    .parse(c.req.query());
  return c.json(await previewBuy(q.fiat, q.currency, q.account ?? "near", session(c)));
});

app.post("/buys", async (c) => {
  const b = z
    .object({
      accountId,
      fiat: z.number().positive().max(50_000_000),
      currency: z.string().length(3).transform((s) => s.toUpperCase()),
    })
    .parse(await c.req.json());
  let buy;
  try {
    buy = await createBuy(b, session(c, true));
  } catch (e) {
    audit("buy_rejected", actorOf(c) ?? b.accountId, { wallet: b.accountId, fiat: b.fiat, currency: b.currency, error: (e as Error).message });
    throw e;
  }
  audit("buy_created", actorOf(c) ?? b.accountId, { buyId: buy.id, wallet: b.accountId, fiat: b.fiat, currency: b.currency, simulated: Boolean(buy.demo) });
  return c.json(publicBuy(buy));
});

app.post("/buys/:id/sent", (c) => c.json(publicBuy(markSent(c.req.param("id")))));

app.get("/buys/:id", (c) => {
  const b = buys.byId(c.req.param("id"));
  return b ? c.json(publicBuy(b)) : c.json({ error: "Not found" }, 404);
});

app.get("/buys", (c) => c.json(buys.forAccount(accountId.parse(c.req.query("account"))).map(publicBuy)));

/* ---------- admin (server-to-server, token-protected) ---------- */

app.route("/admin", admin);

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

function publicBuy(b: Buy) {
  const toNear = (y: string) => Number(BigInt(y) / 10n ** 18n) / 1e6;
  return {
    id: b.id,
    status: b.status,
    demo: Boolean(b.demo),
    currency: b.currency,
    fiatAmount: b.fiat_amount,
    nearExpected: toNear(b.near_expected),
    nearMin: toNear(b.near_min),
    usdc: b.usdc_expected,
    feeUsdc: b.fee_usdc,
    rate: b.rate,
    // Where the user sends the money. Shown only while the order can be paid.
    payTo:
      b.status === "awaiting_payment"
        ? { bank: b.pay_bank, accountNumber: b.pay_account_number, accountName: b.pay_account_name }
        : null,
    deadline: b.deadline,
    error: b.error,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
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
