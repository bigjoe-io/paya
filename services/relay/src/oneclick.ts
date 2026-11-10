import { config } from "./config.js";
import { log } from "./log.js";

/**
 * NEAR Intents 1Click Swap API — NEAR → USDC on Solana.
 * Docs: https://docs.near-intents.org/integration/distribution-channels/1click-api
 * Asset ids verified live against /v0/tokens on 2026-11-10.
 */
const BASE = "https://1click.chaindefuser.com/v0";
export const ASSET_NEAR = "nep141:wrap.near";
export const ASSET_USDC_SOLANA = "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near";

export type Quote = {
  depositAddress: string;
  amountIn: string;
  amountOut: string; // USDC, 6 decimals
  amountOutFormatted?: string;
  timeEstimate?: number;
  deadline: string;
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

export const oneclick = {
  /** EXACT_INPUT quote: send `amountYocto` NEAR, receive USDC on Solana at `recipient`. */
  async quote(amountYocto: bigint, recipient: string, refundTo: string, dry = false): Promise<Quote> {
    const body = {
      dry,
      swapType: "EXACT_INPUT",
      slippageTolerance: 100, // 1%
      originAsset: ASSET_NEAR,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: ASSET_USDC_SOLANA,
      amount: amountYocto.toString(),
      recipient,
      recipientType: "DESTINATION_CHAIN",
      refundTo,
      refundType: "ORIGIN_CHAIN",
      deadline: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      referral: "paya",
    };
    const r = await fetch(`${BASE}/quote`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const j = (await r.json()) as { quote?: Quote; message?: string };
    if (!r.ok || !j.quote) throw new Error(`1Click quote failed: ${r.status} ${j.message ?? ""}`);
    log("1click", `quote ${j.quote.amountIn} yocto → ${j.quote.amountOut} USDC`, {
      deposit: j.quote.depositAddress,
    });
    return j.quote;
  },

  async submitDeposit(depositAddress: string, txHash: string) {
    await fetch(`${BASE}/deposit/submit`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ depositAddress, txHash }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => undefined); // optional hint; polling still works
  },

  async status(depositAddress: string): Promise<{ status: SwapStatus; amountOut?: string }> {
    const r = await fetch(`${BASE}/status?depositAddress=${encodeURIComponent(depositAddress)}`, {
      headers: headers(),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`1Click status ${r.status}`);
    const j = (await r.json()) as {
      status: SwapStatus;
      swapDetails?: { amountOut?: string };
    };
    return { status: j.status, amountOut: j.swapDetails?.amountOut };
  },
};

/* ---------- simulation for testnet ---------- */

const simulated = new Map<string, { createdAt: number; amountOut: string }>();

export const oneclickSim = {
  quote(amountYocto: bigint, usdPerNear: number): Quote {
    const near = Number(amountYocto) / 1e24;
    const usdc = near * usdPerNear * 0.9965;
    const amountOut = Math.floor(usdc * 1e6).toString();
    const depositAddress = `sim-${Math.random().toString(36).slice(2, 10)}.testnet`;
    simulated.set(depositAddress, { createdAt: Date.now(), amountOut });
    return {
      depositAddress,
      amountIn: amountYocto.toString(),
      amountOut,
      deadline: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
  },
  status(depositAddress: string): { status: SwapStatus; amountOut?: string } {
    const s = simulated.get(depositAddress);
    if (!s) return { status: "FAILED" };
    const age = Date.now() - s.createdAt;
    if (age < 8000) return { status: "PROCESSING" };
    return { status: "SUCCESS", amountOut: s.amountOut };
  },
};
