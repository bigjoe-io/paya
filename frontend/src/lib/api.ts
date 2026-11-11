/**
 * Client for the Paya relay (services/relay). Two identities: the connected
 * NEAR wallet (signs the only transaction that moves money) and the user's
 * PAJ session from email sign-in (banks, name lookup, payout orders).
 */
export const RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL ?? "http://localhost:8787";

export type Currency = { code: string; name: string; symbol: string; flag: string; country: string; comingSoon?: boolean };

export type Bank = { id: string; code: string; name: string; logo?: string; country: string };
export type SavedAccount = { id: string; accountName: string; accountNumber: string; bank: string };

export type Quote = {
  nearIn: number;
  usdcOut: number;
  usdcPayout: number;
  feeUsdc: number;
  feePercent: number;
  rate: number;
  fiatOut: number;
  fiatPerNear: number;
  currency: string;
  priceSource: "account" | "public";
  etaSeconds: number;
};

export type SwapStatus = "awaiting_deposit" | "swapping" | "paying" | "paid" | "refunded" | "expired" | "failed";

export type Swap = {
  id: string;
  status: SwapStatus;
  demo: boolean;
  nearIn: number;
  currency: string;
  fiatAmount: number;
  rate: number;
  usdcAmount: number;
  feeUsdc: number;
  recipient: { bankName: string; account: string; name: string };
  depositTx: string | null;
  paymentReference: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BuyQuote = {
  fiat: number;
  currency: string;
  usdc: number;
  feeUsdc: number;
  usdcNet: number;
  nearOut: number;
  nearMin: number;
  rate: number;
  fiatPerNear: number;
  feePercent: number;
  priceSource: "account" | "public";
  etaSeconds: number;
};

export type BuyStatus = "awaiting_payment" | "converting" | "delivered" | "refunded" | "expired" | "failed";

export type Buy = {
  id: string;
  status: BuyStatus;
  demo: boolean;
  currency: string;
  fiatAmount: number;
  nearExpected: number;
  nearMin: number;
  usdc: number;
  feeUsdc: number;
  rate: number;
  /** Where to send the money; only while the order can still be paid. */
  payTo: { bank: string; accountNumber: string; accountName: string } | null;
  deadline: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

/** The one transaction the wallet signs (all actions on wrap.near). */
export type WalletTx = {
  receiverId: string;
  actions: { type: "FunctionCall"; params: { methodName: string; args: object; gas: string; deposit: string } }[];
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

/** The user's PAJ session token, attached when present. */
let sessionToken: string | null = null;
export const setSessionToken = (t: string | null) => {
  sessionToken = t;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${RELAY_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(`Can't reach the Paya relay at ${RELAY_URL}. Start it with "npm run dev" in services/relay.`, 0);
  }
  const body = (await r.json().catch(() => ({}))) as { error?: string; code?: string } & T;
  if (!r.ok) throw new ApiError(body.error ?? `Request failed (${r.status})`, r.status, body.code);
  return body as T;
}

export const api = {
  health: () => request<{ ok: boolean; demo: boolean; feePercent: number }>("/health"),
  currencies: () => request<Currency[]>("/currencies"),
  prices: () => request<{ nearUsd: number; ngnPerUsd: number | null }>("/prices"),
  quote: (near: number, currency: string, account?: string | null) =>
    request<Quote>(`/quote?near=${near}&currency=${currency}${account ? `&account=${account}` : ""}`),

  startSignIn: (email: string) => request<{ sent: boolean }>("/auth/start", { method: "POST", body: JSON.stringify({ email }) }),
  verifySignIn: (email: string, otp: string, deviceId: string) =>
    request<{ token: string; expiresAt: string; email: string }>("/auth/verify", {
      method: "POST",
      body: JSON.stringify({ email, otp, deviceId }),
    }),

  banks: (currency: string) => request<Bank[]>(`/banks?currency=${currency}`),
  resolveAccount: (bankId: string, accountNumber: string) =>
    request<{ accountName: string; accountNumber: string }>("/bank-accounts/resolve", {
      method: "POST",
      body: JSON.stringify({ bankId, accountNumber }),
    }),
  savedAccounts: () => request<SavedAccount[]>("/bank-accounts"),
  saveAccount: (bankId: string, accountNumber: string) =>
    request<SavedAccount>("/bank-accounts", { method: "POST", body: JSON.stringify({ bankId, accountNumber }) }),
  submitKyc: (idType: "BVN" | "NIN", idNumber: string, country: string) =>
    request<{ message: string }>("/kyc", { method: "POST", body: JSON.stringify({ idType, idNumber, country }) }),

  createSwap: (b: {
    accountId: string;
    near: number;
    currency: string;
    bankId: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
  }) => request<{ swap: Swap; transaction: WalletTx | null }>("/swaps", { method: "POST", body: JSON.stringify(b) }),
  recordDeposit: (id: string, txHash: string) =>
    request<Swap>(`/swaps/${id}/deposit`, { method: "POST", body: JSON.stringify({ txHash }) }),
  swap: (id: string) => request<Swap>(`/swaps/${id}`),
  swaps: (account: string) => request<Swap[]>(`/swaps?account=${account}`),

  buyCurrencies: () => request<string[]>("/buy/currencies"),
  buyQuote: (fiat: number, currency: string, account?: string | null) =>
    request<BuyQuote>(`/buy/quote?fiat=${fiat}&currency=${currency}${account ? `&account=${account}` : ""}`),
  createBuy: (b: { accountId: string; fiat: number; currency: string }) =>
    request<Buy>("/buys", { method: "POST", body: JSON.stringify(b) }),
  markBuySent: (id: string) => request<Buy>(`/buys/${id}/sent`, { method: "POST" }),
  buy: (id: string) => request<Buy>(`/buys/${id}`),
  buys: (account: string) => request<Buy[]>(`/buys?account=${account}`),
};

export function formatFiat(amount: number, currency: Pick<Currency, "symbol" | "code"> | string) {
  const symbol = typeof currency === "string" ? currency : currency.symbol;
  return `${symbol}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount)}`;
}

export const yoctoToNear = (y: string) => Number(BigInt(y) / BigInt("1000000000000000000")) / 1e6;
