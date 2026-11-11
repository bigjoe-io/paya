import { config } from "./config.js";
import { oneclick } from "./oneclick.js";
import { paj } from "./paj.js";
import { indicativeSellRate } from "./fx.js";

/**
 * Pricing for "X NEAR → local currency".
 *
 *   NEAR ──1Click──▶ USDC on Solana ──PAJ──▶ bank payout
 *
 * PAJ must receive exactly the `amount` its order returns. 1Click then
 * delivers that exact amount, adding a ~1% buffer on the NEAR side (unused
 * part refunded). We size the payout so that buffer still fits inside the
 * NEAR the user typed.
 */
const SLIPPAGE_BUFFER = 1.012;
/** Placeholder recipient for dry quotes (any valid Solana address; nothing is sent). */
export const DRY_RECIPIENT = "7EcJ1eB6J3ggRrGkQWsT4ZP8dkqPZ4JmW4YRwR7Qp5cY";

export const round2 = (n: number) => Math.floor(n * 100) / 100;

/** USDC the payout is priced on and Paya's fee, given the USDC the swap yields. */
export function sizePayout(usdcOut: number) {
  const usdc = round2(usdcOut / SLIPPAGE_BUFFER / (1 + config.FEE_PERCENT / 100));
  const fee = Math.max(0, round2((usdc * config.FEE_PERCENT) / 100));
  return { usdc, fee };
}

export type Preview = {
  nearIn: number;
  usdcOut: number; // after the swap (1Click fee + Solana withdraw fee already taken)
  usdcPayout: number;
  feeUsdc: number;
  feePercent: number;
  rate: number; // local currency per USDC
  fiatOut: number;
  fiatPerNear: number;
  currency: string;
  /** "account": priced for this user by PAJ; "public": indicative rate before sign-in. */
  priceSource: "account" | "public";
  etaSeconds: number;
};

/** Smallest payout worth making (USDC). */
export const MIN_CASHOUT_USDC = 1.5;
let nearUsdc: { at: number; v: number } | null = null;

/** Smallest NEAR amount that cashes out, at today's rate (+5% cushion, rounded up to 0.01). */
export async function minCashoutNear() {
  if (!nearUsdc || Date.now() - nearUsdc.at > 2 * 60_000) {
    const q = await oneclick.previewExactIn(10n ** 24n, "near", DRY_RECIPIENT);
    nearUsdc = { at: Date.now(), v: Number(q.amountOut) / 1e6 };
  }
  const usdcNeeded = MIN_CASHOUT_USDC * SLIPPAGE_BUFFER * (1 + config.FEE_PERCENT / 100);
  return Math.ceil(((usdcNeeded / nearUsdc.v) * 1.05) * 100) / 100;
}

export async function preview(nearIn: number, currency: string, refundTo: string, token?: string): Promise<Preview> {
  const min = await minCashoutNear();
  if (nearIn < min) throw new Error(`Minimum cash-out is ${min} NEAR`);
  const yocto = BigInt(Math.round(nearIn * 1e6)) * 10n ** 18n;
  const q = await oneclick.previewExactIn(yocto, refundTo, DRY_RECIPIENT);
  const usdcOut = Number(q.amountOut) / 1e6;
  const { usdc, fee } = sizePayout(usdcOut);
  if (usdc <= 0) throw new Error("Amount too small");

  let fiatOut: number;
  let priceSource: Preview["priceSource"];
  if (token) {
    const v = await paj.offrampValue(token, usdc, currency);
    fiatOut = Math.floor(v.fiatAmount);
    priceSource = "account";
  } else if (currency === "NGN") {
    fiatOut = Math.floor(usdc * (await paj.publicNgnRate()));
    priceSource = "public";
  } else {
    fiatOut = Math.floor(usdc * (await indicativeSellRate(currency)));
    priceSource = "public";
  }

  return {
    nearIn,
    usdcOut,
    usdcPayout: usdc,
    feeUsdc: fee,
    feePercent: config.FEE_PERCENT,
    rate: fiatOut / usdc,
    fiatOut,
    fiatPerNear: fiatOut / nearIn,
    currency,
    priceSource,
    etaSeconds: (q.timeEstimate ?? 20) + 60,
  };
}
