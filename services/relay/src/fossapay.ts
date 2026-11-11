import crypto from "node:crypto";
import { config } from "./config.js";
import { log } from "./log.js";

/**
 * Payout rail (Fossapay). Production-only API: with no key configured every
 * money-moving call is simulated and clearly logged as such.
 * Docs: https://docs.fossapay.com
 */
type Envelope<T> = { status: string | boolean; statusCode: number; message: string; data: T };

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${config.FOSSAPAY_API_URL}${path}`, {
    ...init,
    headers: {
      "x-api-key": config.FOSSAPAY_API_KEY,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  const j = (await r.json().catch(() => ({}))) as Envelope<T> & { message?: string };
  if (!r.ok) throw new Error(`rail ${path} ${r.status}: ${j.message ?? "error"}`);
  return j.data;
}

export type Bank = { bankname: string; bankcode: string };
export type PayoutStatus = "processing" | "completed" | "failed" | "reversed";

/** Used only if the public list below is unreachable too. */
const FALLBACK_BANKS: Bank[] = [
  { bankname: "Access Bank", bankcode: "044" },
  { bankname: "First Bank of Nigeria", bankcode: "011" },
  { bankname: "Guaranty Trust Bank", bankcode: "058" },
  { bankname: "United Bank For Africa", bankcode: "033" },
  { bankname: "Zenith Bank", bankcode: "057" },
];

/** Placeholder stored as the account name until a real name enquiry is possible. */
export const UNVERIFIED_NAME = "UNVERIFIED";

let publicBanks: { at: number; banks: Bank[] } | null = null;

/**
 * Real Nigerian bank list without an API key: Paystack publishes it openly.
 * Same mix of 3-digit CBN codes and NIP codes the rail uses. Cached 24h.
 */
async function publicBankList(): Promise<Bank[]> {
  if (publicBanks && Date.now() - publicBanks.at < 24 * 3600_000) return publicBanks.banks;
  try {
    const r = await fetch("https://api.paystack.co/bank?country=nigeria&perPage=500", {
      signal: AbortSignal.timeout(10000),
    });
    const j = (await r.json()) as {
      data?: { name: string; code: string; active: boolean; supports_transfer: boolean; is_deleted?: boolean }[];
    };
    const banks = (j.data ?? [])
      .filter((b) => b.active && b.supports_transfer && !b.is_deleted)
      .map((b) => ({ bankname: b.name.trim(), bankcode: b.code }))
      // Same bank listed under two codes: keep the 3-digit CBN code (NUBAN-checkable).
      .sort((a, b) => a.bankname.localeCompare(b.bankname) || a.bankcode.length - b.bankcode.length)
      .filter((b, i, all) => i === 0 || all[i - 1].bankname.toLowerCase() !== b.bankname.toLowerCase());
    if (banks.length < 20) throw new Error(`only ${banks.length} banks`);
    publicBanks = { at: Date.now(), banks };
    log("rail", `loaded ${banks.length} banks from the public list`);
    return banks;
  } catch (e) {
    log("rail", `public bank list unavailable (${(e as Error).message}); using fallback`);
    return publicBanks?.banks ?? FALLBACK_BANKS;
  }
}

/**
 * CBN NUBAN check digit. For 3-digit (deposit-money bank) codes the 10th digit
 * of every account number is derived from the bank code + first 9 digits, so a
 * typo is caught with no network call. Other institution codes use a different
 * code space, so they are not checked here.
 */
export function nubanValid(bankCode: string, accountNumber: string): boolean | null {
  if (!/^\d{10}$/.test(accountNumber)) return false;
  if (!/^\d{3}$/.test(bankCode)) return null; // can't check offline
  const digits = (bankCode + accountNumber.slice(0, 9)).split("").map(Number);
  const weights = [3, 7, 3, 3, 7, 3, 3, 7, 3, 3, 7, 3];
  const sum = digits.reduce((s, d, i) => s + d * weights[i], 0);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(accountNumber[9]);
}

const simPayouts = new Map<string, { createdAt: number }>();

export const fossapay = {
  async banks(): Promise<Bank[]> {
    if (config.simulatePayout) return publicBankList();
    return call<Bank[]>("/transfers/fiat/banks");
  },

  /**
   * Live: the rail resolves the real account holder's name.
   * Test mode: no name lookup is possible without a provider key, so we only
   * run the offline NUBAN check and say plainly that the name is unverified.
   */
  async nameEnquiry(bankCode: string, accountNumber: string): Promise<{ accountName: string; verified: boolean }> {
    if (config.simulatePayout) {
      if (!/^\d{10}$/.test(accountNumber)) throw new Error("Account numbers are 10 digits");
      if (nubanValid(bankCode, accountNumber) === false)
        throw new Error("That account number doesn't match this bank. Check for a typo.");
      return { accountName: UNVERIFIED_NAME, verified: false };
    }
    const d = await call<{ accountName: string }>("/transfers/fiat/bank-name-enquiry", {
      method: "POST",
      body: JSON.stringify({ bankCode, accountNumber }),
    });
    return { accountName: d.accountName, verified: true };
  },

  /** Fee the rail charges to move `amountNgn` to a bank. Quoted live; never hard-coded. */
  async payoutFee(amountNgn: number): Promise<number> {
    if (config.simulatePayout) return Math.min(500, Math.ceil(amountNgn * 0.01)); // mirrors the docs example (₦500 on ₦50k)
    const d = await call<{ feeAmount: number }>(`/transfers/fiat/calculate-fee?amount=${Math.ceil(amountNgn)}`);
    return Number(d.feeAmount);
  },

  async createPayout(p: {
    reference: string;
    amountNgn: number;
    bankCode: string;
    bankName: string;
    accountName: string;
    accountNumber: string;
    remarks: string;
    metadata: Record<string, string>;
  }): Promise<{ payoutId: string; status: PayoutStatus }> {
    if (config.simulatePayout) {
      const payoutId = `sim-${crypto.randomUUID()}`;
      simPayouts.set(payoutId, { createdAt: Date.now() });
      log("rail", `SIMULATED payout ₦${p.amountNgn} → ${p.bankName} ${p.accountNumber} (${p.reference})`);
      return { payoutId, status: "processing" };
    }
    const d = await call<{ payoutId: string; status: PayoutStatus }>("/payouts", {
      method: "POST",
      headers: { "X-Idempotency-Key": p.reference },
      body: JSON.stringify({
        amount: Math.floor(p.amountNgn),
        currency: "NGN",
        reference: p.reference,
        destinationBankCode: p.bankCode,
        destinationBankName: p.bankName,
        destinationAccountName: p.accountName,
        destinationAccountNumber: p.accountNumber,
        remarks: p.remarks,
        metadata: p.metadata,
      }),
    });
    log("rail", `payout ${d.payoutId} ${d.status} ₦${p.amountNgn} (${p.reference})`);
    return d;
  },

  async payoutStatus(payoutId: string): Promise<PayoutStatus> {
    if (config.simulatePayout) {
      const s = simPayouts.get(payoutId);
      if (!s) return "failed";
      return Date.now() - s.createdAt > 5000 ? "completed" : "processing";
    }
    const d = await call<{ status: PayoutStatus }>(`/payouts/${payoutId}`);
    return d.status;
  },

  /** The merchant's Solana address: where 1Click delivers USDC. */
  async masterSolanaAddress(): Promise<string | null> {
    if (config.simulatePayout) return null;
    const d = await call<{ address: string; network: string }[]>("/wallets/crypto/master");
    return d.find((w) => w.network === "solana")?.address ?? null;
  },

  async masterNgnBalance(): Promise<number | null> {
    if (config.simulatePayout) return null;
    const d = await call<{ availableBalance: string }>("/wallets/fiat/master");
    return Number(d.availableBalance);
  },

  /** signature = HMAC-SHA256(secret, JSON.stringify(body.data)), lowercase hex. */
  verifyWebhook(body: { data?: unknown }, signature: string | undefined): boolean {
    if (!body?.data || !signature || !config.FOSSAPAY_WEBHOOK_SECRET) return false;
    const expected = crypto
      .createHmac("sha256", config.FOSSAPAY_WEBHOOK_SECRET)
      .update(JSON.stringify(body.data))
      .digest("hex");
    if (expected.length !== signature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  },
};
