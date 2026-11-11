import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

/**
 * Storage: Node's built-in SQLite (no native addon to compile). One file,
 * WAL mode, three tables: users, orders, webhook_events.
 */
export type User = {
  id: string; // slug, also the sub-account name: <id>.<factory>
  email: string;
  deposit_account: string | null;
  bank_code: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  created_at: string;
};

export type OrderStatus = "created" | "forwarding" | "swapping" | "paying" | "paid" | "failed" | "refunded";

export type Order = {
  id: string;
  user_id: string;
  deposit_account: string;
  near_yocto: string;
  status: OrderStatus;
  oneclick_deposit_address: string | null;
  oneclick_quote: string | null; // JSON
  forward_tx: string | null;
  usdc_out: string | null; // decimal string, 6dp
  rate_ngn: number | null;
  rail_fee_ngn: number | null;
  margin_ngn: number | null;
  ngn_amount: number | null;
  payout_id: string | null;
  payout_reference: string | null;
  simulated: number; // 0/1
  error: string | null;
  created_at: string;
  updated_at: string;
};

export const db = new DatabaseSync(config.DB_PATH);
db.exec("PRAGMA journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  deposit_account TEXT,
  bank_code TEXT,
  bank_name TEXT,
  account_number TEXT,
  account_name TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  deposit_account TEXT NOT NULL,
  near_yocto TEXT NOT NULL,
  status TEXT NOT NULL,
  oneclick_deposit_address TEXT,
  oneclick_quote TEXT,
  forward_tx TEXT,
  usdc_out TEXT,
  rate_ngn REAL,
  rail_fee_ngn REAL,
  margin_ngn REAL,
  ngn_amount REAL,
  payout_id TEXT,
  payout_reference TEXT,
  simulated INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
CREATE TABLE IF NOT EXISTS pending_keys (
  user_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  secret_key TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`);

type Param = string | number | null;
const get = <T>(sql: string, ...params: Param[]) => db.prepare(sql).get(...params) as T | undefined;
const all = <T>(sql: string, ...params: Param[]) => db.prepare(sql).all(...params) as T[];
const run = (sql: string, ...params: Param[]) => db.prepare(sql).run(...params);

/* ---------- users ---------- */

export const users = {
  byEmail: (email: string) => get<User>("SELECT * FROM users WHERE email = ?", email.toLowerCase()),
  byId: (id: string) => get<User>("SELECT * FROM users WHERE id = ?", id),
  insert: (id: string, email: string) => run("INSERT INTO users (id, email) VALUES (?, ?)", id, email.toLowerCase()),
  setDeposit: (id: string, depositAccount: string) =>
    run("UPDATE users SET deposit_account = ? WHERE id = ?", depositAccount, id),
  setBank: (id: string, b: { code: string; name: string; number: string; accountName: string }) =>
    run(
      "UPDATE users SET bank_code = ?, bank_name = ?, account_number = ?, account_name = ? WHERE id = ?",
      b.code,
      b.name,
      b.number,
      b.accountName,
      id,
    ),
  readyForCashout: () =>
    all<User>("SELECT * FROM users WHERE deposit_account IS NOT NULL AND account_number IS NOT NULL"),
  idTaken: (id: string) => Boolean(get("SELECT 1 FROM users WHERE id = ?", id)),
};

/* ---------- orders ---------- */

const ACTIVE: OrderStatus[] = ["created", "forwarding", "swapping", "paying"];
const ACTIVE_SQL = ACTIVE.map((s) => `'${s}'`).join(",");

export const orders = {
  byId: (id: string) => get<Order>("SELECT * FROM orders WHERE id = ?", id),
  forUser: (userId: string, limit = 50) =>
    all<Order>("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", userId, limit),
  activeForUser: (userId: string) =>
    get<Order>(`SELECT * FROM orders WHERE user_id = ? AND status IN (${ACTIVE_SQL}) LIMIT 1`, userId),
  byStatus: (status: OrderStatus) => all<Order>("SELECT * FROM orders WHERE status = ?", status),
  byPayoutReference: (ref: string) => get<Order>("SELECT * FROM orders WHERE payout_reference = ?", ref),
  recentFailures: (userId: string, sinceIso: string) =>
    get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND status IN ('failed','refunded') AND updated_at > ?",
      userId,
      sinceIso,
    )?.n ?? 0,
  insert: (o: Pick<Order, "id" | "user_id" | "deposit_account" | "near_yocto" | "simulated">) =>
    run(
      "INSERT INTO orders (id, user_id, deposit_account, near_yocto, status, simulated) VALUES (?, ?, ?, ?, 'created', ?)",
      o.id,
      o.user_id,
      o.deposit_account,
      o.near_yocto,
      o.simulated,
    ),
  update: (id: string, patch: Partial<Order>) => {
    const keys = Object.keys(patch) as (keyof Order)[];
    if (keys.length === 0) return;
    const sets = keys.map((k) => `${k} = ?`).join(", ");
    const values = keys.map((k) => patch[k] as Param);
    run(`UPDATE orders SET ${sets}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`, ...values, id);
  },
};

/**
 * The key for a hex address lives here only between "generated" and
 * "deleted on-chain" (a few seconds), so a crash mid-setup can resume.
 */
export const pendingKeys = {
  get: (userId: string) =>
    get<{ user_id: string; account_id: string; secret_key: string }>(
      "SELECT * FROM pending_keys WHERE user_id = ?",
      userId,
    ),
  put: (userId: string, accountId: string, secretKey: string) =>
    run("INSERT OR REPLACE INTO pending_keys (user_id, account_id, secret_key) VALUES (?, ?, ?)", userId, accountId, secretKey),
  clear: (userId: string) => run("DELETE FROM pending_keys WHERE user_id = ?", userId),
};

export const webhooks = {
  seen: (eventId: string) => Boolean(get("SELECT 1 FROM webhook_events WHERE event_id = ?", eventId)),
  record: (eventId: string, type: string) =>
    run("INSERT OR IGNORE INTO webhook_events (event_id, event_type) VALUES (?, ?)", eventId, type),
};
