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
  /** Rubic provider's tx delivering USDC to Paya's Solana wallet (or the refund). */
  out_tx?: string | null;
  /** Which rail moved the money: "rubic" (current) or "intents" (legacy NEAR Intents orders). */
  rail?: "rubic" | "intents";
  provider?: string | null; // e.g. changenow, simple_swap
  rubic_id?: string | null;
  exchange_id?: string | null;
  usdc_received?: string | null; // what actually landed in Paya's wallet
  payout_tx?: string | null; // Paya wallet → PAJ (exact USDC)
  payout_started?: number; // set before sending to PAJ: never send twice
  /** NEAR Intents support reference. */
  intents_ref?: string | null;
  demo: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  /** Append-only timeline for support and disputes. */
  events?: SwapEvent[];
};

export type SwapEvent = { at: string; type: string; detail?: Record<string, unknown> };

const ACTIVE: SwapStatus[] = ["awaiting_deposit", "swapping", "paying"];
const now = () => new Date().toISOString();

type Row = { id: string; created_at: string; updated_at: string; events?: SwapEvent[] };

/**
 * A tiny JSON-file table. Atomic writes (temp file + rename), owner-only
 * permissions, append-only event timeline per row.
 */
function createStore<T extends Row>(file: string, name: string) {
  const rows: Map<string, T> = (() => {
    if (!existsSync(file)) return new Map();
    try {
      const list = JSON.parse(readFileSync(file, "utf8")) as T[];
      return new Map(list.map((r) => [r.id, r]));
    } catch (e) {
      throw new Error(`Can't read ${file}: ${(e as Error).message}. Move it aside to start fresh.`);
    }
  })();
  const persist = () => {
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify([...rows.values()], null, 1), { mode: 0o600 });
    renameSync(tmp, file);
  };
  const newestFirst = (a: T, b: T) => b.created_at.localeCompare(a.created_at);
  const list = () => [...rows.values()];
  return {
    byId: (id: string) => {
      const r = rows.get(id);
      return r ? { ...r } : undefined;
    },
    find: (pred: (r: T) => boolean) => {
      const r = list().find(pred);
      return r ? { ...r } : undefined;
    },
    where: (pred: (r: T) => boolean) => list().filter(pred).map((r) => ({ ...r })),
    all: () => list().sort(newestFirst).map((r) => ({ ...r })),
    forAccount: (accountId: string, limit = 50) =>
      list()
        .filter((r) => (r as unknown as { account_id: string }).account_id === accountId)
        .sort(newestFirst)
        .slice(0, limit)
        .map((r) => ({ ...r })),
    insert: (r: Omit<T, "created_at" | "updated_at">) => {
      if (rows.has(r.id)) throw new Error(`Duplicate ${name} ${r.id}`);
      const t = now();
      rows.set(r.id, { ...r, created_at: t, updated_at: t } as T);
      persist();
    },
    update: (id: string, patch: Partial<T>) => {
      const r = rows.get(id);
      if (!r || Object.keys(patch).length === 0) return;
      rows.set(id, { ...r, ...patch, id, updated_at: now() });
      persist();
    },
    /** Copy rows in as-is (migration). Rows whose id already exists are skipped, never overwritten. */
    importRows: (incoming: T[]) => {
      let added = 0;
      for (const r of incoming) {
        if (!r?.id || rows.has(r.id)) continue;
        rows.set(r.id, { ...r });
        added++;
      }
      if (added) persist();
      return added;
    },
    /** Record what happened, in order. Never edited, only appended. */
    event: (id: string, type: string, detail?: Record<string, unknown>) => {
      const r = rows.get(id);
      if (!r) return;
      r.events = [...(r.events ?? []), { at: now(), type, ...(detail ? { detail } : {}) }];
      persist();
    },
  };
}

const swapStore = createStore<Swap>(config.DB_PATH, "swap");

export const swaps = {
  ...swapStore,
  byPajOrderId: (id: string) => swapStore.find((s) => s.paj_order_id === id),
  active: () =>
    swapStore
      .where((s) => ACTIVE.includes(s.status))
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
};

/* ---------- buys: fiat → NEAR ---------- */

export type BuyStatus =
  | "awaiting_payment" // waiting for the user's bank transfer to PAJ
  | "cancelled" // user cancelled, or nobody paid within the window
  | "converting" // PAJ received the fiat; USDC on its way / being swapped to NEAR
  | "delivered" // NEAR (or wNEAR) is in the user's wallet
  | "refunded"
  | "expired"
  | "failed";

export type Buy = {
  id: string;
  account_id: string; // the NEAR wallet that receives
  currency: string;
  fiat_amount: number; // what the user transfers
  pay_bank: string; // where they transfer it (PAJ's collection account)
  pay_account_number: string;
  pay_account_name: string;
  usdc_expected: number;
  fee_usdc: number;
  near_expected: string; // yocto
  near_min: string; // yocto
  rate: number; // fiat per USDC
  paj_order_id: string | null;
  paj_token: string | null; // user's PAJ session, cleared when final
  deposit_address: string | null; // NEAR Intents Solana deposit address (PAJ's recipient)
  deadline: string;
  status: BuyStatus;
  payment_status: string | null; // raw PAJ status
  swap_status: string | null; // raw 1Click status
  /** PAJ's Solana tx sending the USDC to Paya's wallet. */
  paj_tx?: string | null;
  rail?: "rubic" | "intents";
  provider?: string | null;
  rubic_id?: string | null;
  usdc_received?: string | null;
  /** Paya wallet → provider deposit (Solana tx). */
  swap_tx?: string | null;
  tried_providers?: string[];
  retry_after?: string | null;
  /** NEAR tx that delivered the NEAR (or the refund). */
  out_tx?: string | null;
  intents_ref?: string | null;
  user_marked_sent?: number;
  error: string | null;
  demo: number;
  created_at: string;
  updated_at: string;
  events?: SwapEvent[];
};

const BUY_ACTIVE: BuyStatus[] = ["awaiting_payment", "converting"];
const buyStore = createStore<Buy>(config.BUYS_PATH, "buy");

export const buys = {
  ...buyStore,
  /** Running orders, plus cancelled ones still inside their window (a late transfer must still be delivered). */
  active: () =>
    buyStore
      .where((b) => BUY_ACTIVE.includes(b.status) || (b.status === "cancelled" && Date.parse(b.deadline) > Date.now()))
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
};

/* ---------- users: email ⇄ NEAR address ⇄ payout bank ---------- */

export type User = {
  id: string;
  email: string; // lowercased; unique
  key_index: number; // derives the NEAR key; unique, never reused
  address: string; // implicit NEAR account (64 hex)
  // payout bank (one per user, changeable)
  currency: string | null;
  bank_id: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  auto_cashout: number; // 1 = cash out any NEAR that arrives
  auto_paused_until: string | null; // back-off after a failed auto cash-out
  paj_token_enc: string | null; // AES-GCM encrypted PAJ session
  paj_expires_at: string | null;
  created_at: string;
  updated_at: string;
  events?: SwapEvent[];
};

const userStore = createStore<User>(config.USERS_PATH, "user");

export const users = {
  ...userStore,
  byEmail: (email: string) => userStore.find((u) => u.email === email.toLowerCase()),
  byAddress: (address: string) => userStore.find((u) => u.address === address),
  nextIndex: () => userStore.all().reduce((m, u) => Math.max(m, u.key_index + 1), 0),
};

/* ---------- tester access codes and the waitlist ---------- */

export type AccessCode = {
  id: string;
  label: string;
  code_hash: string; // sha256 of the code; the code itself is shown once, at creation
  last4: string;
  max_uses: number | null; // null = unlimited
  uses: number;
  revoked: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  events?: SwapEvent[];
};
export const accessCodes = createStore<AccessCode>(config.ACCESS_PATH, "access code");

export type WaitlistEntry = {
  id: string;
  email: string; // lowercased; unique
  source: string | null;
  created_at: string;
  updated_at: string;
  events?: SwapEvent[];
};
export const waitlist = createStore<WaitlistEntry>(config.WAITLIST_PATH, "waitlist entry");
