import crypto from "node:crypto";
import { config } from "./config.js";
import { swaps, users, type Swap, type SwapStatus } from "./db.js";
import { log, warn } from "./log.js";
import { paj, pajV2, type PajStatus, type PajV2Status } from "./paj.js";
import { round2 } from "./quote.js";
import * as rubic from "./rubic.js";
import { fromUnits, sendUsdc, solBalance, toUnits, treasuryAddress, usdcBalance, usdcReceivedIn } from "./solana.js";
import { pajTokenOf } from "./accounts.js";

/**
 * A cash-out, end to end (no NEAR Intents):
 *
 *  1. lock the best Rubic provider: NEAR → USDC, delivered to Paya's Solana wallet,
 *     refunds to the user's NEAR address
 *  2. the user's Paya address sends the NEAR to the provider's deposit address      → "swapping"
 *  3. provider delivers USDC; we read exactly how much arrived
 *  4. PAJ off-ramp order for that USDC; Paya's wallet sends PAJ the exact amount     → "paying"
 *  5. PAJ pays the bank                                                              → "paid"
 */

export type NewCashout = {
  userId: string;
  address: string; // user's Paya NEAR address
  near: number;
  currency: string;
  bankId: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  estimatedFiat: number;
};

const STUCK_AFTER_MS = 3 * 60 * 60_000; // a provider that hasn't delivered in 3 h needs a human
const CHECK_EVERY_MS = 60_000; // provider status (Rubic allows 10 calls/min)
const lastCheck = new Map<string, number>();

/** Step 1: lock a provider route and record the order. The caller sends the NEAR. */
export async function lockCashout(p: NewCashout) {
  const route = await rubic.lockBestRoute({
    from: rubic.TOKENS.NEAR,
    to: rubic.TOKENS.USDC_SOL,
    amount: p.near,
    receiver: treasuryAddress(),
    refundAddress: p.address,
    fromAddress: p.address,
    acceptExtra: false, // a plain NEAR transfer can't carry a memo
  });
  const id = `swp_${crypto.randomBytes(6).toString("hex")}`;
  const yocto = decToUnits(route.amountToSend, 24);
  swaps.insert({
    id,
    account_id: p.address,
    currency: p.currency,
    bank_id: p.bankId,
    bank_name: p.bankName,
    account_number: p.accountNumber,
    account_name: p.accountName,
    usdc_amount: route.estimate.destinationTokenAmount,
    amount_to_transfer: "0",
    fee_usdc: "0",
    rate: 0,
    fiat_amount: p.estimatedFiat, // estimate until the USDC lands and PAJ prices it
    paj_order_id: null,
    paj_token: null,
    receive_address: null,
    deposit_address: route.depositAddress,
    amount_in: yocto.toString(),
    min_amount_in: null,
    deposit_tx: null,
    status: "awaiting_deposit",
    swap_status: null,
    payout_status: null,
    payment_reference: null,
    demo: 0,
    error: null,
    rail: "rubic",
    provider: route.provider,
    rubic_id: route.rubicId,
    exchange_id: route.exchangeId,
  });
  swaps.event(id, "created", {
    near: p.near,
    provider: route.provider,
    exchangeId: route.exchangeId,
    providerDepositAddress: route.depositAddress,
    expectedUsdc: route.estimate.destinationTokenAmount,
    userId: p.userId,
  });
  log("swap", `${id} via ${route.provider}: ${p.near} NEAR → ~${route.estimate.destinationTokenAmount} USDC`);
  return { swap: swaps.byId(id)!, depositAddress: route.depositAddress, yocto };
}

/** Step 2 done: the NEAR left the user's address. */
export function recordDeposit(id: string, txHash: string) {
  const s = swaps.byId(id);
  if (!s) throw new Error("Unknown swap");
  if (s.status !== "awaiting_deposit") return s;
  swaps.update(id, { deposit_tx: txHash, status: "swapping" });
  swaps.event(id, "near_sent", { txHash });
  log("swap", `${id} NEAR sent ${txHash}`);
  return swaps.byId(id)!;
}

/** Our send failed before any NEAR moved: close the order with the reason. */
export function failSwap(id: string, message: string) {
  const s = swaps.byId(id);
  if (s) set(s, "failed", { error: message, paj_token: null });
}

/* ---------- watcher ---------- */

export function startWatcher() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const s of swaps.active()) {
        try {
          if (s.rail === "rubic") await advance(s);
          else await advanceLegacy(s);
        } catch (e) {
          const msg = (e as Error).message;
          warn("watcher", `${s.id}: ${msg}`);
          const last = s.events?.at(-1);
          if (!(last?.type === "watch_error" && last.detail?.message === msg)) swaps.event(s.id, "watch_error", { message: msg });
        }
      }
    } finally {
      running = false;
    }
  };
  setInterval(() => void tick(), config.POLL_MS);
  log("watcher", `cash-outs via Rubic, polling every ${config.POLL_MS}ms`);
}

async function advance(s: Swap) {
  const age = Date.now() - Date.parse(s.created_at);

  if (s.status === "awaiting_deposit") {
    if (age > 20 * 60_000) set(s, "expired", { error: "The NEAR was never sent, so nothing left your balance." });
    return;
  }

  if (s.status === "swapping") {
    // 3a. provider status (rate-limited)
    if (!s.usdc_received) {
      if (Date.now() - (lastCheck.get(s.id) ?? 0) < CHECK_EVERY_MS) return;
      lastCheck.set(s.id, Date.now());
      const st = await rubic.status(s.deposit_tx!, s.rubic_id!);
      if (st.status !== s.swap_status || (st.destinationTxHash && st.destinationTxHash !== s.out_tx)) {
        swaps.update(s.id, { swap_status: st.status, out_tx: st.destinationTxHash });
        swaps.event(s.id, "provider_status", { status: st.status, ...(st.destinationTxHash ? { tx: st.destinationTxHash } : {}) });
      }
      if (st.status === "REVERTED") return set(s, "refunded", { error: "The exchange couldn't complete, so your NEAR was sent back to your Paya balance." });
      if (st.status === "FAIL") return set(s, "failed", { error: "The exchange failed. Our team has the details and will sort it out." });
      if (st.status === "KYC_REQUIRED")
        return set(s, "failed", { error: "The exchange provider asked for a check on this transfer. Contact support with your Support ID." });
      if (st.status !== "SUCCESS" || !st.destinationTxHash) {
        if (age > STUCK_AFTER_MS && !s.events?.some((e) => e.type === "stuck"))
          swaps.event(s.id, "stuck", { note: "Provider hasn't delivered in 3h; contact provider with exchange id", exchangeId: s.exchange_id, provider: s.provider });
        return;
      }
      // 3b. how much USDC actually arrived
      const units = await usdcReceivedIn(st.destinationTxHash);
      if (units === null || units <= 0n) return; // tx not visible yet
      swaps.update(s.id, { usdc_received: fromUnits(units).toString() });
      swaps.event(s.id, "usdc_received", { usdc: fromUnits(units), tx: st.destinationTxHash });
      s.usdc_received = fromUnits(units).toString();
    }
    // 4. PAJ order + exact payment
    await payPaj(s);
    return;
  }

  if (s.status === "paying" && s.paj_order_id) {
    const owner = users.byAddress(s.account_id);
    const token = (owner && pajTokenOf(owner)) || s.paj_token;
    if (!token) return;
    const t = await paj.transaction(token, s.paj_order_id);
    applyPayout(s, t.status, t.signature);
  }
}

/**
 * Orders placed on NEAR Intents before the switch to Rubic: read-only status
 * until they finish or refund (NEAR Intents is no longer used for new orders).
 */
async function advanceLegacy(s: Swap) {
  if (s.status === "swapping" && s.deposit_address) {
    if (Date.now() - (lastCheck.get(s.id) ?? 0) < CHECK_EVERY_MS) return;
    lastCheck.set(s.id, Date.now());
    const r = await fetch(`https://1click.chaindefuser.com/v0/status?depositAddress=${encodeURIComponent(s.deposit_address)}`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`Legacy swap status ${r.status}`);
    const j = (await r.json()) as { status: string; swapDetails?: { destinationChainTxHashes?: { hash: string }[] } };
    const out = j.swapDetails?.destinationChainTxHashes?.[0]?.hash ?? null;
    if (j.status !== s.swap_status) {
      swaps.update(s.id, { swap_status: j.status, out_tx: out });
      swaps.event(s.id, "swap_status", { status: j.status, ...(out ? { tx: out } : {}) });
    }
    if (j.status === "SUCCESS") set(s, "paying");
    else if (j.status === "REFUNDED") set(s, "refunded", { error: "The swap couldn't complete, so your NEAR was sent back to your Paya balance." });
    else if (j.status === "FAILED") set(s, "failed", { error: "The swap failed. Our team has the details." });
    return;
  }
  if (s.status === "paying" && s.paj_order_id) {
    const t = await pajV2.transaction(s.paj_order_id);
    applyPayout(s, t.status, t.signature ?? undefined);
  }
}

async function payPaj(s: Swap) {
  if (s.payout_started) return; // never send twice; a half-finished send is resolved by hand
  const received = Number(s.usdc_received);
  // Paya's fee stays in Paya's wallet; PAJ is paid the rest and pays the bank at its live rate.
  const fee = round2((received * config.FEE_PERCENT) / 100);
  const usdc = round2(received - fee);
  const bankCode = await pajV2.bankCode(s.bank_id);
  const order = await pajV2.createOfframp({ bankCode, accountNumber: s.account_number, currency: s.currency, usdc, reference: s.id });
  if (order.amount > received) throw new Error(`PAJ asks ${order.amount} USDC but only ${received} arrived`);
  if ((await solBalance()) < 0.003) throw new Error("Paya's Solana wallet is low on SOL for fees");
  if ((await usdcBalance()) < toUnits(order.amount)) throw new Error("Paya's Solana wallet doesn't hold this USDC yet");

  swaps.update(s.id, {
    payout_started: 1,
    paj_order_id: order.id,
    receive_address: order.address,
    amount_to_transfer: String(order.amount),
    usdc_amount: usdc.toFixed(2),
    fee_usdc: fee.toFixed(2),
    rate: order.rate,
    fiat_amount: Math.floor(order.fiatAmount),
  });
  swaps.event(s.id, "paj_order", { pajOrderId: order.id, pajAddress: order.address, usdc: order.amount, fiat: order.fiatAmount, rate: order.rate, payaFeeUsdc: fee });
  const sig = await sendUsdc(order.address, toUnits(order.amount));
  swaps.update(s.id, { payout_tx: sig, status: "paying" });
  swaps.event(s.id, "usdc_sent_to_paj", { tx: sig, usdc: order.amount });
  swaps.event(s.id, "status", { from: "swapping", to: "paying" });
  log("swap", `${s.id} paid PAJ ${order.amount} USDC (${sig}) → ${order.fiatAmount} ${s.currency}; Paya fee ${fee} USDC`);
}

/** Shared by polling and webhooks. INIT → PAID (USDC received) → COMPLETED (bank paid). */
export function applyPayout(s: Swap, status: PajStatus | PajV2Status, reference?: string) {
  if (status !== s.payout_status) {
    swaps.update(s.id, { payout_status: status });
    swaps.event(s.id, "payout_status", { status, ...(reference ? { reference } : {}) });
  }
  if (status === "COMPLETED") set(s, "paid", { paj_token: null, ...(reference ? { payment_reference: reference } : {}) });
  else if (status === "ERROR") set(s, "failed", { error: "The bank payout failed. Our team has the details and will sort it out.", paj_token: null });
}

function set(s: Swap, status: SwapStatus, extra: Partial<Swap> = {}) {
  if (s.status === status) return;
  swaps.update(s.id, { status, ...extra });
  swaps.event(s.id, "status", { from: s.status, to: status, ...(extra.error ? { error: extra.error } : {}) });
  s.status = status;
  log("swap", `${s.id} → ${status}`);
}

/** "12.5" with 24 decimals → 12500000000000000000000000n, exactly (no float rounding). */
export function decToUnits(dec: string, decimals: number): bigint {
  const [whole, frac = ""] = dec.trim().split(".");
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(frac)) throw new Error(`Bad amount ${dec}`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals) || "0");
}
