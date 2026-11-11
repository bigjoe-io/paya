import crypto from "node:crypto";
import { config } from "./config.js";
import { swaps, users, type Swap, type SwapStatus } from "./db.js";
import { pajTokenOf } from "./accounts.js";
import { log, warn } from "./log.js";
import { oneclick } from "./oneclick.js";
import { paj, type PajStatus } from "./paj.js";
import { DRY_RECIPIENT, MIN_CASHOUT_USDC, minCashoutNear, sizePayout } from "./quote.js";

/**
 * A cash-out, end to end:
 *
 *  1. createSwap   dry 1Click quote (X NEAR → Y USDC) → size the payout A
 *                  PAJ off-ramp order for A USDC → deposit address + exact amount T
 *                  1Click EXACT_OUTPUT: deliver exactly T USDC to that address
 *                  → depositAddress + amountIn NEAR
 *  2. the user's Paya address wraps amountIn NEAR and sends wNEAR to depositAddress
 *  3. watcher      1Click SUCCESS → PAJ PAID → COMPLETED → paid
 *
 * The NEAR moves: user's Paya address → Intents → USDC → PAJ → bank.
 */

export type NewSwap = {
  accountId: string;
  near: number;
  currency: string;
  bankId: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
};

export async function createSwap(p: NewSwap, pajToken: string) {
  const id = `swp_${crypto.randomBytes(6).toString("hex")}`;
  const yocto = BigInt(Math.round(p.near * 1e6)) * 10n ** 18n;

  // 1. what this NEAR is worth in USDC, and the payout sized inside it
  const dry = await oneclick.previewExactIn(yocto, p.accountId, DRY_RECIPIENT);
  const { usdc, fee } = sizePayout(Number(dry.amountOut) / 1e6);
  if (usdc < MIN_CASHOUT_USDC) throw new Error(`Minimum cash-out is ${await minCashoutNear()} NEAR`);

  const base = {
    id,
    account_id: p.accountId,
    currency: p.currency,
    bank_id: p.bankId,
    bank_name: p.bankName,
    account_number: p.accountNumber,
    account_name: p.accountName,
    usdc_amount: usdc.toFixed(2),
    fee_usdc: fee.toFixed(2),
    swap_status: null,
    payout_status: null,
    payment_reference: null,
    deposit_tx: null,
    error: null,
  };

  if (config.demo) {
    const v = await paj.offrampValue(pajToken, usdc, p.currency);
    swaps.insert({
      ...base,
      amount_to_transfer: (usdc + fee).toFixed(2),
      rate: v.fiatAmount / usdc,
      fiat_amount: Math.floor(v.fiatAmount),
      paj_order_id: null,
      paj_token: null,
      receive_address: null,
      deposit_address: null,
      amount_in: dry.amountIn,
      min_amount_in: dry.amountIn,
      status: "awaiting_deposit",
      demo: 1,
    });
    swaps.event(id, "created", { simulated: true, near: p.near, usdc, fiat: Math.floor(v.fiatAmount), currency: p.currency });
    log("swap", `${id} SIMULATED ${p.near} NEAR → ${usdc} USDC → ${Math.floor(v.fiatAmount)} ${p.currency}`);
    return { swap: swaps.byId(id)!, deposit: null };
  }

  // 2. PAJ order: where the USDC goes and exactly how much
  const order = await paj.createOfframp(pajToken, {
    bankId: p.bankId,
    accountNumber: p.accountNumber,
    currency: p.currency,
    usdc,
    feeUsdc: fee,
    reference: id,
  });
  const tUnits = BigInt(Math.round(order.amount * 1e6));

  // 3. 1Click: deliver exactly that USDC to PAJ; any unused NEAR is refunded to the user
  const q = await oneclick.exactOut(tUnits, order.address, p.accountId);
  if (!q.depositAddress) throw new Error("Swap quote returned no deposit address");

  swaps.insert({
    ...base,
    amount_to_transfer: String(order.amount),
    fee_usdc: String(order.fee ?? fee),
    rate: order.rate,
    fiat_amount: Math.floor(order.fiatAmount),
    paj_order_id: order.id,
    paj_token: pajToken,
    receive_address: order.address,
    deposit_address: q.depositAddress,
    amount_in: q.amountIn,
    min_amount_in: q.minAmountIn ?? q.amountIn,
    status: "awaiting_deposit",
    demo: 0,
  });
  swaps.event(id, "created", {
    near: p.near,
    amountInYocto: q.amountIn,
    usdc: order.amount,
    fiat: order.fiatAmount,
    currency: p.currency,
    rate: order.rate,
    pajOrderId: order.id,
    pajDepositAddress: order.address,
    intentsDepositAddress: q.depositAddress,
  });
  log("swap", `${id} PAJ ${order.id}: ${Number(q.amountIn) / 1e24} NEAR → ${order.amount} USDC → ${order.fiatAmount} ${p.currency}`);
  return { swap: swaps.byId(id)!, deposit: { depositAddress: q.depositAddress, amountYocto: q.amountIn } };
}

/** The wallet broadcast its transaction. */
export async function recordDeposit(id: string, txHash: string) {
  const s = swaps.byId(id);
  if (!s) throw new Error("Unknown swap");
  if (s.status !== "awaiting_deposit") return s;
  swaps.update(id, { deposit_tx: txHash, status: "swapping" });
  swaps.event(id, "wallet_sent", { txHash });
  if (!s.demo && s.deposit_address) await oneclick.submitDeposit(s.deposit_address, txHash);
  log("swap", `${id} deposit ${txHash}`);
  return swaps.byId(id)!;
}

/** Our signing step failed before any NEAR moved: close the order with the reason. */
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
          await (s.demo ? advanceDemo(s) : advance(s));
        } catch (e) {
          warn("watcher", `${s.id}: ${(e as Error).message}`);
          if ((e as Error).message !== s.error) swaps.event(s.id, "error", { message: (e as Error).message });
          swaps.update(s.id, { error: (e as Error).message });
        }
      }
    } finally {
      running = false;
    }
  };
  setInterval(() => void tick(), config.POLL_MS);
  log("watcher", `polling every ${config.POLL_MS}ms (${config.demo ? "orders simulated" : "LIVE orders"})`);
}

async function advance(s: Swap) {
  if (s.status === "awaiting_deposit") {
    if (Date.now() - Date.parse(s.created_at) > 20 * 60_000) set(s, "expired", { error: "No deposit was sent" });
    return;
  }
  if (s.status === "swapping" && s.deposit_address) {
    const st = await oneclick.status(s.deposit_address);
    if (st !== s.swap_status) {
      swaps.update(s.id, { swap_status: st });
      swaps.event(s.id, "swap_status", { status: st });
    }
    if (st === "SUCCESS") set(s, "paying");
    else if (st === "REFUNDED") set(s, "refunded", { error: "The swap couldn't complete; your NEAR was returned to your Paya balance" });
    else if (st === "FAILED" || st === "INCOMPLETE_DEPOSIT") set(s, "failed", { error: `Swap ${st.toLowerCase()}` });
    return;
  }
  const owner = users.byAddress(s.account_id);
  const token = (owner && pajTokenOf(owner)) || s.paj_token;
  if (s.status === "paying" && s.paj_order_id && token) {
    const t = await paj.transaction(token, s.paj_order_id);
    applyPayout(s, t.status, t.signature);
  }
}

/** Shared by polling and webhooks. INIT → PAID (USDC received) → COMPLETED (bank paid). */
export function applyPayout(s: Swap, status: PajStatus, reference?: string) {
  if (status !== s.payout_status) {
    swaps.update(s.id, { payout_status: status });
    swaps.event(s.id, "payout_status", { status, ...(reference ? { reference } : {}) });
  }
  if (status === "COMPLETED") set(s, "paid", { paj_token: null, ...(reference ? { payment_reference: reference } : {}) });
}

async function advanceDemo(s: Swap) {
  const age = Date.now() - Date.parse(s.updated_at);
  if (s.status === "swapping" && age > 6000) set(s, "paying", { swap_status: "SUCCESS" });
  else if (s.status === "paying" && age > 6000)
    set(s, "paid", { payout_status: "COMPLETED", payment_reference: `SIM-${s.id.slice(-6).toUpperCase()}` });
  else if (s.status === "awaiting_deposit" && Date.now() - Date.parse(s.created_at) > 20 * 60_000)
    set(s, "expired", { error: "Not confirmed" });
}

function set(s: Swap, status: SwapStatus, extra: Partial<Swap> = {}) {
  if (s.status === status) return;
  swaps.update(s.id, { status, ...extra });
  swaps.event(s.id, "status", { from: s.status, to: status, ...(extra.error ? { error: extra.error } : {}) });
  s.status = status;
  log("swap", `${s.id} → ${status}`);
}
