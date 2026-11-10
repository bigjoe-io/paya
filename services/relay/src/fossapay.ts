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

const SIM_BANKS: Bank[] = [
  { bankname: "ACCESS BANK", bankcode: "044" },
  { bankname: "GUARANTY TRUST BANK", bankcode: "058" },
  { bankname: "KUDA MICROFINANCE BANK", bankcode: "090267" },
  { bankname: "OPAY", bankcode: "100004" },
  { bankname: "ZENITH BANK", bankcode: "057" },
  { bankname: "FIRST BANK OF NIGERIA", bankcode: "011" },
  { bankname: "UNITED BANK FOR AFRICA", bankcode: "033" },
  { bankname: "MONIEPOINT MFB", bankcode: "50515" },
];

const simPayouts = new Map<string, { createdAt: number }>();

export const fossapay = {
  async banks(): Promise<Bank[]> {
    if (config.simulatePayout) return SIM_BANKS;
    return call<Bank[]>("/transfers/fiat/banks");
  },

  async nameEnquiry(bankCode: string, accountNumber: string): Promise<{ accountName: string }> {
    if (config.simulatePayout) {
      if (!/^\d{10}$/.test(accountNumber)) throw new Error("Bank account details could not be verified");
      return { accountName: "SIMULATED ACCOUNT HOLDER" };
    }
    const d = await call<{ accountName: string }>("/transfers/fiat/bank-name-enquiry", {
      method: "POST",
      body: JSON.stringify({ bankCode, accountNumber }),
    });
    return { accountName: d.accountName };
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
