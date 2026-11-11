import { config } from "./config.js";
import { pajV2 } from "./paj.js";
import { quote as rubicQuote, spareCapacity, TOKENS } from "./rubic.js";

/**
 * Pricing for "X NEAR → local currency".
 *
 *   NEAR ──Rubic provider (ChangeNOW, SimpleSwap, …)──▶ USDC in Paya's Solana wallet ──PAJ──▶ bank
 *
 * The USDC amount is what the best provider quotes right now; the payout is
 * sized on the USDC that actually arrives, so the preview is an estimate.
 * Rubic's free API allows 10 calls a minute, so previews use cached quotes
 * and, when the budget is tight, the last known rate for a similar size.
 */
export const round2 = (n: number) => Math.floor(n * 100) / 100;

/** Smallest payout worth making (USDC), and the smallest sell. */
export const MIN_CASHOUT_USDC = 2.5;
export const MIN_SELL_NEAR = 1;

type Point = { near: number; usdc: number; at: number; provider: string; minutes: number };
const points: Point[] = []; // recent quotes, for estimates when we can't spend a call

/** USDC the best provider gives for `near` NEAR now (cached ~60 s). */
export async function sellQuote(near: number): Promise<{ usdc: number; provider: string; minutes: number; estimated: boolean }> {
  const fresh = points.find((p) => Math.abs(p.near - near) / near < 0.01 && Date.now() - p.at < 60_000);
  if (fresh) return { usdc: fresh.usdc, provider: fresh.provider, minutes: fresh.minutes, estimated: false };
  if (spareCapacity() > 3 || points.length === 0) {
    const { routes, smallestMin } = await rubicQuote(TOKENS.NEAR, TOKENS.USDC_SOL, near);
    const best = routes[0];
    if (!best) throw new Error(smallestMin ? `Minimum cash-out is about ${Math.ceil(smallestMin * 100) / 100} NEAR` : "Rates are unavailable right now. Try again in a minute.");
    const p = { near, usdc: Number(best.estimate.destinationTokenAmount), at: Date.now(), provider: best.providerType, minutes: best.estimate.durationInMinutes || 4 };
    points.unshift(p);
    points.splice(40);
    return { usdc: p.usdc, provider: p.provider, minutes: p.minutes, estimated: false };
  }
  // Out of spare calls: scale the nearest recent quote (providers charge ~a fixed fee + a %; nearest size keeps that honest).
  const near0 = [...points].sort((a, b) => Math.abs(Math.log(a.near / near)) - Math.abs(Math.log(b.near / near)))[0];
  return { usdc: (near0.usdc / near0.near) * near, provider: near0.provider, minutes: near0.minutes, estimated: true };
}

export async function minCashoutNear() {
  return MIN_SELL_NEAR;
}

export type Preview = {
  nearIn: number;
  usdcOut: number; // what the exchange provider delivers
  usdcPayout: number; // what PAJ pays out on (after Paya's fee, which Paya keeps)
  feeUsdc: number;
  feePercent: number;
  rate: number; // local currency per USDC
  fiatOut: number;
  fiatPerNear: number;
  currency: string;
  /** "account": priced for this user by PAJ; "public": indicative rate before sign-in. */
  priceSource: "account" | "public";
  etaSeconds: number;
  provider: string;
};

export async function preview(nearIn: number, currency: string, _refundTo?: string, _token?: string): Promise<Preview> {
  if (!(await pajV2.activeCurrencies()).has(currency)) throw new Error(`Cash-outs in ${currency} are coming soon`);
  if (nearIn < MIN_SELL_NEAR) throw new Error(`Minimum cash-out is ${MIN_SELL_NEAR} NEAR`);
  const q = await sellQuote(nearIn);
  const fee = round2((q.usdc * config.FEE_PERCENT) / 100);
  const usdc = round2(q.usdc - fee);
  if (usdc < MIN_CASHOUT_USDC) throw new Error(`Minimum cash-out is about ${MIN_CASHOUT_USDC} USDC worth of NEAR`);

  // PAJ's live cash-out rate for Paya's business (its fee, if any, is already inside).
  const fiatOut = Math.floor(usdc * (await pajV2.rates(currency)).sell);
  const priceSource: Preview["priceSource"] = "account";
  return {
    nearIn,
    usdcOut: q.usdc,
    usdcPayout: usdc,
    feeUsdc: fee,
    feePercent: config.FEE_PERCENT,
    rate: fiatOut / usdc,
    fiatOut,
    fiatPerNear: fiatOut / nearIn,
    currency,
    priceSource,
    etaSeconds: (q.minutes + 2) * 60, // provider + PAJ payout
    provider: q.provider,
  };
}
