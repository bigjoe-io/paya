import crypto from "node:crypto";
import { config } from "./config.js";
import { buys, type Buy, type BuyStatus } from "./db.js";
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
/** Roughly US$1.50 each: below that the swap's fixed costs eat the purchase. */
export const MIN_BUY: Record<string, number> = { NGN: 2000, GHS: 20, KES: 200, TZS: 4000, ZAR: 25 };
const DEADLINE_MS = 24 * 60 * 60 * 1000; // bank transfers can be slow
/** Quote the swap a little below the USDC we expect, so any normal delivery clears its minimum. */
const QUOTE_HEADROOM = 0.97;

export type BuyPreview = {
  fiat: number;
  currency: string;
  usdc: number;
  feeUsdc: number;
  usdcNet: number;
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
  checkBuyInput(fiat, currency);
  const { usdc, source } = await usdcFor(fiat, currency, token);
  const feeUsdc = round2((usdc * config.FEE_PERCENT) / 100);
  const usdcNet = round2(usdc - feeUsdc);
  if (usdcNet <= 1) throw new Error("Amount too small");
  const q = await oneclick.buyQuote(BigInt(Math.floor(usdcNet * 1e6)), account, { dry: true });
  const nearOut = yoctoToNear(q.amountOut);
  return {
    fiat,
    currency,
    usdc: round2(usdc),
    feeUsdc,
    usdcNet,
    nearOut,
    nearMin: q.minAmountOut ? yoctoToNear(q.minAmountOut) : nearOut,
    rate: fiat / usdc,
    fiatPerNear: fiat / nearOut,
    feePercent: config.FEE_PERCENT,
    priceSource: source,
    etaSeconds: (q.timeEstimate ?? 25) + 120, // swap + typical bank/PAJ confirmation
  };
}

export function checkBuyInput(fiat: number, currency: string) {
  if (!BUY_CURRENCIES.includes(currency)) throw new Error(`Buying with ${currency} is coming soon`);
  const min = MIN_BUY[currency] ?? 0;
  if (fiat < min) throw new Error(`Minimum buy is ${min.toLocaleString("en-US")} ${currency}`);
}

export async function createBuy(p: { accountId: string; fiat: number; currency: string }, token: string) {
  checkBuyInput(p.fiat, p.currency);
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
  const quoteUsdc = BigInt(Math.floor(usdcNet * QUOTE_HEADROOM * 1e6));
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
  const scale = order.amount / (Number(quoteUsdc) / 1e6);
  const nearExpected = (BigInt(q.amountOut) * BigInt(Math.round(scale * 1e6))) / 1_000_000n;
  const nearMin = (BigInt(q.minAmountOut ?? q.amountOut) * BigInt(Math.round(scale * 1e6))) / 1_000_000n;
  const status: BuyStatus = order.amount >= minIn ? "awaiting_payment" : "failed";

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
    error: status === "failed" ? `PAJ would send ${order.amount} USDC, below the swap minimum of ${minIn.toFixed(2)}. Don't pay this order.` : null,
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
    warn("buy", `${id} refused: PAJ amount ${order.amount} < swap min ${minIn}`);
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
  if (b.demo && b.status === "awaiting_payment") set(b, "converting", { payment_status: "PAID" });
  return buys.byId(id)!;
}

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
          if (msg !== b.error) {
            buys.update(b.id, { error: msg });
            buys.event(b.id, "error", { message: msg });
          }
        }
      }
    } finally {
      running = false;
    }
  }, config.POLL_MS);
}

async function advance(b: Buy) {
  if (Date.now() > Date.parse(b.deadline) && b.status === "awaiting_payment") {
    set(b, "expired", { error: "No payment arrived before the order expired", paj_token: null });
    return;
  }
  // 1. has PAJ received the money and sent the USDC?
  if (b.paj_order_id && b.paj_token && b.status === "awaiting_payment") {
    const t = await paj.transaction(b.paj_token, b.paj_order_id);
    if (t.status !== b.payment_status) {
      buys.update(b.id, { payment_status: t.status });
      buys.event(b.id, "payment_status", { status: t.status });
    }
    if (t.status === "PAID" || t.status === "COMPLETED") set(b, "converting");
  }
  // 2. has NEAR Intents swapped it into NEAR?
  if (b.status === "converting" && b.deposit_address) {
    const st = await oneclick.status(b.deposit_address);
    if (st !== b.swap_status) {
      buys.update(b.id, { swap_status: st });
      buys.event(b.id, "swap_status", { status: st });
    }
    if (st === "SUCCESS") set(b, "delivered", { paj_token: null });
    else if (st === "REFUNDED") set(b, "refunded", { error: "The swap couldn't complete; the USDC is in your NEAR Intents balance", paj_token: null });
    else if (st === "FAILED") set(b, "failed", { error: "Swap failed", paj_token: null });
  }
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
