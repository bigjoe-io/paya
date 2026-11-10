import { config } from "./config.js";
import { getRates } from "./rate.js";
import { fossapay } from "./fossapay.js";

export const YOCTO = 10n ** 24n;

export function yoctoToNear(yocto: bigint): number {
  return Number(yocto) / 1e24;
}

export function nearToYocto(near: number): bigint {
  return BigInt(Math.round(near * 1e6)) * 10n ** 18n;
}

/** What the user is told before sending: an estimate with every cost visible. */
export type Estimate = {
  nearAmount: number;
  rate: { ngnPerUsdc: number; ngnPerNear: number; source: string; fetchedAt: string };
  usdcEstimate: number;
  grossNgn: number;
  railFeeNgn: number;
  marginNgn: number;
  netNgn: number;
  marginBps: number;
  swapFeeBpsAssumed: number;
};

/** 1Click adds 25 bps without a partner key, ~20 bps with one, plus solver spread. */
const SWAP_FEE_BPS = config.ONECLICK_JWT ? 30 : 35;

export async function estimate(nearAmount: number): Promise<Estimate> {
  const rate = await getRates();
  const usdcEstimate = nearAmount * rate.usdPerNear * (1 - SWAP_FEE_BPS / 10_000);
  const settled = await settle(usdcEstimate, rate.ngnPerUsdc);
  return {
    nearAmount,
    rate: {
      ngnPerUsdc: rate.ngnPerUsdc,
      ngnPerNear: rate.ngnPerNear,
      source: rate.source,
      fetchedAt: rate.fetchedAt,
    },
    usdcEstimate,
    ...settled,
    marginBps: config.MARGIN_BPS,
    swapFeeBpsAssumed: SWAP_FEE_BPS,
  };
}

/**
 * Final naira for a known USDC amount:
 *   gross  = usdc × rate
 *   rail   = payout fee quoted live by the rail (what it costs to move naira)
 *   margin = gross × MARGIN_BPS
 *   net    = floor(gross − rail − margin)
 */
export async function settle(usdc: number, ngnPerUsdc?: number) {
  const r = ngnPerUsdc ?? (await getRates()).ngnPerUsdc;
  const grossNgn = usdc * r;
  const railFeeNgn = await fossapay.payoutFee(grossNgn);
  const marginNgn = (grossNgn * config.MARGIN_BPS) / 10_000;
  const netNgn = Math.max(0, Math.floor(grossNgn - railFeeNgn - marginNgn));
  return { grossNgn, railFeeNgn, marginNgn, netNgn };
}
