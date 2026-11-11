import { config } from "./config.js";
import { log } from "./log.js";

/**
 * NEAR Intents 1Click Swap API — NEAR → USDC on Solana.
 * Docs: https://docs.near-intents.org/integration/distribution-channels/1click-api
 * Asset ids verified live against /v0/tokens.
 */
const BASE = "https://1click.chaindefuser.com/v0";
export const ASSET_WNEAR = "nep141:wrap.near";
export const ASSET_USDC_SOLANA = "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near";

export type Quote = {
  depositAddress?: string; // absent on dry quotes
  amountIn: string; // yoctoNEAR
  minAmountIn?: string;
  amountOut: string; // USDC, 6 decimals
  minAmountOut?: string;
  timeEstimate?: number; // seconds
  deadline?: string;
};

export type SwapStatus =
  | "PENDING_DEPOSIT"
  | "KNOWN_DEPOSIT_TX"
  | "PROCESSING"
  | "SUCCESS"
  | "INCOMPLETE_DEPOSIT"
  | "REFUNDED"
  | "FAILED";

function headers() {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (config.ONECLICK_JWT) h["X-API-Key"] = config.ONECLICK_JWT;
  return h;
}

async function quote(body: Record<string, unknown>): Promise<Quote> {
  const r = await fetch(`${BASE}/quote`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      slippageTolerance: 100, // 1%
      originAsset: ASSET_WNEAR,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: ASSET_USDC_SOLANA,
      recipientType: "DESTINATION_CHAIN",
      refundType: "ORIGIN_CHAIN",
      deadline: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      referral: "paya",
      ...body,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const j = (await r.json().catch(() => ({}))) as { quote?: Quote; message?: string };
  if (!r.ok || !j.quote) {
    // 1Click answers 500 when the refund account doesn't exist on mainnet.
    if (r.status >= 500 || /internal server error/i.test(j.message ?? "")) throw new Error("Couldn't get a swap quote. Check that your NEAR account exists on mainnet and try again.");
    throw new Error(`Swap quote failed: ${j.message ?? r.status}`);
  }
  return j.quote;
}

export const oneclick = {
  /** Preview: what `yocto` NEAR becomes in USDC. No deposit address is created. */
  previewExactIn(yocto: bigint, refundTo: string, recipient: string) {
    return quote({ dry: true, swapType: "EXACT_INPUT", amount: yocto.toString(), refundTo, recipient });
  },

  /**
   * Real quote: deliver EXACTLY `usdcUnits` (6dp) to `recipient` on Solana.
   * Returns the deposit address and `amountIn` (includes a slippage buffer;
   * anything unused is refunded to `refundTo`, the user's NEAR account).
   */
  async exactOut(usdcUnits: bigint, recipient: string, refundTo: string, dry = false) {
    const q = await quote({ dry, swapType: "EXACT_OUTPUT", amount: usdcUnits.toString(), recipient, refundTo });
    log("1click", `exact-out ${Number(usdcUnits) / 1e6} USDC ← ${Number(q.amountIn) / 1e24} NEAR`, {
      deposit: q.depositAddress,
    });
    return q;
  },

  async submitDeposit(depositAddress: string, txHash: string) {
    await fetch(`${BASE}/deposit/submit`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ depositAddress, txHash }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => undefined); // an optional speed-up hint; polling still works without it
  },

  async status(depositAddress: string): Promise<SwapStatus> {
    const r = await fetch(`${BASE}/status?depositAddress=${encodeURIComponent(depositAddress)}`, {
      headers: headers(),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`Swap status ${r.status}`);
    return ((await r.json()) as { status: SwapStatus }).status;
  },
};
