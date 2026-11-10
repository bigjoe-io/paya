/**
 * Client for the Paya relay. Auth is either a Privy access token (Bearer) or,
 * in demo mode, the signed-in email in `x-demo-email`.
 */
export const RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL ?? "http://localhost:8787";

export type Me = {
  id: string;
  email: string;
  depositAccount: string | null;
  bank: { code: string; name: string; accountNumber: string; accountName: string } | null;
  network: "testnet" | "mainnet";
  balanceYocto?: string;
};

export type OrderStatus = "created" | "forwarding" | "swapping" | "paying" | "paid" | "failed" | "refunded";

export type Order = {
  id: string;
  status: OrderStatus;
  nearAmount: number;
  usdcOut: number | null;
  rateNgn: number | null;
  railFeeNgn: number | null;
  marginNgn: number | null;
  ngnAmount: number | null;
  forwardTx: string | null;
  payoutReference: string | null;
  simulated: boolean;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Rates = {
  ngnPerUsdc: number;
  ngnPerNear: number;
  usdPerNear: number;
  source: string;
  fetchedAt: string;
};

export type Estimate = {
  nearAmount: number;
  rate: Rates & { source: string };
  usdcEstimate: number;
  grossNgn: number;
  railFeeNgn: number;
  marginNgn: number;
  netNgn: number;
  marginBps: number;
};

export type Bank = { bankname: string; bankcode: string };

export type Health = {
  ok: boolean;
  network: string;
  factory: string;
  simulateSwap: boolean;
  simulatePayout: boolean;
  demoAuth: boolean;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type Auth = { email?: string | null; token?: string | null };

async function request<T>(path: string, auth: Auth, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  else if (auth.email) headers["x-demo-email"] = auth.email;
  const r = await fetch(`${RELAY_URL}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  const body = (await r.json().catch(() => ({}))) as { error?: string } & T;
  if (!r.ok) throw new ApiError(body.error ?? `Request failed (${r.status})`, r.status);
  return body as T;
}

export const api = {
  health: () => request<Health>("/health", {}),
  rate: () => request<Rates>("/rate", {}),
  estimate: (near: number) => request<Estimate>(`/estimate?near=${near}`, {}),
  banks: () => request<Bank[]>("/banks", {}),
  signIn: (auth: Auth) => request<Me>("/me", auth, { method: "POST" }),
  me: (auth: Auth) => request<Me>("/me", auth),
  verifyBank: (auth: Auth, bankCode: string, accountNumber: string) =>
    request<{ accountName: string }>("/me/bank/verify", auth, {
      method: "POST",
      body: JSON.stringify({ bankCode, accountNumber }),
    }),
  saveBank: (auth: Auth, bankCode: string, accountNumber: string) =>
    request<Me>("/me/bank", auth, { method: "POST", body: JSON.stringify({ bankCode, accountNumber }) }),
  orders: (auth: Auth) => request<Order[]>("/me/orders", auth),
};

export const formatNgn = (n: number) => "₦" + new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(n);
/** Display precision only: 24 decimal places collapse to a double. */
export const yoctoToNear = (y: string) => Number(y) / 1e24;
