import crypto from "node:crypto";
import { config } from "./config.js";
import { buys, users, type Buy, type BuyStatus } from "./db.js";
import { pajTokenOf } from "./accounts.js";
import { log, warn } from "./log.js";
import { oneclick } from "./oneclick.js";
import { COUNTRY, paj } from "./paj.js";
import { indicativeBuyRate } from "./fx.js";

/**
 * Buy: local currency → NEAR in the user's own wallet.
 *
 *   user ──bank transfer──▶ PAJ ──USDC on Solana──▶ NEAR Intents deposit address
 *                                                       │ FLEX_INPUT swap
 *                                                       ▼
 *                                         wNEAR in the user's NEAR wallet
 *
 * Paya never holds the fiat, the USDC or the NEAR. If the swap can't run, the
 * USDC is refunded into the user's NEAR Intents balance (they control it with
 * their NEAR wallet).
 */
/** Every country PAJ pays in also takes deposits (USD stays "coming soon"). */
export const BUY_CURRENCIES = Object.keys(COUNTRY);
/**
 * Minimum purchase, derived from the live rate:
 *   the swap must receive ≥ MIN_SWAP_USDC after PAJ's send fee and Paya's fee,
 *   plus a 5% cushion for rate moves, rounded up to a clean amount.
 * At ₦1,405/USDC that's ₦5,000.
 */
const MIN_SWAP_USDC = 3;
const MIN_CUSHION = 1.05;
const minCache = new Map<string, { at: number; min: number }>();

/** Round up to a "nice" amount: 4,744 → 5,000 · 448 → 450 · 40.2 → 45. */
export function roundUpNice(x: number) {
  const step = 5 * 10 ** Math.max(0, Math.floor(Math.log10(x)) - 1);
  return Math.ceil(x / step) * step;
}

/** Local currency per USDC that a buyer pays (public rate; no session needed). */
async function buyRate(currency: string) {
  return currency === "NGN" ? paj.publicNgnBuyRate() : indicativeBuyRate(currency);
}

export async function minBuy(currency: string) {
  const hit = minCache.get(currency);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.min;
  const usdcNeeded = (MIN_SWAP_USDC + PAJ_SEND_FEE_USDC) / (1 - config.FEE_PERCENT / 100);
  const min = roundUpNice(usdcNeeded * (await buyRate(currency)) * MIN_CUSHION);
  minCache.set(currency, { at: Date.now(), min });
  return min;
}
const DEADLINE_MS = 24 * 60 * 60 * 1000; // bank transfers can be slow
/**
 * PAJ's on-ramp `amount` is not what lands: on 2026-11-11 an order for
 * 1.424305 USDC delivered 1.299652 (≈0.125 USDC kept for the Solana send).
 * Assume up to this much goes missing, then quote the swap 5% lower still.
 * FLEX_INPUT swaps whatever actually arrives, so a low reference amount
 * costs the user nothing; it only lowers the minimum the deposit must reach.
 */
export const PAJ_SEND_FEE_USDC = 0.2;
const QUOTE_HEADROOM = 0.95;
/** USDC the swap can count on, from what PAJ says it will send. */
const reliableUsdc = (pajAmount: number) => Math.max(0, pajAmount - PAJ_SEND_FEE_USDC);

export type BuyPreview = {
  fiat: number;
  currency: string;
  usdc: number;
  feeUsdc: number;
  usdcNet: number;
  /** USDC PAJ keeps when it sends to Solana (estimate). */
  networkFeeUsdc: number;
  nearOut: number;
  nearMin: number;
  rate: number; // fiat per USDC
  fiatPerNear: number;
  feePercent: number;
  priceSource: "account" | "public";
  etaSeconds: number;
};

const round2 = (n: number) => Math.floor(n * 100) / 100;
const yoctoToNear = (y: string) => Number(BigInt(y) / 10n ** 18n) / 1e6;

async function usdcFor(fiat: number, currency: string, token?: string) {
  if (token) return { usdc: (await paj.onrampValue(token, fiat, currency)).amount, source: "account" as const };
  if (currency === "NGN") return { usdc: fiat / (await paj.publicNgnBuyRate()), source: "public" as const };
  return { usdc: fiat / (await indicativeBuyRate(currency)), source: "public" as const };
}

export async function previewBuy(fiat: number, currency: string, account: string, token?: string): Promise<BuyPreview> {
  await checkBuyInput(fiat, currency);
  const { usdc, source } = await usdcFor(fiat, currency, token);
  const feeUsdc = round2((usdc * config.FEE_PERCENT) / 100);
  const usdcNet = round2(reliableUsdc(usdc - feeUsdc));
  if (usdcNet <= 1) throw new Error("Amount too small");
  const q = await oneclick.buyQuote(BigInt(Math.floor(usdcNet * 1e6)), account, { dry: true });
  const nearOut = yoctoToNear(q.amountOut);
  return {
    fiat,
    currency,
    usdc: round2(usdc),
    feeUsdc,
    usdcNet,
    networkFeeUsdc: PAJ_SEND_FEE_USDC,
    nearOut,
    nearMin: q.minAmountOut ? yoctoToNear(q.minAmountOut) : nearOut,
    rate: fiat / usdc,
    fiatPerNear: fiat / nearOut,
    feePercent: config.FEE_PERCENT,
    priceSource: source,
    etaSeconds: (q.timeEstimate ?? 25) + 120, // swap + typical bank/PAJ confirmation
  };
}

export async function checkBuyInput(fiat: number, currency: string) {
  if (!BUY_CURRENCIES.includes(currency)) throw new Error(`Buying with ${currency} is coming soon`);
  const min = await minBuy(currency);
  if (fiat < min) throw new Error(`Minimum buy is ${min.toLocaleString("en-US")} ${currency}`);
}

export async function createBuy(p: { accountId: string; fiat: number; currency: string }, token: string) {
  await checkBuyInput(p.fiat, p.currency);
  const id = `buy_${crypto.randomBytes(6).toString("hex")}`;
  const { usdc } = await usdcFor(p.fiat, p.currency, token);
  const feeUsdc = round2((usdc * config.FEE_PERCENT) / 100);
  const usdcNet = round2(usdc - feeUsdc);
  const deadline = new Date(Date.now() + DEADLINE_MS);

  const base = {
    id,
    account_id: p.accountId,
    currency: p.currency,
    fiat_amount: p.fiat,
    usdc_expected: usdcNet,
    fee_usdc: feeUsdc,
    rate: p.fiat / usdc,
    deadline: deadline.toISOString(),
    payment_status: null,
    swap_status: null,
    error: null,
  };

  if (config.demo) {
    const q = await oneclick.buyQuote(BigInt(Math.floor(usdcNet * 1e6)), p.accountId, { dry: true });
    buys.insert({
      ...base,
      pay_bank: "DEMO BANK",
      pay_account_number: "0000000000",
      pay_account_name: "PAYA DEMO (no real transfer)",
      near_expected: q.amountOut,
      near_min: q.minAmountOut ?? q.amountOut,
      paj_order_id: null,
      paj_token: null,
      deposit_address: null,
      status: "awaiting_payment",
      demo: 1,
    });
    buys.event(id, "created", { simulated: true, fiat: p.fiat, currency: p.currency, usdc: usdcNet });
    log("buy", `${id} SIMULATED ${p.fiat} ${p.currency} → ${yoctoToNear(q.amountOut)} NEAR`);
    return buys.byId(id)!;
  }

  // 1. NEAR Intents deposit address on Solana that swaps whatever USDC arrives into NEAR for this user
  if (reliableUsdc(usdcNet) <= 1) throw new Error("Amount too small");
  const quoteUsdc = BigInt(Math.floor(reliableUsdc(usdcNet) * QUOTE_HEADROOM * 1e6));
  const q = await oneclick.buyQuote(quoteUsdc, p.accountId, { dry: false, deadline });
  if (!q.depositAddress) throw new Error("Swap quote returned no deposit address");

  // 2. PAJ order: the user pays fiat to PAJ, PAJ sends USDC to that address
  const order = await paj.createOnramp(token, {
    fiat: p.fiat,
    currency: p.currency,
    recipient: q.depositAddress,
    feeUsdc,
    reference: id,
  });

  // Never show payment details for an order whose USDC would fall below the swap's minimum.
  const minIn = Number(q.minAmountIn ?? q.amountIn) / 1e6;
  // Expected NEAR is priced on what will actually arrive, not on PAJ's headline amount.
  const arriving = reliableUsdc(order.amount);
  const scale = arriving / (Number(quoteUsdc) / 1e6);
  const nearExpected = (BigInt(q.amountOut) * BigInt(Math.round(scale * 1e6))) / 1_000_000n;
  const nearMin = (BigInt(q.minAmountOut ?? q.amountOut) * BigInt(Math.round(scale * 1e6))) / 1_000_000n;
  const status: BuyStatus = arriving >= minIn ? "awaiting_payment" : "failed";

  buys.insert({
    ...base,
    usdc_expected: order.amount,
    fee_usdc: order.fee ?? feeUsdc,
    rate: order.rate || base.rate,
    pay_bank: order.bank,
    pay_account_number: order.accountNumber,
    pay_account_name: order.accountName,
    near_expected: nearExpected.toString(),
    near_min: nearMin.toString(),
    paj_order_id: order.id,
    paj_token: token,
    deposit_address: q.depositAddress,
    status,
    demo: 0,
    error: status === "failed" ? `PAJ would deliver about ${arriving.toFixed(2)} USDC, below the swap minimum of ${minIn.toFixed(2)}. Don't pay this order.` : null,
  });
  buys.event(id, "created", {
    fiat: p.fiat,
    currency: p.currency,
    pajOrderId: order.id,
    usdcFromPaj: order.amount,
    intentsDepositAddress: q.depositAddress,
    swapMinUsdc: minIn,
  });
  if (status === "failed") {
    warn("buy", `${id} refused: PAJ delivers ~${arriving} < swap min ${minIn}`);
    throw new Error("We couldn't lock a safe rate for this amount. Please try again. Do not pay the previous order.");
  }
  log("buy", `${id} PAJ ${order.id}: pay ${order.fiatAmount} ${p.currency} → ${order.amount} USDC → ~${yoctoToNear(nearExpected.toString())} NEAR`);
  return buys.byId(id)!;
}

/** The user tapped "I've sent the transfer". Live: just recorded. Demo: starts the simulated settlement. */
export function markSent(id: string) {
  const b = buys.byId(id);
  if (!b) throw new Error("Unknown order");
  buys.event(id, "user_marked_sent");
  buys.update(id, { user_marked_sent: 1 });
  if (b.demo && b.status === "awaiting_payment") set(b, "converting", { payment_status: "PAID" });
  return buys.byId(id)!;
}

/** Cancel an unpaid order. We keep watching it until its deadline, so a transfer made anyway is still delivered. */
export function cancelBuy(id: string, by: "user" | "auto") {
  const b = buys.byId(id);
  if (!b) throw new Error("Unknown order");
  if (b.status !== "awaiting_payment") throw new Error("Only unpaid orders can be cancelled");
  set(b, "cancelled", { error: by === "auto" ? "No payment was confirmed, so this order was closed." : null });
  return buys.byId(id)!;
}

/** Unpaid orders nobody said they paid are closed after this long. */
const UNPAID_CLOSE_MS = 2 * 60 * 60_000;

/* ---------- watcher ---------- */

export function startBuyWatcher() {
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      for (const b of buys.active()) {
        try {
          await (b.demo ? advanceDemo(b) : advance(b));
        } catch (e) {
          const msg = (e as Error).message;
          warn("buy-watcher", `${b.id}: ${msg}`);
          // Internal hiccups (RPC, PAJ session) go to the timeline for support, not to the user.
          const last = b.events?.at(-1);
          if (!(last?.type === "watch_error" && last.detail?.message === msg)) buys.event(b.id, "watch_error", { message: msg });
        }
      }
    } finally {
      running = false;
    }
  }, config.POLL_MS);
}

async function advance(b: Buy) {
  if (Date.now() > Date.parse(b.deadline) && (b.status === "awaiting_payment" || b.status === "cancelled")) {
    if (b.status === "awaiting_payment") set(b, "expired", { error: "No payment arrived before the order expired", paj_token: null });
    else buys.update(b.id, { paj_token: null }); // window over: stop watching
    return;
  }
  if (b.status === "awaiting_payment" && !b.user_marked_sent && Date.now() - Date.parse(b.created_at) > UNPAID_CLOSE_MS) {
    cancelBuy(b.id, "auto");
    b.status = "cancelled";
  }
  // 1. has PAJ received the money and sent the USDC?
  const token = currentPajToken(b.account_id) ?? b.paj_token;
  if (b.paj_order_id && token && (b.status === "awaiting_payment" || b.status === "cancelled")) {
    const t = await paj.transaction(token, b.paj_order_id);
    if (t.status !== b.payment_status) {
      buys.update(b.id, { payment_status: t.status });
      buys.event(b.id, "payment_status", { status: t.status });
    }
    const pajTx = (t as { signature?: string }).signature;
    if (pajTx && pajTx !== b.paj_tx) buys.update(b.id, { paj_tx: pajTx });
    // Paid, even if the order had been cancelled: deliver it.
    if (t.status === "PAID" || t.status === "COMPLETED") set(b, "converting", { error: null });
  }
  // 2. has NEAR Intents swapped it into NEAR?
  if (b.status === "converting" && b.deposit_address) {
    const full = await oneclick.statusFull(b.deposit_address);
    const st = full.status;
    if (st !== b.swap_status || (full.outTx && full.outTx !== b.out_tx)) {
      buys.update(b.id, { swap_status: st, out_tx: full.outTx, intents_ref: full.correlationId });
      buys.event(b.id, "swap_status", { status: st, ...(full.outTx ? { tx: full.outTx } : {}) });
    }
    if (st === "SUCCESS") set(b, "delivered", { paj_token: null, error: null });
    else if (st === "REFUNDED") set(b, "refunded", { error: "The swap couldn't complete; the USDC is in your NEAR Intents balance", paj_token: null });
    else if (st === "FAILED") set(b, "failed", { error: "Swap failed", paj_token: null });
    else if (st === "INCOMPLETE_DEPOSIT" && b.error !== SHORT_DEPOSIT) {
      // Less USDC arrived than the swap's minimum. NEAR Intents holds it: a top-up completes the
      // swap, otherwise it's refunded to the user's NEAR Intents balance at the deadline.
      buys.update(b.id, { error: SHORT_DEPOSIT });
      buys.event(b.id, "short_deposit", { depositAddress: b.deposit_address });
      warn("buy", `${b.id} INCOMPLETE_DEPOSIT at ${b.deposit_address}`);
    }
  }
}

const SHORT_DEPOSIT =
  "Your payment arrived but came in slightly under the swap minimum. Your money is safe with NEAR Intents; our team is completing it.";

/** The account's live PAJ session: per-order tokens go stale when the user signs in again. */
function currentPajToken(address: string) {
  const u = users.byAddress(address);
  return u ? pajTokenOf(u) : null;
}

async function advanceDemo(b: Buy) {
  const age = Date.now() - Date.parse(b.updated_at);
  if (b.status === "converting" && age > 7000) set(b, "delivered", { swap_status: "SUCCESS" });
  else if (b.status === "awaiting_payment" && Date.now() > Date.parse(b.deadline)) set(b, "expired", {});
}

function set(b: Buy, status: BuyStatus, extra: Partial<Buy> = {}) {
  if (b.status === status) return;
  buys.update(b.id, { status, ...extra });
  buys.event(b.id, "status", { from: b.status, to: status, ...(extra.error ? { error: extra.error } : {}) });
  b.status = status;
  log("buy", `${b.id} → ${status}`);
}
