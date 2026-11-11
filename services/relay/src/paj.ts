import { config } from "./config.js";
import { log } from "./log.js";

/**
 * PAJ Cash — USDC on Solana → bank payout (NGN, GHS, KES, TZS, ZAR).
 * Docs: https://github.com/paj-cash/paj_ramp/blob/main/lib/API_REFERENCE.md
 *
 * Two credentials: Paya's business `x-api-key` (only for starting/verifying a
 * user session) and the user's own session token from email OTP, used for
 * everything else. PAJ keeps each user's saved bank accounts.
 */
export const USDC_SOLANA_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export class PajError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: { method?: string; token?: string; key?: boolean; body?: unknown } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.key) headers["x-api-key"] = config.PAJ_API_KEY;
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const r = await fetch(`${config.PAJ_API_URL}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const j = (await r.json().catch(() => ({}))) as T & { message?: string | string[] };
  if (!r.ok) {
    const m = Array.isArray(j.message) ? j.message.join("; ") : j.message;
    throw new PajError(m ?? `PAJ ${path} failed (${r.status})`, r.status);
  }
  return j as T;
}

export type PajBank = { id: string; code: string; name: string; logo?: string; country: string };
export type PajSavedAccount = { id: string; accountName: string; accountNumber: string; bank: string };
export type PajStatus = "INIT" | "PAID" | "COMPLETED";
export type PajOfframp = {
  id: string;
  address: string;
  mint: string;
  currency: string;
  amount: number;
  fiatAmount: number;
  rate: number;
  fee: number;
};

/** Countries PAJ pays out to. */
export const COUNTRY: Record<string, { country: string; iso: string; flag: string; symbol: string }> = {
  NGN: { country: "Nigeria", iso: "NG", flag: "🇳🇬", symbol: "₦" },
  GHS: { country: "Ghana", iso: "GH", flag: "🇬🇭", symbol: "GH₵" },
  KES: { country: "Kenya", iso: "KE", flag: "🇰🇪", symbol: "KSh" },
  TZS: { country: "Tanzania", iso: "TZ", flag: "🇹🇿", symbol: "TSh" },
  ZAR: { country: "South Africa", iso: "ZA", flag: "🇿🇦", symbol: "R" },
};

export const paj = {
  /* ---- session (business key) ---- */
  startSession: (email: string) => call<{ email: string }>("/pub/initiate", { method: "POST", key: true, body: { email } }),
  verifySession: (email: string, otp: string, deviceId: string) =>
    call<{ recipient: string; expiresAt: string; token: string }>("/pub/verify", {
      method: "POST",
      key: true,
      body: { email, otp, device: { uuid: deviceId, device: "Web", browser: "Paya" } },
    }),

  /* ---- public ---- */
  /** USD→NGN off-ramp rate. No session needed. */
  publicNgnRate: async () =>
    (await call<{ offRampRate: { rate: number } }>("/pub/rate")).offRampRate.rate,

  /* ---- user session ---- */
  /** What `usdc` USDC on Solana pays out in `currency`. */
  offrampValue: (token: string, usdc: number, currency: string) =>
    call<{ amount: number; fiatAmount: number; rate?: number; tokenRate?: number }>(
      `/pub/rates/offramp-value?amount=${usdc}&mint=${USDC_SOLANA_MINT}&currency=${currency}`,
      { token },
    ),
  banks: (token: string) => call<PajBank[]>("/pub/bank", { token }),
  resolveAccount: (token: string, bankId: string, accountNumber: string) =>
    call<{ accountName: string; accountNumber: string; bank: PajBank }>(
      `/pub/bank-account/confirm?bankId=${encodeURIComponent(bankId)}&accountNumber=${encodeURIComponent(accountNumber)}`,
      { token },
    ),
  saveAccount: (token: string, bankId: string, accountNumber: string) =>
    call<PajSavedAccount>("/pub/bank-account", { method: "POST", token, body: { bankId, accountNumber } }),
  savedAccounts: (token: string) => call<PajSavedAccount[]>("/pub/bank-account", { token }),
  submitKyc: (token: string, idType: "BVN" | "NIN", idNumber: string, country: string) =>
    call<{ message: string }>("/pub/kyc", { method: "POST", token, body: { idType, idNumber, country } }),

  createOfframp(
    token: string,
    p: { bankId: string; accountNumber: string; currency: string; usdc: number; feeUsdc: number; reference: string },
  ) {
    log("paj", `offramp ${p.usdc} USDC → ${p.currency} (${p.reference})`);
    return call<PajOfframp>("/pub/offramp", {
      method: "POST",
      token,
      body: {
        bank: p.bankId,
        accountNumber: p.accountNumber,
        currency: p.currency,
        amount: p.usdc,
        mint: USDC_SOLANA_MINT,
        chain: "SOLANA",
        description: `Paya ${p.reference}`,
        businessUSDCFee: p.feeUsdc,
        ...(config.PUBLIC_URL ? { webhookURL: `${config.PUBLIC_URL}/webhooks/paj` } : {}),
      },
    });
  },
  transaction: (token: string, id: string) =>
    call<{ id: string; status: PajStatus; signature?: string; fiatAmount?: number }>(`/pub/transactions/${id}`, { token }),
};
