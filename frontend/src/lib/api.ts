/**
 * Client for the Paya relay (services/relay). One identity: the Paya account
 * from email sign-in. It owns a NEAR address and a linked payout bank.
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
  /** Give this to support. */
  supportId?: string;
  /** Paya address → exchange provider (NEAR). */
  nearTx?: string | null;
  /** Exchange provider that converted it (ChangeNOW, SimpleSwap, …). */
  provider?: string | null;
  /** Provider → Paya's Solana wallet (USDC). */
  providerTx?: string | null;
  /** Paya's Solana wallet → PAJ (USDC). */
  solanaTx?: string | null;
  /** NEAR returned to the Paya address. */
  refundTx?: string | null;
  intentsRef?: string | null;
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
  networkFeeUsdc: number;
  nearOut: number;
  nearMin: number;
  rate: number;
  fiatPerNear: number;
  feePercent: number;
  priceSource: "account" | "public";
  etaSeconds: number;
};

export type BuyStatus = "awaiting_payment" | "cancelled" | "converting" | "delivered" | "refunded" | "expired" | "failed";

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
  supportId?: string;
  provider?: string | null;
  /** PAJ → Paya's Solana wallet (USDC). */
  solanaTx?: string | null;
  /** Paya's wallet → exchange provider (USDC). */
  providerTx?: string | null;
  /** Provider → your Paya address (NEAR). */
  nearTx?: string | null;
  intentsRef?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LinkedBank = { currency: string; bankId: string; bankName: string; accountNumber: string; accountName: string };

/** The signed-in account. NEAR amounts are in NEAR. */
export type Me = {
  email: string;
  address: string;
  exists: boolean;
  balance: number;
  spendable: number;
  wnear: number;
  reserve: number;
  autoMin: number;
  bank: LinkedBank | null;
  autoCashout: boolean;
  autoPausedUntil: string | null;
  /** false = the payout session expired; verify the email again to cash out or buy. */
  verified: boolean;
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

/** Tester access token (cookie set at /admin). Sent with every request while Paya is in private testing. */
export const ACCESS_COOKIE = "paya_access";
function accessToken() {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${ACCESS_COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let r: Response;
  const access = accessToken();
  try {
    r = await fetch(`${RELAY_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        ...(access ? { "X-Paya-Access": access } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError("Can't reach Paya right now. Check your connection and try again.", 0);
  }
  const body = (await r.json().catch(() => ({}))) as { error?: string; code?: string } & T;
  if (!r.ok) throw new ApiError(body.error ?? `Request failed (${r.status})`, r.status, body.code);
  return body as T;
}

/** A token Paya can swap: "near" is native NEAR, anything else is a NEAR token contract. */
export type SwapToken = { id: string; symbol: string; name: string; decimals: number; icon: string | null; priceUsd: number };
export type Holding = SwapToken & { balance: string; amount: number; usd: number };
export type TokenSwapQuote = {
  from: string;
  to: string;
  amountIn: number;
  amountOut: number;
  minOut: number;
  amountInUsd: number | null;
  amountOutUsd: number | null;
  max: number;
  etaSeconds: number | null;
};
export type WalletTx = {
  receiverId: string;
  actions: { type: "FunctionCall"; params: { methodName: string; args: object; gas: string; deposit: string } }[];
};
export type ChainToken = { assetId: string; chain: string; symbol: string; decimals: number; priceUsd: number };
export type BridgeChain = { id: string; name: string; tokens: ChainToken[] };
export type BridgeQuote = {
  amountIn: number;
  amountOut: number;
  minOut: number;
  amountInUsd: number | null;
  amountOutUsd: number | null;
  etaSeconds: number | null;
  max: number | null;
};
export type DepositInstructions = {
  depositAddress: string;
  depositMemo: string | null;
  chain: string;
  symbol: string;
  amount: number;
  amountOut: number;
  to: string;
  deadline: string | null;
  registration: WalletTx | null;
};
export type Proposal =
  | { id: string; kind: "swap"; from: string; to: string; amount: number; fromSymbol: string; toSymbol: string; amountOut: number; minOut: number }
  | { id: string; kind: "cashout"; near: number; fiatOut: number; currency: string; bank: string }
  | { id: string; kind: "bridge_out"; from: string; fromSymbol: string; toAsset: string; toSymbol: string; chain: string; amount: number; recipient: string; amountOut: number }
  | { id: string; kind: "send_near"; to: string; near: number };
export type TokenSwapStatus = { status: "processing" | "done" | "refunded" | "failed"; raw: string };

const qs = (o: Record<string, string | number>) =>
  Object.entries(o)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

export const api = {
  joinWaitlist: (email: string, source?: string) =>
    request<{ ok: true }>("/waitlist", { method: "POST", body: JSON.stringify({ email, source }) }),
  redeemAccess: (code: string) =>
    request<{ token: string; expiresAt: string; label: string }>("/access/redeem", { method: "POST", body: JSON.stringify({ code }) }),
  health: () => request<{ ok: boolean; demo: boolean; feePercent: number }>("/health"),
  currencies: () => request<Currency[]>("/currencies"),
  prices: () => request<{ nearUsd: number; ngnPerUsd: number | null }>("/prices"),
  quote: (near: number, currency: string) => request<Quote>(`/quote?near=${near}&currency=${currency}`),

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

  me: () => request<Me>("/me"),
  setBank: (b: { currency: string; bankId: string; accountNumber: string }) =>
    request<Me>("/me/bank", { method: "PUT", body: JSON.stringify(b) }),
  setAuto: (enabled: boolean) => request<Me>("/me/auto", { method: "PUT", body: JSON.stringify({ enabled }) }),
  cashoutLimits: () => request<{ minNear: number }>("/cashout/limits"),
  cashOut: (near: number) => request<Swap>("/cashout", { method: "POST", body: JSON.stringify({ near }) }),
  withdraw: (b: { to: string; near: number; otp: string; deviceId: string }) =>
    request<{ txHash: string }>("/me/withdraw", { method: "POST", body: JSON.stringify(b) }),
  activity: () => request<{ cashouts: Swap[]; buys: Buy[] }>("/me/activity"),
  swap: (id: string) => request<Swap>(`/swaps/${id}`),

  buyCurrencies: () => request<{ code: string; min: number }[]>("/buy/currencies"),
  buyQuote: (fiat: number, currency: string) => request<BuyQuote>(`/buy/quote?fiat=${fiat}&currency=${currency}`),
  createBuy: (b: { fiat: number; currency: string }) =>
    request<Buy>("/buys", { method: "POST", body: JSON.stringify(b) }),
  cancelBuy: (id: string) => request<Buy>(`/buys/${id}/cancel`, { method: "POST" }),
  markBuySent: (id: string) => request<Buy>(`/buys/${id}/sent`, { method: "POST" }),
  buy: (id: string) => request<Buy>(`/buys/${id}`),

  swapTokens: () => request<SwapToken[]>("/tokens"),
  holdings: () => request<{ holdings: Holding[]; totalUsd: number }>("/me/holdings"),
  tokenSwapQuote: (from: string, to: string, amount: number) =>
    request<TokenSwapQuote>(`/me/token-swap/quote?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=${amount}`),
  tokenSwap: (b: { from: string; to: string; amount: number }) =>
    request<{ depositAddress: string; txHash: string; amountOut: number; to: string }>("/me/token-swap", { method: "POST", body: JSON.stringify(b) }),
  tokenSwapStatus: (depositAddress: string) => request<TokenSwapStatus>(`/me/token-swap/${depositAddress}`),

  walletHoldings: (account: string) => request<{ holdings: Holding[]; totalUsd: number }>(`/wallet/holdings?account=${encodeURIComponent(account)}`),
  walletQuote: (account: string, from: string, to: string, amount: number) =>
    request<TokenSwapQuote>(
      `/wallet/quote?account=${encodeURIComponent(account)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&amount=${amount}`,
    ),
  walletSwap: (b: { account: string; from: string; to: string; amount: number }) =>
    request<{ depositAddress: string; amountOut: number; transactions: WalletTx[] }>("/wallet/swap", { method: "POST", body: JSON.stringify(b) }),
  walletSubmit: (depositAddress: string, txHash: string) =>
    request<{ ok: true }>("/wallet/swap/submit", { method: "POST", body: JSON.stringify({ depositAddress, txHash }) }),
  walletSwapStatus: (depositAddress: string) => request<TokenSwapStatus>(`/wallet/swap/${depositAddress}`),

  ask: (messages: { role: "user" | "assistant"; text: string }[]) =>
    request<{ reply: string; proposals: Proposal[] }>("/me/ask", { method: "POST", body: JSON.stringify({ messages }) }),
  bridgeChains: () => request<BridgeChain[]>("/bridge/chains"),
  bridgeOutQuote: (b: { from: string; toAsset: string; amount: number; recipient: string }, account?: string) =>
    request<BridgeQuote>(`${account ? "/wallet" : "/me"}/bridge/out/quote?${qs({ ...b, ...(account ? { account } : {}) })}`),
  bridgeInQuote: (b: { fromAsset: string; to: string; amount: number }, account?: string) =>
    request<BridgeQuote>(`${account ? "/wallet" : "/me"}/bridge/in/quote?${qs({ ...b, ...(account ? { account } : {}) })}`),
  bridgeOut: (b: { from: string; toAsset: string; amount: number; recipient: string; otp: string; deviceId: string }) =>
    request<{ depositAddress: string; amountOut: number; txHash: string }>("/me/bridge/out", { method: "POST", body: JSON.stringify(b) }),
  walletBridgeOut: (b: { account: string; from: string; toAsset: string; amount: number; recipient: string }) =>
    request<{ depositAddress: string; amountOut: number; transactions: WalletTx[] }>("/wallet/bridge/out", { method: "POST", body: JSON.stringify(b) }),
  bridgeIn: (b: { fromAsset: string; to: string; amount: number; refundAddress: string }, account?: string) =>
    request<DepositInstructions>(account ? "/wallet/bridge/in" : "/me/bridge/in", {
      method: "POST",
      body: JSON.stringify(account ? { ...b, account } : b),
    }),
};

export function formatFiat(amount: number, currency: Pick<Currency, "symbol" | "code"> | string) {
  const symbol = typeof currency === "string" ? currency : currency.symbol;
  return `${symbol}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount)}`;
}

export const yoctoToNear = (y: string) => Number(BigInt(y) / BigInt("1000000000000000000")) / 1e6;
