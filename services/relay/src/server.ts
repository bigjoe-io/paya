import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { config } from "./config.js";
import { swaps, users, type Swap, type User } from "./db.js";
import { log } from "./log.js";
import { ASSET_WNEAR } from "./oneclick.js";
import { COUNTRY, paj, PajError } from "./paj.js";
import { preview } from "./quote.js";
import { applyPayout } from "./swaps.js";
import { BUY_CURRENCIES, MIN_BUY, createBuy, markSent, previewBuy } from "./buys.js";
import { buys, type Buy } from "./db.js";
import { admin } from "./admin.js";
import { audit, last4 } from "./audit.js";
import { accountView, cashOut, pajTokenOf, requirePaj, setAuto, setBank, signIn, withdraw } from "./accounts.js";
import { createSession, readSession } from "./secrets.js";
import { accountExists, fundFromTreasury, toYocto } from "./near.js";

export const app = new Hono();


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

/** The signed-in Paya account (Bearer = Paya session token). */
function me(c: Context, required: true): User;
function me(c: Context, required?: false): User | undefined;
function me(c: Context, required = false) {
  const h = c.req.header("authorization") ?? "";
  const uid = h.startsWith("Bearer ") ? readSession(h.slice(7).trim()) : null;
  const u = uid ? users.byId(uid) : undefined;
  if (required && !u) throw new PajError("Sign in first", 401);
  return u;
}
/** PAJ session of the signed-in user, if any (for pricing). */
const pajOf = (c: Context) => {
  const u = me(c);
  return u ? (pajTokenOf(u) ?? undefined) : undefined;
};

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
  const u = me(c);
  return c.json(await preview(q.near, q.currency, u?.address ?? q.account ?? "near", pajOf(c)));
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
  const u = signIn(b.email, v.token, v.expiresAt);
  const session = createSession(u.id);
  audit("signed_in", b.email, { device: b.deviceId.slice(0, 8), pajExpiresAt: v.expiresAt });
  log("auth", `${u.id} signed in (PAJ session until ${v.expiresAt})`);
  return c.json({ token: session.token, expiresAt: session.expiresAt, email: u.email });
});

/* ---------- banks (user session) ---------- */

app.get("/banks", async (c) => {
  const cur = currency.parse(c.req.query("currency") ?? "NGN");
  const all = await paj.banks(requirePaj(me(c, true)));
  const iso = COUNTRY[cur].iso;
  // PAJ may label a bank's country as "NG", "Nigeria" or "NGN".
  const match = new Set([iso, COUNTRY[cur].country, cur].map((x) => x.toLowerCase()));
  const inCountry = all.filter((b) => !b.country || match.has(b.country.toLowerCase()));
  return c.json(inCountry.sort((a, b) => a.name.localeCompare(b.name)));
});

app.post("/bank-accounts/resolve", async (c) => {
  const b = z.object({ bankId: z.string().min(1), accountNumber: z.string().regex(/^\d{6,20}$/) }).parse(await c.req.json());
  const r = await paj.resolveAccount(requirePaj(me(c, true)), b.bankId, b.accountNumber);
  return c.json({ accountName: r.accountName, accountNumber: r.accountNumber, bank: r.bank });
});

app.get("/bank-accounts", async (c) => c.json(await paj.savedAccounts(requirePaj(me(c, true)))));

app.post("/bank-accounts", async (c) => {
  const b = z.object({ bankId: z.string().min(1), accountNumber: z.string().regex(/^\d{6,20}$/) }).parse(await c.req.json());
  const u = me(c, true);
  const saved = await paj.saveAccount(requirePaj(u), b.bankId, b.accountNumber);
  audit("bank_account_saved", u.email, { bankId: b.bankId, account: last4(b.accountNumber), name: saved.accountName });
  return c.json(saved);
});

app.post("/kyc", async (c) => {
  const b = z
    .object({ idType: z.enum(["BVN", "NIN"]), idNumber: z.string().regex(/^\d{11}$/, "11 digits"), country: z.string().length(2) })
    .parse(await c.req.json());
  const u = me(c, true);
  const r = await paj.submitKyc(requirePaj(u), b.idType, b.idNumber, b.country);
  audit("kyc_submitted", u.email, { idType: b.idType, country: b.country }); // never the ID number
  return c.json(r);
});

/* ---------- the signed-in account ---------- */

app.get("/me", async (c) => c.json(await accountView(me(c, true))));

/** Link or change the payout bank. The name comes from the bank, not the client. */
app.put("/me/bank", async (c) => {
  const b = z
    .object({ currency, bankId: z.string().min(1), accountNumber: z.string().regex(/^\d{6,20}$/) })
    .parse(await c.req.json());
  return c.json(await accountView(await setBank(me(c, true), b)));
});

app.put("/me/auto", async (c) => {
  const { enabled } = z.object({ enabled: z.boolean() }).parse(await c.req.json());
  const u = me(c, true);
  if (enabled && !u.bank_id) throw new Error("Link a bank account first");
  return c.json(await accountView(setAuto(u, enabled)));
});

/** Cash out from the Paya balance to the linked bank. */
app.post("/cashout", async (c) => {
  const { near } = z.object({ near: z.number().positive().max(1_000_000) }).parse(await c.req.json());
  const u = me(c, true);
  try {
    return c.json(publicSwap(await cashOut(u, near, "manual")));
  } catch (e) {
    audit("cashout_rejected", u.email, { near, error: (e as Error).message });
    throw e;
  }
});

/**
 * Send NEAR to another address. Needs a fresh email code every time: a stolen
 * app session alone can't move money anywhere but the user's own bank.
 */
app.post("/me/withdraw", async (c) => {
  const b = z
    .object({
      to: z.string().min(2).max(64),
      near: z.number().positive().max(1_000_000),
      otp: z.string().regex(/^\d{4,8}$/, "Enter the code from the email"),
      deviceId: z.string().min(8).max(100),
    })
    .parse(await c.req.json());
  const u = me(c, true);
  let v;
  try {
    v = await paj.verifySession(u.email, b.otp, b.deviceId);
  } catch (e) {
    audit("withdraw_code_failed", u.email, { error: (e as Error).message });
    throw new Error("That code didn't work. Request a new one.");
  }
  signIn(u.email, v.token, v.expiresAt); // refreshes the stored PAJ session
  try {
    return c.json(await withdraw(users.byId(u.id)!, b.to, b.near));
  } catch (e) {
    audit("withdraw_rejected", u.email, { to: b.to, near: b.near, error: (e as Error).message });
    throw e;
  }
});

app.get("/me/activity", (c) => {
  const u = me(c, true);
  return c.json({
    cashouts: swaps.forAccount(u.address).map(publicSwap),
    buys: buys.forAccount(u.address).map(publicBuy),
  });
});

/** Owner-only: a cash-out's live status. */
app.get("/swaps/:id", (c) => {
  const u = me(c, true);
  const s = swaps.byId(c.req.param("id"));
  return s && s.account_id === u.address ? c.json(publicSwap(s)) : c.json({ error: "Not found" }, 404);
});

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
  const u = me(c);
  return c.json(await previewBuy(q.fiat, q.currency, u?.address ?? q.account ?? "near", pajOf(c)));
});

app.post("/buys", async (c) => {
  const b = z
    .object({
      fiat: z.number().positive().max(50_000_000),
      currency: z.string().length(3).transform((s) => s.toUpperCase()),
    })
    .parse(await c.req.json());
  let u = me(c, true);
  const token = requirePaj(u);
  // Bought NEAR should stay in the balance, not be sold straight back.
  if (u.auto_cashout) {
    u = setAuto(u, false);
    users.event(u.id, "auto_paused_for_buy");
  }
  let buy;
  try {
    buy = await createBuy({ accountId: u.address, fiat: b.fiat, currency: b.currency }, token);
  } catch (e) {
    audit("buy_rejected", u.email, { fiat: b.fiat, currency: b.currency, error: (e as Error).message });
    throw e;
  }
  audit("buy_created", u.email, { buyId: buy.id, address: u.address, fiat: b.fiat, currency: b.currency, simulated: Boolean(buy.demo) });
  // A brand-new address can't sign until it holds a little NEAR (needed if the purchase lands as wNEAR).
  if (!buy.demo && config.TREASURY_ACCOUNT_ID && !(await accountExists(u.address).catch(() => true))) {
    fundFromTreasury(u.address, toYocto(0.01))
      .then((tx) => users.event(u.id, "activated", { tx }))
      .catch((e: Error) => log("treasury", `activation failed for ${u.id}: ${e.message}`));
  }
  return c.json(publicBuy(buy));
});

const ownBuy = (c: Context) => {
  const u = me(c, true);
  const b = buys.byId(c.req.param("id") ?? "");
  return b && b.account_id === u.address ? b : null;
};

app.post("/buys/:id/sent", (c) => {
  const b = ownBuy(c);
  return b ? c.json(publicBuy(markSent(b.id))) : c.json({ error: "Not found" }, 404);
});

app.get("/buys/:id", (c) => {
  const b = ownBuy(c);
  return b ? c.json(publicBuy(b)) : c.json({ error: "Not found" }, 404);
});

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
