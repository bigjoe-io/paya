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

let loggedBankShape = false;

export type PajOnramp = {
  id: string;
  accountNumber: string;
  accountName: string;
  amount: number; // USDC PAJ sends to the recipient
  fiatAmount: number;
  bank: string;
  rate: number;
  recipient: string;
  currency: string;
  mint: string;
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
  /** USD→NGN on-ramp (buy) rate. No session needed. */
  publicNgnBuyRate: async () => (await call<{ onRampRate: { rate: number } }>("/pub/rate")).onRampRate.rate,

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
  /**
   * PAJ's live /pub/bank doesn't always match its documented shape (some
   * entries have no `name`), so normalise defensively and drop anything we
   * can't show or pay to. The raw keys are logged once to see the real shape.
   */
  async banks(token: string): Promise<PajBank[]> {
    const raw = await call<unknown>("/pub/bank", { token });
    const list = (Array.isArray(raw) ? raw : ((raw as { data?: unknown[] })?.data ?? [])) as Record<string, unknown>[];
    if (!loggedBankShape && list.length) {
      loggedBankShape = true;
      const missing = list.filter((b) => typeof b?.name !== "string").length;
      log("paj", `bank list: ${list.length} entries, keys [${Object.keys(list[0] ?? {}).join(", ")}], ${missing} without name`);
    }
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
    const banks: PajBank[] = [];
    for (const b of list) {
      if (!b || typeof b !== "object") continue;
      const id = str(b.id) ?? str(b._id);
      const name = str(b.name) ?? str(b.bankName) ?? str(b.bank_name) ?? str(b.title);
      if (!id || !name) continue;
      banks.push({
        id,
        name,
        code: str(b.code) ?? str(b.bankCode) ?? "",
        logo: str(b.logo),
        country: str(b.country) ?? "",
      });
    }
    return banks;
  },
  resolveAccount: (token: string, bankId: string, accountNumber: string) =>
    call<{ accountName: string; accountNumber: string; bank: PajBank }>(
      `/pub/bank-account/confirm?bankId=${encodeURIComponent(bankId)}&accountNumber=${encodeURIComponent(accountNumber)}`,
      { token },
    ),
  saveAccount: (token: string, bankId: string, accountNumber: string) =>
    call<PajSavedAccount>("/pub/bank-account", { method: "POST", token, body: { bankId, accountNumber } }),
  /** Saved accounts; `bank` may come back as an id or as a bank object. */
  async savedAccounts(token: string): Promise<PajSavedAccount[]> {
    const raw = await call<unknown>("/pub/bank-account", { token });
    const list = (Array.isArray(raw) ? raw : ((raw as { data?: unknown[] })?.data ?? [])) as Record<string, unknown>[];
    return list
      .filter((a) => a && typeof a === "object")
      .map((a) => {
        const bank = a.bank as unknown;
        const bankId =
          typeof bank === "string" ? bank : ((bank as { id?: string; _id?: string } | null)?.id ?? (bank as { _id?: string } | null)?._id ?? "");
        return {
          id: String(a.id ?? a._id ?? ""),
          accountName: String(a.accountName ?? ""),
          accountNumber: String(a.accountNumber ?? ""),
          bank: bankId,
        };
      })
      .filter((a) => a.id && a.bank && a.accountNumber);
  },
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
  /** How much USDC `fiat` in `currency` buys, for this user. */
  onrampValue: (token: string, fiat: number, currency: string) =>
    call<{ amount: number; fiatAmount: number; rate?: number }>(
      `/pub/rates/onramp-value?fiatAmount=${fiat}&mint=${USDC_SOLANA_MINT}&currency=${currency}`,
      { token },
    ),

  /** Buy order: the user pays `fiat` into PAJ's account; PAJ sends USDC on Solana to `recipient`. */
  createOnramp(token: string, p: { fiat: number; currency: string; recipient: string; feeUsdc: number; reference: string }) {
    log("paj", `onramp ${p.fiat} ${p.currency} → USDC to ${p.recipient} (${p.reference})`);
    return call<PajOnramp>("/pub/onramp", {
      method: "POST",
      token,
      body: {
        fiatAmount: p.fiat,
        currency: p.currency,
        recipient: p.recipient,
        mint: USDC_SOLANA_MINT,
        chain: "SOLANA",
        businessUSDCFee: p.feeUsdc,
        ...(config.PUBLIC_URL ? { webhookURL: `${config.PUBLIC_URL}/webhooks/paj` } : {}),
      },
    });
  },

  transaction: (token: string, id: string) =>
    call<{ id: string; status: PajStatus; signature?: string; fiatAmount?: number }>(`/pub/transactions/${id}`, { token }),
};

/* =====================================================================
 * PAJ public API v2 — https://docs.paj.cash
 * Every call is authenticated with Paya's business key (x-api-key). No user
 * session is involved, so cash-outs and purchases never wait for a user to
 * re-verify their email. (The v1 email-code endpoints above are used only to
 * sign people in to Paya.)
 * ===================================================================== */

export type PajV2Status = "INIT" | "PROCESSING" | "COMPLETED" | "ERROR" | "PAID"; // PAID: older orders
export type PajV2Tx = {
  id: string;
  status: PajV2Status;
  address: string; // offramp: where to send the token
  signature: string | null; // on-chain transaction, once there is one
  mint: string;
  currency: string;
  amount: number; // token amount
  usdcAmount: number;
  fiatAmount: number;
  rate: number;
  recipient: string;
  accountNumber: string; // onramp: account to pay into · offramp: payout account
  accountName: string;
  bank: string;
  fee: number;
};
export type PajV2Bank = { id: string; code: string; name: string; country: string; logo?: string };

/** Errors from v2 are about Paya's integration, never about the user's sign-in. */
export class PajV2Error extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function v2<T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}) {
  const r = await fetch(`${config.PAJ_API_URL}/pub/v2${path}`, {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json", "x-api-key": config.PAJ_API_KEY },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
  });
  const j = (await r.json().catch(() => ({}))) as T & { message?: string | string[] };
  if (!r.ok) {
    const m = Array.isArray(j.message) ? j.message.join("; ") : j.message;
    if (r.status === 401) throw new PajV2Error("Payment partner rejected Paya's API key", 502);
    throw new PajV2Error(m ?? `PAJ ${path} failed (${r.status})`, r.status >= 500 ? 502 : r.status);
  }
  return j as T;
}

const cache = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, ms: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.v as T;
  const v = await fn();
  cache.set(key, { at: Date.now(), v });
  return v;
}

export const pajV2 = {
  /** Local currency per 1 USD. Paya's business fee (if any is set at PAJ) is already inside. */
  rates: (currency: string) =>
    cached(`rate:${currency}`, 60_000, async () => {
      const r = await v2<{ onRampRate: { rate: number }; offRampRate: { rate: number } }>(`/rate?currency=${currency}`);
      return { buy: r.onRampRate.rate, sell: r.offRampRate.rate };
    }),

  /** Currencies PAJ has switched on right now. */
  activeCurrencies: () =>
    cached("currencies", 10 * 60_000, async () => {
      const list = await v2<{ currency: string; isActive: boolean }[]>("/currencies");
      return new Set(list.filter((c) => c.isActive).map((c) => c.currency));
    }),

  /** Banks with a name and code (PAJ's list includes ~200 entries without a name, which can't be shown or picked). */
  banks: () =>
    cached("banks", 60 * 60_000, async () => {
      const seen = new Set<string>();
      return (await v2<Partial<PajV2Bank>[]>("/bank"))
        .filter((b): b is PajV2Bank => typeof b.name === "string" && b.name.trim() !== "" && typeof b.code === "string" && b.code !== "")
        .filter((b) => (seen.has(b.code) ? false : (seen.add(b.code), true)))
        .map((b) => ({ ...b, name: b.name.trim() }));
    }),

  /** Accepts a bank code ("000013") or an older bank id; returns the code. */
  async bankCode(idOrCode: string) {
    if (/^\d{3,8}$/.test(idOrCode)) return idOrCode;
    const b = (await pajV2.banks()).find((x) => x.id === idOrCode || x.code === idOrCode);
    if (!b) throw new PajV2Error("Unknown bank", 400);
    return b.code;
  },

  /**
   * Confirms the account with the bank and registers it (idempotent). The name
   * comes from the bank. `address` is a permanent Solana address that pays it.
   */
  registerBank: (bankCode: string, accountNumber: string) =>
    v2<{ id: string; accountName: string; accountNumber: string; bank: string; address: string; evmAddress?: string }>("/bank-account", {
      method: "POST",
      body: { bankCode, accountNumber },
      timeoutMs: 45_000,
    }),

  /** Buy: the user pays `fiat` into the returned account; PAJ sends USDC on Solana to `recipient`. */
  createOnramp(p: { fiat: number; currency: string; recipient: string; reference: string }) {
    log("paj", `v2 onramp ${p.fiat} ${p.currency} → USDC to ${p.recipient} (${p.reference})`);
    return v2<PajV2Tx>("/onramp", {
      method: "POST",
      body: {
        fiatAmount: p.fiat,
        currency: p.currency,
        recipient: p.recipient,
        mint: USDC_SOLANA_MINT,
        chain: "SOLANA",
        userExternalId: p.reference,
        ...(config.PUBLIC_URL ? { webhookURL: `${config.PUBLIC_URL}/webhooks/paj` } : {}),
      },
    });
  },

  /** Cash-out: send exactly `amount` USDC to the returned `address`; PAJ pays the bank. */
  createOfframp(p: { bankCode: string; accountNumber: string; currency: string; usdc: number; reference: string }) {
    log("paj", `v2 offramp ${p.usdc} USDC → ${p.currency} (${p.reference})`);
    return v2<PajV2Tx>("/offramp", {
      method: "POST",
      body: {
        bankCode: p.bankCode,
        accountNumber: p.accountNumber,
        currency: p.currency,
        amount: p.usdc,
        mint: USDC_SOLANA_MINT,
        chain: "SOLANA",
        description: `Paya ${p.reference}`,
        ...(config.PUBLIC_URL ? { webhookURL: `${config.PUBLIC_URL}/webhooks/paj` } : {}),
      },
    });
  },

  transaction: (id: string) => v2<PajV2Tx>(`/transaction/${encodeURIComponent(id)}`),
};
