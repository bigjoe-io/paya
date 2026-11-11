import crypto from "node:crypto";
import { config } from "./config.js";
import { buys, users, type Buy, type BuyStatus } from "./db.js";
import { pajTokenOf } from "./accounts.js";
import { log, warn } from "./log.js";
import { COUNTRY, paj } from "./paj.js";
import { indicativeBuyRate } from "./fx.js";
import { round2 } from "./quote.js";
import * as rubic from "./rubic.js";
import { fromUnits, sendUsdc, solBalance, toUnits, treasuryAddress, usdcBalance, usdcReceivedIn } from "./solana.js";
import { decToUnits } from "./swaps.js";

/**
 * Buy: local currency → NEAR in the user's Paya address (no NEAR Intents).
 *
 *   user ──bank transfer──▶ PAJ ──USDC (Solana)──▶ Paya's Solana wallet
 *        ──best Rubic provider (ChangeNOW, SimpleSwap, …)──▶ NEAR at the user's Paya address
 *
 * We act on the USDC that actually arrived. If a provider can't complete, it
 * refunds the USDC to Paya's wallet and we retry with a different provider.
 */
export const BUY_CURRENCIES = Object.keys(COUNTRY);

/** Smallest purchase: providers' fixed costs make anything below ~5 USDC poor value. */
const MIN_BUY_USDC = 5;
/** PAJ has kept up to ~0.125 USDC when sending on Solana; assume 0.2 for estimates. */
export const PAJ_SEND_FEE_USDC = 0.2;
const MAX_ATTEMPTS = 3;
const CHECK_EVERY_MS = 60_000;
const DEADLINE_MS = 24 * 60 * 60 * 1000;
const UNPAID_CLOSE_MS = 2 * 60 * 60_000;
const lastCheck = new Map<string, number>();

/** Round up to a "nice" amount: 7,744 → 8,000 · 448 → 450 · 40.2 → 45. */
export function roundUpNice(x: number) {
  const step = 5 * 10 ** Math.max(0, Math.floor(Math.log10(x)) - 1);
  return Math.ceil(x / step) * step;
}

async function buyRate(currency: string) {
  return currency === "NGN" ? paj.publicNgnBuyRate() : indicativeBuyRate(currency);
}

const minCache = new Map<string, { at: number; min: number }>();
export async function minBuy(currency: string) {
  const hit = minCache.get(currency);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.min;
  const usdcNeeded = (MIN_BUY_USDC + PAJ_SEND_FEE_USDC) / (1 - config.FEE_PERCENT / 100);
  const min = roundUpNice(usdcNeeded * (await buyRate(currency)) * 1.05);
  minCache.set(currency, { at: Date.now(), min });
  return min;
}

export type BuyPreview = {
  fiat: number;
  currency: string;
  usdc: number;
  feeUsdc: number;
  usdcNet: number;
  networkFeeUsdc: number;
  nearOut: number;
  nearMin: number;
  rate: number; // fiat per USDC
  fiatPerNear: number;
  feePercent: number;
  priceSource: "account" | "public";
  etaSeconds: number;
  provider: string;
};

async function usdcFor(fiat: number, currency: string, token?: string) {
  if (token) return { usdc: (await paj.onrampValue(token, fiat, currency)).amount, source: "account" as const };
  if (currency === "NGN") return { usdc: fiat / (await paj.publicNgnBuyRate()), source: "public" as const };
  return { usdc: fiat / (await indicativeBuyRate(currency)), source: "public" as const };
}

/* NEAR for X USDC: cached Rubic quotes; spare-capacity only, else scale the nearest recent quote. */
type Point = { usdc: number; near: number; at: number; provider: string; minutes: number };
const points: Point[] = [];
async function nearFor(usdc: number) {
  const fresh = points.find((p) => Math.abs(p.usdc - usdc) / usdc < 0.01 && Date.now() - p.at < 60_000);
  if (fresh) return fresh;
  if (rubic.spareCapacity() > 3 || points.length === 0) {
    const { routes, smallestMin } = await rubic.quote(rubic.TOKENS.USDC_SOL, rubic.TOKENS.NEAR, usdc);
    const best = routes[0];
    if (!best) throw new Error(smallestMin ? `Amount too small (minimum about ${smallestMin} USDC)` : "Rates are unavailable right now. Try again in a minute.");
    const p = { usdc, near: Number(best.estimate.destinationTokenAmount), at: Date.now(), provider: best.providerType, minutes: best.estimate.durationInMinutes || 4 };
    points.unshift(p);
    points.splice(40);
    return p;
  }
  const n = [...points].sort((a, b) => Math.abs(Math.log(a.usdc / usdc)) - Math.abs(Math.log(b.usdc / usdc)))[0];
  return { ...n, near: (n.near / n.usdc) * usdc };
}

export async function previewBuy(fiat: number, currency: string, _account: string, token?: string): Promise<BuyPreview> {
  await checkBuyInput(fiat, currency);
  const { usdc, source } = await usdcFor(fiat, currency, token);
  const feeUsdc = round2((usdc * config.FEE_PERCENT) / 100);
  const usdcNet = round2(usdc - feeUsdc - PAJ_SEND_FEE_USDC);
  if (usdcNet < MIN_BUY_USDC * 0.9) throw new Error("Amount too small");
  const q = await nearFor(usdcNet);
  return {
    fiat,
    currency,
    usdc: round2(usdc),
    feeUsdc,
    usdcNet,
    networkFeeUsdc: PAJ_SEND_FEE_USDC,
    nearOut: q.near,
    nearMin: q.near * 0.97,
    rate: fiat / usdc,
    fiatPerNear: fiat / q.near,
    feePercent: config.FEE_PERCENT,
    priceSource: source,
    etaSeconds: (q.minutes + 3) * 60, // PAJ confirmation + provider
    provider: q.provider,
  };
}

export async function checkBuyInput(fiat: number, currency: string) {
  if (!BUY_CURRENCIES.includes(currency)) throw new Error(`Buying with ${currency} is coming soon`);
  const min = await minBuy(currency);
  if (fiat < min) throw new Error(`Minimum buy is ${min.toLocaleString("en-US")} ${currency}`);
}

const yoctoOf = (near: number) => decToUnits(near.toFixed(6), 24).toString();

export async function createBuy(p: { accountId: string; fiat: number; currency: string }, token: string) {
  if (config.demo) throw new Error("Purchases are switched off on this server (LIVE_ORDERS=false)");
  if ((await solBalance().catch(() => 0)) < 0.004) throw new Error("Purchases are paused for a few minutes for maintenance. Please try again shortly.");
  const est = await previewBuy(p.fiat, p.currency, p.accountId, token);
  const id = `buy_${crypto.randomBytes(6).toString("hex")}`;

  // PAJ order: the user pays fiat to PAJ, PAJ sends USDC to Paya's Solana wallet.
  const order = await paj.createOnramp(token, {
    fiat: p.fiat,
    currency: p.currency,
    recipient: treasuryAddress(),
    feeUsdc: est.feeUsdc,
    reference: id,
  });
  buys.insert({
    id,
    account_id: p.accountId,
    currency: p.currency,
    fiat_amount: p.fiat,
    usdc_expected: order.amount,
    fee_usdc: order.fee ?? est.feeUsdc,
    rate: order.rate || est.rate,
    deadline: new Date(Date.now() + DEADLINE_MS).toISOString(),
    payment_status: null,
    swap_status: null,
    error: null,
    pay_bank: order.bank,
    pay_account_number: order.accountNumber,
    pay_account_name: order.accountName,
    near_expected: yoctoOf(est.nearOut),
    near_min: yoctoOf(est.nearMin),
    paj_order_id: order.id,
    paj_token: token,
    deposit_address: null,
    status: "awaiting_payment",
    demo: 0,
    rail: "rubic",
    tried_providers: [],
  });
  buys.event(id, "created", { fiat: p.fiat, currency: p.currency, pajOrderId: order.id, usdcFromPaj: order.amount, payaWallet: treasuryAddress(), estimatedNear: est.nearOut });
  log("buy", `${id} PAJ ${order.id}: pay ${order.fiatAmount} ${p.currency} → ${order.amount} USDC → ~${est.nearOut} NEAR`);
  return buys.byId(id)!;
}

/** The user tapped "I've sent the money". */
export function markSent(id: string) {
  const b = buys.byId(id);
  if (!b) throw new Error("Unknown order");
  buys.event(id, "user_marked_sent");
  buys.update(id, { user_marked_sent: 1 });
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

/* ---------- watcher ---------- */

export function startBuyWatcher() {
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      for (const b of buys.active()) {
        if (b.rail !== "rubic") continue; // legacy NEAR Intents orders are final
        try {
          await advance(b);
        } catch (e) {
          const msg = (e as Error).message;
          warn("buy-watcher", `${b.id}: ${msg}`);
          const last = b.events?.at(-1);
          if (!(last?.type === "watch_error" && last.detail?.message === msg)) buys.event(b.id, "watch_error", { message: msg });
        }
      }
    } finally {
      running = false;
    }
  }, config.POLL_MS);
}

const currentPajToken = (address: string) => {
  const u = users.byAddress(address);
  return u ? pajTokenOf(u) : null;
};

async function advance(b: Buy) {
  // 1. unpaid orders: close after the deadline / 2 h without "I've sent it"
  if (Date.now() > Date.parse(b.deadline) && (b.status === "awaiting_payment" || b.status === "cancelled")) {
    if (b.status === "awaiting_payment") set(b, "expired", { error: "No payment arrived before the order expired", paj_token: null });
    else buys.update(b.id, { paj_token: null });
    return;
  }
  if (b.status === "awaiting_payment" && !b.user_marked_sent && Date.now() - Date.parse(b.created_at) > UNPAID_CLOSE_MS) {
    cancelBuy(b.id, "auto");
    b.status = "cancelled";
  }

  // 2. has PAJ received the money and sent the USDC?
  if (b.status === "awaiting_payment" || b.status === "cancelled" || (b.status === "converting" && !b.paj_tx)) {
    const token = currentPajToken(b.account_id) ?? b.paj_token;
    if (!b.paj_order_id || !token) return;
    const t = await paj.transaction(token, b.paj_order_id);
    if (t.status !== b.payment_status) {
      buys.update(b.id, { payment_status: t.status });
      buys.event(b.id, "payment_status", { status: t.status });
    }
    if (t.signature && t.signature !== b.paj_tx) {
      buys.update(b.id, { paj_tx: t.signature });
      b.paj_tx = t.signature;
    }
    if ((t.status === "PAID" || t.status === "COMPLETED") && b.status !== "converting") set(b, "converting", { error: null });
    if (b.status !== "converting") return;
  }

  if (b.status !== "converting") return;

  // 3. how much USDC actually reached Paya's wallet
  if (!b.usdc_received) {
    if (!b.paj_tx) return; // waiting for PAJ's Solana signature
    const units = await usdcReceivedIn(b.paj_tx);
    if (units === null || units <= 0n) return;
    buys.update(b.id, { usdc_received: fromUnits(units).toString() });
    buys.event(b.id, "usdc_received", { usdc: fromUnits(units), tx: b.paj_tx });
    b.usdc_received = fromUnits(units).toString();
  }

  // 4. send it to the best provider (again, after a refund)
  if (!b.swap_tx) {
    if (b.retry_after && Date.now() < Date.parse(b.retry_after)) return;
    const tried = b.tried_providers ?? [];
    if (tried.length >= MAX_ATTEMPTS) {
      return set(b, "failed", { error: "We couldn't complete this purchase. Your money is safe with Paya; our team will finish it or refund you." });
    }
    const usdc = Number(b.usdc_received);
    if ((await usdcBalance()) < toUnits(usdc)) throw new Error("Waiting for the USDC (or a provider refund) to reach Paya's wallet");
    if ((await solBalance()) < 0.003) throw new Error("Paya's Solana wallet is low on SOL for fees");
    const route = await rubic.lockBestRoute({
      from: rubic.TOKENS.USDC_SOL,
      to: rubic.TOKENS.NEAR,
      amount: usdc,
      receiver: b.account_id,
      refundAddress: treasuryAddress(),
      fromAddress: treasuryAddress(),
      acceptExtra: true, // Solana transfers can carry a memo
      exclude: tried,
    });
    const units = decToUnits(route.amountToSend, 6);
    if (units > toUnits(usdc)) throw new Error(`Provider asks ${route.amountToSend} USDC but only ${usdc} arrived`);
    // Record the attempt before sending, so a crash can never send twice.
    buys.update(b.id, { provider: route.provider, rubic_id: route.rubicId, deposit_address: route.depositAddress, tried_providers: [...tried, route.provider], swap_status: null });
    buys.event(b.id, "provider_locked", { provider: route.provider, exchangeId: route.exchangeId, depositAddress: route.depositAddress, usdc: route.amountToSend, expectedNear: route.estimate.destinationTokenAmount });
    const sig = await sendUsdc(route.depositAddress, units, route.extraFields?.value);
    buys.update(b.id, { swap_tx: sig, near_expected: yoctoOf(Number(route.estimate.destinationTokenAmount)), near_min: yoctoOf(Number(route.estimate.destinationTokenMinAmount)) });
    buys.event(b.id, "usdc_sent_to_provider", { tx: sig, provider: route.provider });
    log("buy", `${b.id} ${usdc} USDC → ${route.provider} (${sig})`);
    return;
  }

  // 5. has the provider delivered the NEAR?
  if (Date.now() - (lastCheck.get(b.id) ?? 0) < CHECK_EVERY_MS) return;
  lastCheck.set(b.id, Date.now());
  const st = await rubic.status(b.swap_tx, b.rubic_id!);
  if (st.status !== b.swap_status || (st.destinationTxHash && st.destinationTxHash !== b.out_tx)) {
    buys.update(b.id, { swap_status: st.status, out_tx: st.destinationTxHash });
    buys.event(b.id, "provider_status", { status: st.status, ...(st.destinationTxHash ? { tx: st.destinationTxHash } : {}) });
  }
  if (st.status === "SUCCESS") return set(b, "delivered", { paj_token: null, error: null });
  if (st.status === "REVERTED" || st.status === "FAIL" || st.status === "KYC_REQUIRED") {
    // The provider returns the USDC to Paya's wallet; try another one once it's back.
    buys.update(b.id, { swap_tx: null, rubic_id: null, retry_after: new Date(Date.now() + 10 * 60_000).toISOString() });
    buys.event(b.id, "provider_failed", { provider: b.provider, status: st.status });
    warn("buy", `${b.id} ${b.provider} ${st.status}; will retry with another provider`);
  }
}

function set(b: Buy, status: BuyStatus, extra: Partial<Buy> = {}) {
  if (b.status === status) return;
  buys.update(b.id, { status, ...extra });
  buys.event(b.id, "status", { from: b.status, to: status, ...(extra.error ? { error: extra.error } : {}) });
  b.status = status;
  log("buy", `${b.id} → ${status}`);
}
