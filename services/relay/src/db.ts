import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

/**
 * One table: a swap is one "NEAR → fiat" cash-out from a connected wallet.
 * Node's built-in SQLite, no native addon.
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
};

export const db = new DatabaseSync(config.DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS swaps (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  currency TEXT NOT NULL,
  bank_id TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  usdc_amount TEXT NOT NULL,
  amount_to_transfer TEXT NOT NULL,
  fee_usdc TEXT NOT NULL,
  rate REAL NOT NULL,
  fiat_amount REAL NOT NULL,
  paj_order_id TEXT,
  paj_token TEXT,
  receive_address TEXT,
  deposit_address TEXT,
  amount_in TEXT NOT NULL,
  min_amount_in TEXT,
  deposit_tx TEXT,
  status TEXT NOT NULL,
  swap_status TEXT,
  payout_status TEXT,
  payment_reference TEXT,
  demo INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS swaps_account ON swaps(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS swaps_status ON swaps(status);
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`);

type Param = string | number | null;
const get = <T>(sql: string, ...p: Param[]) => db.prepare(sql).get(...p) as T | undefined;
const all = <T>(sql: string, ...p: Param[]) => db.prepare(sql).all(...p) as T[];
const run = (sql: string, ...p: Param[]) => db.prepare(sql).run(...p);

export const swaps = {
  byId: (id: string) => get<Swap>("SELECT * FROM swaps WHERE id = ?", id),
  byPajOrderId: (id: string) => get<Swap>("SELECT * FROM swaps WHERE paj_order_id = ?", id),
  forAccount: (accountId: string, limit = 50) =>
    all<Swap>("SELECT * FROM swaps WHERE account_id = ? ORDER BY created_at DESC LIMIT ?", accountId, limit),
  active: () =>
    all<Swap>("SELECT * FROM swaps WHERE status IN ('awaiting_deposit','swapping','paying') ORDER BY created_at"),
  insert: (s: Omit<Swap, "created_at" | "updated_at">) => {
    const keys = Object.keys(s) as (keyof typeof s)[];
    run(
      `INSERT INTO swaps (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
      ...keys.map((k) => s[k] as Param),
    );
  },
  update: (id: string, patch: Partial<Swap>) => {
    const keys = Object.keys(patch) as (keyof Swap)[];
    if (!keys.length) return;
    run(
      `UPDATE swaps SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      ...keys.map((k) => patch[k] as Param),
      id,
    );
  },
};

export const webhooks = {
  /** Returns true the first time an event id is seen. */
  firstSeen: (eventId: string) =>
    Number(run("INSERT OR IGNORE INTO webhook_events (event_id) VALUES (?)", eventId).changes) > 0,
};
