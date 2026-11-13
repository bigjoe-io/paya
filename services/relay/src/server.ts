import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { config } from "./config.js";
import { swaps, users, type Swap, type User } from "./db.js";
import { log } from "./log.js";
import { COUNTRY, paj, PajError, PajV2Error, pajV2 } from "./paj.js";
import { minCashoutNear, preview } from "./quote.js";
import { applyPayout } from "./swaps.js";
import { activeBuyCurrencies, cancelBuy, createBuy, markSent, minBuy, previewBuy } from "./buys.js";
import { buys, type Buy } from "./db.js";
import { admin } from "./admin.js";
import { audit, last4 } from "./audit.js";
import { accountView, cashOut, pajTokenOf, requirePaj, setAuto, setBank, signIn, withdraw } from "./accounts.js";
import { createSession, readSession } from "./secrets.js";
import { redeem, verifyAccess } from "./access.js";
import { holdings, quoteSwap, startSwap, swapStatus, tokens } from "./tokenswap.js";
import { waitlist } from "./db.js";
import crypto from "node:crypto";
import { accountExists, fundFromTreasury, toYocto } from "./near.js";

export const app = new Hono();


// Listed origins always; any localhost port while orders are simulated.
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
const publicCors = cors({
    origin: (origin) => (config.corsOrigins.includes(origin) || (config.demo && LOCALHOST.test(origin)) ? origin : null),
    allowHeaders: ["Content-Type", "Authorization", "X-Paya-Access"],
});
// No CORS on /admin: it's server-to-server only, so browsers can never read it.
app.use("*", (c, next) => (c.req.path.startsWith("/admin") ? next() : publicCors(c, next)));

/**
 * Private testing: everything the app uses needs a tester access token
 * (X-Paya-Access). Open to everyone: health, reference data, the waitlist,
 * redeeming a code, PAJ webhooks and the admin API (which has its own token).
 */
const OPEN = [/^\/health$/, /^\/waitlist$/, /^\/access\//, /^\/webhooks\//, /^\/admin(\/|$)/, /^\/currencies$/, /^\/prices$/];
app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS" || OPEN.some((r) => r.test(c.req.path))) return next();
  if (!verifyAccess(c.req.header("x-paya-access"))) return c.json({ error: "Paya is in private testing. Join the waitlist at usepaya.xyz.", code: "NO_ACCESS" }, 403);
  return next();
});

app.onError((e, c) => {
  if (e instanceof z.ZodError) {
    const first = e.issues[0];
    return c.json({ error: `${first.path.join(".") || "request"}: ${first.message}` }, 400);
  }
  if (e instanceof PajV2Error) return c.json({ error: e.status >= 500 ? "Our payment partner is unavailable right now. Please try again in a moment." : e.message }, e.status >= 500 ? 502 : 400);
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

/* ---------- private testing + waitlist ---------- */

app.post("/access/redeem", async (c) => {
  const parsed = z.object({ code: z.string().min(4).max(40) }).safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "That doesn't look like an access code. Codes look like PAYA-XXXX-XXXX." }, 400);
  const { code } = parsed.data;
  await new Promise((r) => setTimeout(r, 400)); // slow down guessing
  const r = redeem(code);
  audit(r ? "access_redeemed" : "access_refused", undefined, r ? { label: r.label } : {});
  if (!r) return c.json({ error: "That code isn't valid or has been used up." }, 400);
  return c.json(r);
});

app.get("/access/check", (c) => c.json({ ok: verifyAccess(c.req.header("x-paya-access")) }));

const waitlistHits = new Map<string, number[]>(); // per-IP throttle, memory only
app.post("/waitlist", async (c) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const now = Date.now();
  const hits = (waitlistHits.get(ip) ?? []).filter((t) => now - t < 60 * 60_000);
  if (hits.length >= 10) return c.json({ error: "Too many tries. Please try again later." }, 429);
  waitlistHits.set(ip, [...hits, now]);
  const b = z
    .object({ email: z.string().email("Enter a valid email").max(200).transform((s) => s.trim().toLowerCase()), source: z.string().max(40).optional() })
    .parse(await c.req.json());
  if (!waitlist.find((w) => w.email === b.email)) {
    waitlist.insert({ id: `wl_${crypto.randomBytes(6).toString("hex")}`, email: b.email, source: b.source ?? null });
    log("waitlist", `+1 (${waitlist.all().length} total)`);
  }
  return c.json({ ok: true }); // same answer either way: never reveal who already signed up
});

/* ---------- reference ---------- */

app.get("/health", (c) => c.json({ ok: true, demo: config.demo, feePercent: config.FEE_PERCENT }));

/** Shown in the app but not payable yet. */
const COMING_SOON = [{ code: "USD", name: "US Dollar", symbol: "$", flag: "🇺🇸", country: "United States", comingSoon: true }];

/** Countries Paya supports. Ones PAJ hasn't switched on yet show as "coming soon". */
app.get("/currencies", async (c) => {
  const live = await pajV2.activeCurrencies().catch(() => new Set(["NGN"]));
  return c.json([
    ...Object.entries(COUNTRY).map(([code, x]) => ({ code, name: x.country, symbol: x.symbol, flag: x.flag, country: x.country, ...(live.has(code) ? {} : { comingSoon: true }) })),
    ...COMING_SOON,
  ]);
});

let nearPrice: { at: number; usd: number } | null = null;
/** NEAR/USD: CoinGecko, falling back to Gate's order book. */
async function nearUsd(): Promise<number> {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=near&vs_currencies=usd", { signal: AbortSignal.timeout(8000) });
    const v = ((await r.json()) as { near?: { usd?: number } }).near?.usd;
    if (v) return v;
  } catch {
    /* fall through */
  }
  const r = await fetch("https://api.gateio.ws/api/v4/spot/tickers?currency_pair=NEAR_USDT", { signal: AbortSignal.timeout(8000) });
  return Number(((await r.json()) as { last: string }[])[0]?.last ?? 0);
}
app.get("/prices", async (c) => {
  if (!nearPrice || Date.now() - nearPrice.at > 60_000) {
    nearPrice = { at: Date.now(), usd: await nearUsd() };
  }
  const ngnPerUsd = await pajV2.rates("NGN").then((r) => r.sell).catch(() => null);
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

/** Banks for a country (PAJ v2). The bank code is used as the id everywhere. */
app.get("/banks", async (c) => {
  me(c, true);
  const cur = currency.parse(c.req.query("currency") ?? "NGN");
  const iso = COUNTRY[cur].iso;
  const match = new Set([iso, COUNTRY[cur].country, cur].map((x) => x.toLowerCase()));
  const list = (await pajV2.banks())
    .filter((b) => !b.country || match.has(b.country.toLowerCase()))
    .map((b) => ({ id: b.code, code: b.code, name: b.name, logo: b.logo, country: b.country }))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  return c.json(list);
});

/** Confirm an account with the bank (registers it with PAJ; idempotent). The name comes from the bank. */
app.post("/bank-accounts/resolve", async (c) => {
  me(c, true);
  const b = z.object({ bankId: z.string().min(1), accountNumber: z.string().regex(/^\d{6,20}$/) }).parse(await c.req.json());
  const r = await pajV2.registerBank(await pajV2.bankCode(b.bankId), b.accountNumber);
  return c.json({ accountName: r.accountName, accountNumber: r.accountNumber, bank: r.bank });
});

/** The account's linked bank, in the "saved accounts" shape the app's picker uses. */
app.get("/bank-accounts", async (c) => {
  const u = me(c, true);
  if (!u.bank_id || !u.account_number) return c.json([]);
  return c.json([{ id: `linked_${u.id}`, accountName: u.account_name, accountNumber: u.account_number, bank: await pajV2.bankCode(u.bank_id).catch(() => u.bank_id) }]);
});

app.post("/bank-accounts", async (c) => {
  const b = z.object({ bankId: z.string().min(1), accountNumber: z.string().regex(/^\d{6,20}$/) }).parse(await c.req.json());
  const u = me(c, true);
  const code = await pajV2.bankCode(b.bankId);
  const r = await pajV2.registerBank(code, b.accountNumber);
  audit("bank_account_saved", u.email, { bank: r.bank, account: last4(b.accountNumber), name: r.accountName });
  return c.json({ id: `reg_${r.id}`, accountName: r.accountName, accountNumber: r.accountNumber, bank: code });
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

/** Smallest amount that cashes out right now (the largest is `spendable` on /me). */
app.get("/cashout/limits", async (c) => c.json({ minNear: await minCashoutNear() }));

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
/* ---------- token swaps inside the account (NEAR Intents) ---------- */

app.get("/tokens", async (c) => c.json(await tokens()));

app.get("/me/holdings", async (c) => c.json(await holdings(me(c, true).address)));

app.get("/me/token-swap/quote", async (c) => {
  const q = z
    .object({ from: z.string().min(2).max(80), to: z.string().min(2).max(80), amount: z.coerce.number().positive().max(1e12) })
    .parse(c.req.query());
  return c.json(await quoteSwap(me(c, true), q.from, q.to, q.amount));
});

app.post("/me/token-swap", async (c) => {
  const b = z
    .object({ from: z.string().min(2).max(80), to: z.string().min(2).max(80), amount: z.number().positive().max(1e12) })
    .parse(await c.req.json());
  const u = me(c, true);
  try {
    return c.json(await startSwap(users.byId(u.id)!, b.from, b.to, b.amount));
  } catch (e) {
    audit("token_swap_rejected", u.email, { ...b, error: (e as Error).message });
    throw e;
  }
});

app.get("/me/token-swap/:deposit", async (c) => c.json(await swapStatus(me(c, true), c.req.param("deposit"))));

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

app.get("/buy/currencies", async (c) =>
  c.json(await Promise.all((await activeBuyCurrencies()).map(async (code) => ({ code, min: await minBuy(code).catch(() => 0) })))),
);

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
  // Bought NEAR should stay in the balance, not be sold straight back.
  if (u.auto_cashout) {
    u = setAuto(u, false);
    users.event(u.id, "auto_paused_for_buy");
  }
  let buy;
  try {
    buy = await createBuy({ accountId: u.address, fiat: b.fiat, currency: b.currency });
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

app.post("/buys/:id/cancel", (c) => {
  const b = ownBuy(c);
  if (!b) return c.json({ error: "Not found" }, 404);
  const done = cancelBuy(b.id, "user");
  audit("buy_cancelled", me(c, true).email, { buyId: b.id });
  return c.json(publicBuy(done));
});

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
// The payload is only a hint: the order is re-read from PAJ before anything changes.
app.post("/webhooks/paj", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { id?: string };
  const s = body.id ? swaps.byPajOrderId(body.id) : undefined;
  if (s?.paj_order_id && s.status === "paying") {
    const t = await pajV2.transaction(s.paj_order_id);
    applyPayout(s, t.status, t.signature ?? undefined);
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
    // Share the order id with support; the hashes show where the money went.
    supportId: b.id,
    provider: b.provider ?? null,
    solanaTx: b.paj_tx ?? null, // PAJ → Paya's Solana wallet (USDC)
    providerTx: b.swap_tx ?? null, // Paya's wallet → exchange provider (USDC)
    nearTx: b.out_tx ?? null, // provider → your Paya address (NEAR)
    intentsRef: b.intents_ref ?? null,
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
    supportId: s.id,
    provider: s.provider ?? null,
    nearTx: s.deposit_tx && s.deposit_tx !== "simulated" ? s.deposit_tx : null, // your Paya address → exchange provider
    providerTx: s.status !== "refunded" ? (s.out_tx ?? null) : null, // provider → Paya's Solana wallet (USDC)
    solanaTx: s.payout_tx ?? null, // Paya's Solana wallet → PAJ (USDC)
    refundTx: s.status === "refunded" ? (s.out_tx ?? null) : null,
    intentsRef: s.intents_ref ?? null,
    error: s.error,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  };
}
