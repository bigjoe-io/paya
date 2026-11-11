import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { config } from "./config.js";

/**
 * Cash-out records, kept in one JSON file. The relay only tracks a handful of
 * in-flight orders, so a file is enough and runs on any Node ≥ 20 (no native
 * modules, no experimental flags). Writes are atomic: temp file + rename.
 */
export type SwapStatus =
  | "awaiting_deposit" // order placed, waiting for the user's wallet to send NEAR
  | "swapping" // NEAR received by Intents, becoming USDC on Solana
  | "paying" // USDC delivered to PAJ, bank payout in progress
  | "paid" // fiat confirmed in the recipient's account
  | "refunded"
  | "expired"
  | "failed";

export type Swap = {
  id: string;
  account_id: string;
  currency: string;
  bank_id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  usdc_amount: string; // USDC the payout is priced on
  amount_to_transfer: string; // exact USDC PAJ must receive (includes Paya's fee)
  fee_usdc: string;
  rate: number;
  fiat_amount: number;
  paj_order_id: string | null;
  paj_token: string | null; // the user's PAJ session, to track this order; cleared when final
  receive_address: string | null;
  deposit_address: string | null;
  amount_in: string; // yoctoNEAR the wallet sends (includes 1% slippage buffer; unused part refunded)
  min_amount_in: string | null;
  deposit_tx: string | null;
  status: SwapStatus;
  swap_status: string | null; // raw 1Click status
  payout_status: string | null; // raw PAJ status
  payment_reference: string | null;
  demo: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  /** Append-only timeline for support and disputes. */
  events?: SwapEvent[];
};

export type SwapEvent = { at: string; type: string; detail?: Record<string, unknown> };

const FILE = config.DB_PATH;
const ACTIVE: SwapStatus[] = ["awaiting_deposit", "swapping", "paying"];

function load(): Map<string, Swap> {
  if (!existsSync(FILE)) return new Map();
  try {
    const list = JSON.parse(readFileSync(FILE, "utf8")) as Swap[];
    return new Map(list.map((s) => [s.id, s]));
  } catch (e) {
    throw new Error(`Can't read ${FILE}: ${(e as Error).message}. Move it aside to start fresh.`);
  }
}

const rows = load();

function persist() {
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify([...rows.values()], null, 1), { mode: 0o600 });
  renameSync(tmp, FILE);
}

const now = () => new Date().toISOString();
const copy = (s: Swap | undefined) => (s ? { ...s } : undefined);
const newestFirst = (a: Swap, b: Swap) => b.created_at.localeCompare(a.created_at);

export const swaps = {
  byId: (id: string) => copy(rows.get(id)),
  byPajOrderId: (id: string) => copy([...rows.values()].find((s) => s.paj_order_id === id)),
  forAccount: (accountId: string, limit = 50) =>
    [...rows.values()].filter((s) => s.account_id === accountId).sort(newestFirst).slice(0, limit).map((s) => ({ ...s })),
  active: () =>
    [...rows.values()]
      .filter((s) => ACTIVE.includes(s.status))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((s) => ({ ...s })),
  insert: (s: Omit<Swap, "created_at" | "updated_at">) => {
    if (rows.has(s.id)) throw new Error(`Duplicate swap ${s.id}`);
    const t = now();
    rows.set(s.id, { ...s, created_at: t, updated_at: t });
    persist();
  },
  /** Record what happened to a swap, in order. Never edited, only appended. */
  event: (id: string, type: string, detail?: Record<string, unknown>) => {
    const s = rows.get(id);
    if (!s) return;
    s.events = [...(s.events ?? []), { at: now(), type, ...(detail ? { detail } : {}) }];
    persist();
  },
  all: () => [...rows.values()].sort(newestFirst).map((s) => ({ ...s })),
  update: (id: string, patch: Partial<Swap>) => {
    const s = rows.get(id);
    if (!s || Object.keys(patch).length === 0) return;
    rows.set(id, { ...s, ...patch, id, updated_at: now() });
    persist();
  },
};
