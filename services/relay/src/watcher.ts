import crypto from "node:crypto";
import { config } from "./config.js";
import { orders, users, type Order } from "./db.js";
import { fossapay } from "./fossapay.js";
import { log, warn } from "./log.js";
import { near } from "./near.js";
import { oneclick, oneclickSim } from "./oneclick.js";
import { getRates } from "./rate.js";
import { nearToYocto, settle } from "./pricing.js";

/**
 * The loop that makes "send NEAR, get naira" automatic.
 *
 *   tick ─▶ find deposit accounts holding ≥ MIN_CASHOUT ─▶ create order
 *        ─▶ created:    quote 1Click, forward NEAR on-chain        → swapping
 *        ─▶ swapping:   poll 1Click; SUCCESS → price in naira, pay → paying
 *        ─▶ paying:     poll the rail (or webhook)                 → paid
 *
 * Every step is idempotent: a crash mid-step is retried on the next tick.
 */
let running = false;

export function startWatcher() {
  log("watcher", `started (poll ${config.POLL_MS}ms, swap ${config.simulateSwap ? "SIMULATED" : "live"}, payout ${config.simulatePayout ? "SIMULATED" : "live"})`);
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await detectDeposits();
      await Promise.all([advance("created", startSwap), advance("swapping", trackSwap), advance("paying", trackPayout)]);
    } catch (e) {
      warn("watcher", `tick failed: ${(e as Error).message}`);
    } finally {
      running = false;
    }
  };
  void tick();
  setInterval(() => void tick(), config.POLL_MS);
}

/* ---------- 1. detect ---------- */

async function detectDeposits() {
  const min = nearToYocto(config.MIN_CASHOUT_NEAR);
  const backoffSince = new Date(Date.now() - 15 * 60_000).toISOString();

  for (const u of users.readyForCashout()) {
    if (!u.deposit_account) continue;
    if (orders.activeForUser(u.id)) continue;
    if (orders.recentFailures(u.id, backoffSince) >= 3) {
      warn("watcher", `${u.id}: 3 failures in 15 min, backing off`);
      continue;
    }

    // The contract is the authority on what can leave: its view already
    // subtracts storage and its own reserve.
    const available = await near.available(u.deposit_account);
    if (available < min) continue;

    const id = `ord_${crypto.randomBytes(6).toString("hex")}`;
    orders.insert({
      id,
      user_id: u.id,
      deposit_account: u.deposit_account,
      near_yocto: available.toString(),
      simulated: config.simulateSwap || config.simulatePayout ? 1 : 0,
    });
    log("watcher", `new order ${id}: ${Number(available) / 1e24} NEAR in ${u.deposit_account}`);
  }
}

/* ---------- 2. swap ---------- */

async function startSwap(o: Order) {
  const amount = BigInt(o.near_yocto);
  let quote;
  if (config.simulateSwap) {
    quote = oneclickSim.quote(amount, (await getRates()).usdPerNear);
  } else {
    if (!config.SOLANA_USDC_RECIPIENT) throw new Error("SOLANA_USDC_RECIPIENT is not set");
    quote = await oneclick.quote(amount, config.SOLANA_USDC_RECIPIENT, o.deposit_account);
  }
  orders.update(o.id, {
    status: "forwarding",
    oneclick_deposit_address: quote.depositAddress,
    oneclick_quote: JSON.stringify(quote),
  });

  // On testnet there is no 1Click deposit address to send to; forward to the
  // operator so the on-chain movement is still real and visible.
  const to = config.simulateSwap ? config.OPERATOR_ACCOUNT_ID : quote.depositAddress;
  // Forward exactly what was quoted; if the balance moved, the contract
  // rejects it and the next tick re-quotes.
  const tx = await near.forward(o.deposit_account, to, BigInt(quote.amountIn), o.id);
  if (!config.simulateSwap) await oneclick.submitDeposit(quote.depositAddress, tx);
  orders.update(o.id, { status: "swapping", forward_tx: tx });
  log("watcher", `${o.id} forwarded → ${to} (${tx})`);
}

async function trackSwap(o: Order) {
  const addr = o.oneclick_deposit_address!;
  const s = config.simulateSwap ? oneclickSim.status(addr) : await oneclick.status(addr);
  if (s.status === "SUCCESS" && s.amountOut) {
    const usdc = Number(s.amountOut) / 1e6;
    const rates = await getRates();
    const priced = await settle(usdc, rates.ngnPerUsdc);
    orders.update(o.id, {
      usdc_out: usdc.toFixed(6),
      rate_ngn: rates.ngnPerUsdc,
      rail_fee_ngn: priced.railFeeNgn,
      margin_ngn: priced.marginNgn,
      ngn_amount: priced.netNgn,
    });
    await pay({ ...o, usdc_out: usdc.toFixed(6), ngn_amount: priced.netNgn });
    return;
  }
  if (s.status === "REFUNDED" || s.status === "FAILED" || s.status === "INCOMPLETE_DEPOSIT") {
    orders.update(o.id, { status: s.status === "REFUNDED" ? "refunded" : "failed", error: `swap ${s.status}` });
    warn("watcher", `${o.id} swap ${s.status}`);
  }
}

/* ---------- 3. pay ---------- */

async function pay(o: Order) {
  const u = users.byId(o.user_id);
  if (!u?.bank_code || !u.bank_name || !u.account_number || !u.account_name) {
    orders.update(o.id, { status: "failed", error: "no bank account on file" });
    return;
  }
  if (!o.ngn_amount || o.ngn_amount < 100) {
    orders.update(o.id, { status: "failed", error: `naira amount too small (${o.ngn_amount})` });
    return;
  }
  const reference = `PAYA-${o.id.replace("ord_", "").toUpperCase()}`;
  const p = await fossapay.createPayout({
    reference,
    amountNgn: o.ngn_amount,
    bankCode: u.bank_code,
    bankName: u.bank_name,
    accountName: u.account_name,
    accountNumber: u.account_number,
    remarks: "Paya cash out",
    metadata: { orderId: o.id, depositAccount: o.deposit_account },
  });
  orders.update(o.id, {
    status: p.status === "completed" ? "paid" : "paying",
    payout_id: p.payoutId,
    payout_reference: reference,
  });
  log("watcher", `${o.id} payout ${p.payoutId} ₦${o.ngn_amount} (${p.status})`);
}

async function trackPayout(o: Order) {
  if (!o.payout_id) return;
  const s = await fossapay.payoutStatus(o.payout_id);
  if (s === "completed") {
    orders.update(o.id, { status: "paid" });
    log("watcher", `${o.id} PAID ₦${o.ngn_amount}`);
  } else if (s === "failed" || s === "reversed") {
    orders.update(o.id, { status: "failed", error: `payout ${s}` });
    warn("watcher", `${o.id} payout ${s} — USDC is held; refund manually`);
  }
}

/* ---------- helpers ---------- */

async function advance(status: Order["status"], step: (o: Order) => Promise<void>) {
  for (const o of orders.byStatus(status)) {
    try {
      await step(o);
    } catch (e) {
      const msg = (e as Error).message;
      warn("watcher", `${o.id} ${status}: ${msg}`);
      // Only "created" is safe to fail hard (nothing has moved yet). Later
      // states keep retrying because money is in flight.
      if (status === "created") orders.update(o.id, { status: "failed", error: msg });
      else orders.update(o.id, { error: msg });
    }
  }
}

/** Called by the webhook route so payouts settle without waiting for a poll. */
export function onPayoutEvent(reference: string, status: "completed" | "failed" | "reversed") {
  const o = orders.byPayoutReference(reference);
  if (!o) return;
  if (status === "completed") orders.update(o.id, { status: "paid" });
  else orders.update(o.id, { status: "failed", error: `payout ${status}` });
  log("webhook", `${o.id} payout ${status}`);
}
