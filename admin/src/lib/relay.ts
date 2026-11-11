import "server-only";

/**
 * Server-to-server client for the relay's admin API. The token never reaches
 * the browser: only server components and server actions import this file.
 */
export type SwapStatus = "awaiting_deposit" | "swapping" | "paying" | "paid" | "refunded" | "expired" | "failed";

export type SwapEvent = { at: string; type: string; detail?: Record<string, unknown> };

export type AdminSwap = {
  id: string;
  account_id: string;
  currency: string;
  bank_id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  usdc_amount: string;
  amount_to_transfer: string;
  fee_usdc: string;
  rate: number;
  fiat_amount: number;
  paj_order_id: string | null;
  receive_address: string | null;
  deposit_address: string | null;
  amount_in: string;
  min_amount_in: string | null;
  deposit_tx: string | null;
  status: SwapStatus;
  swap_status: string | null;
  payout_status: string | null;
  payment_reference: string | null;
  out_tx?: string | null;
  intents_ref?: string | null;
  rail?: string;
  provider?: string | null;
  exchange_id?: string | null;
  usdc_received?: string | null;
  payout_tx?: string | null;
  demo: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  events?: SwapEvent[];
  has_paj_session: boolean;
};

export type Stats = {
  total: number;
  live: number;
  simulated: number;
  inFlight: number;
  paid: number;
  failed: number;
  refunded: number;
  expired: number;
  successRate: number | null;
  nearVolume: number;
  usdcVolume: number;
  feesUsdc: number;
  fiatByCurrency: Record<string, number>;
  uniqueWallets: number;
  liveOrders: boolean;
};

export type AdminUser = {
  id: string;
  email: string;
  key_index: number;
  address: string;
  currency: string | null;
  bank_id: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  auto_cashout: number;
  auto_paused_until: string | null;
  paj_expires_at: string | null;
  has_paj_session: boolean;
  created_at: string;
  updated_at: string;
  events?: SwapEvent[];
};

export type AdminUserDetail = AdminUser & {
  onchain: { exists: boolean; near: number; wnear: number } | null;
  cashouts: AdminSwap[];
  buys: { id: string; status: string; fiat_amount: number; currency: string; created_at: string; demo: number }[];
};

export type AdminBuy = {
  id: string;
  account_id: string;
  currency: string;
  fiat_amount: number;
  pay_bank: string;
  pay_account_number: string;
  usdc_expected: number;
  near_expected: string;
  paj_order_id: string | null;
  deposit_address: string | null;
  status: string;
  payment_status: string | null;
  swap_status: string | null;
  paj_tx?: string | null;
  out_tx?: string | null;
  intents_ref?: string | null;
  error: string | null;
  demo: number;
  deadline: string;
  created_at: string;
  updated_at: string;
  events?: SwapEvent[];
};

export type AccessCode = {
  id: string;
  label: string;
  last4: string;
  max_uses: number | null;
  uses: number;
  revoked: number;
  expires_at: string | null;
  created_at: string;
};

export type AuditEntry = { at: string; type: string; actor?: string; detail?: Record<string, unknown> };

export class RelayError extends Error {}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = process.env.RELAY_URL;
  const token = process.env.RELAY_ADMIN_TOKEN;
  if (!base || !token) throw new RelayError("RELAY_URL and RELAY_ADMIN_TOKEN must be set in admin/.env.local");
  let r: Response;
  try {
    r = await fetch(`${base}/admin${path}`, {
      ...init,
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new RelayError(`Can't reach the relay at ${base}`);
  }
  if (r.status === 401) throw new RelayError("The relay rejected the admin token (RELAY_ADMIN_TOKEN ≠ relay's ADMIN_TOKEN)");
  if (r.status === 404 && path === "/stats") throw new RelayError("The relay's admin API is off: set ADMIN_TOKEN in services/relay/.env");
  if (!r.ok) throw new RelayError(`Relay ${path}: ${r.status}`);
  return (await r.json()) as T;
}

export const relay = {
  stats: () => call<Stats>("/stats"),
  swaps: (p: { q?: string; status?: string; mode?: string }) => {
    const qs = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]);
    return call<AdminSwap[]>(`/swaps?${qs}`);
  },
  swap: (id: string) => call<AdminSwap>(`/swaps/${encodeURIComponent(id)}`),
  recheck: (id: string) =>
    call<{ checkedAt: string; swap: string | null; note?: string }>(`/swaps/${encodeURIComponent(id)}/recheck`, { method: "POST" }),
  buys: (q?: string) => call<AdminBuy[]>(`/buys${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  buy: (id: string) => call<AdminBuy>(`/buys/${encodeURIComponent(id)}`),
  treasury: () => call<{ solanaAddress: string; sol: number | null; usdc: number | null; lowSol: boolean }>("/treasury"),
  waitlist: () => call<{ id: string; email: string; source: string | null; created_at: string }[]>("/waitlist"),
  accessCodes: () => call<{ enabled: boolean; codes: AccessCode[] }>("/access-codes"),
  createAccessCode: (b: { label: string; maxUses: number | null; expiresDays: number | null }) =>
    call<{ id: string; code: string }>("/access-codes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }),
  revokeAccessCode: (id: string) => call<{ ok: true }>(`/access-codes/${encodeURIComponent(id)}/revoke`, { method: "POST" }),
  users: (q?: string) => call<AdminUser[]>(`/users${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  user: (id: string) => call<AdminUserDetail>(`/users/${encodeURIComponent(id)}`),
  audit: (q?: string) => call<AuditEntry[]>(`/audit?limit=500${q ? `&q=${encodeURIComponent(q)}` : ""}`),
};
