import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";

/**
 * Where the JSON stores live. On Render a persistent disk is mounted at /data; use it
 * automatically so records survive deploys. DATA_DIR overrides; locally it's the cwd.
 */
/** True when `dir` is its own mounted filesystem (a real disk), not a plain folder in the container. */
export function isMount(dir: string) {
  try {
    return statSync(dir).dev !== statSync(dirname(resolve(dir))).dev;
  } catch {
    return false;
  }
}
const DISK_CANDIDATES = ["/data", "/var/data", "/opt/render/project/data", "/opt/render/project/src/data", "/mnt/data"];
export const DATA_DIR = process.env.DATA_DIR ?? DISK_CANDIDATES.find(isMount) ?? ".";

/**
 * Load `.env` from the working directory. Variables already set in the
 * environment win, so a deployment can override any of them.
 */
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  /** Mainnet only: NEAR Intents (1Click) and PAJ production have no testnet. */
  NEAR_RPC_URL: z.string().url().default("https://free.rpc.fastnear.com"),

  /** Solana RPC for Paya's USDC wallet. Production: a paid RPC (Helius, QuickNode, Triton). */
  SOLANA_RPC_URL: z.string().url().default("https://api.mainnet-beta.solana.com"),

  /** Rubic API (swap aggregator). Free tier: 10 requests/min; ask Rubic for a pro key to lift it. */
  RUBIC_API_URL: z.string().url().default("https://api-v2.rubic.exchange"),
  RUBIC_API_KEY: z.string().optional().default(""),
  RUBIC_REFERRER: z.string().default("paya"),

  /** PAJ business API key (production). */
  PAJ_API_KEY: z.string().optional().default(""),
  PAJ_API_URL: z.string().url().default("https://api.paj.cash"),

  /**
   * Safety switch. false: everything is real (sign-in, banks, name lookup,
   * quotes) except that no PAJ order is created and the wallet is never
   * asked to send funds — orders are simulated. true: real money moves.
   */
  LIVE_ORDERS: bool,

  /** Paya's fee, % of the USDC amount, charged through PAJ's businessUSDCFee. */
  FEE_PERCENT: z.coerce.number().min(0).max(10).default(0.5),

  /** Public https URL of this relay, for PAJ webhooks. Optional: the relay also polls. */
  PUBLIC_URL: z.string().url().optional(),

  /**
   * Shared secret for the admin API (/admin/*), used server-to-server by the
   * admin app. Unset = admin API disabled. Generate with: openssl rand -hex 32
   */
  ADMIN_TOKEN: z.string().min(32, "ADMIN_TOKEN must be at least 32 characters").optional(),

  /**
   * Custody. 32 random bytes as hex (openssl rand -hex 32). Every user's NEAR
   * address and key is derived from this. Losing it loses access to users'
   * funds; leaking it gives access to them. Back it up offline.
   */
  MASTER_SEED: z.string().regex(/^[0-9a-f]{64}$/i, "MASTER_SEED must be 64 hex characters").optional(),
  /** Encrypts stored PAJ session tokens (AES-256-GCM). 64 hex characters. */
  DATA_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "DATA_KEY must be 64 hex characters").optional(),
  /** Signs Paya app sessions (HMAC). At least 32 characters. */
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters").optional(),

  /**
   * Optional NEAR account that pays a tiny one-off amount (0.01 NEAR) to
   * activate a new user's address before their first purchase, so it can
   * sign. Without it, buys still work once the address has received NEAR.
   */
  TREASURY_ACCOUNT_ID: z.string().optional(),
  TREASURY_PRIVATE_KEY: z.string().regex(/^ed25519:/, "TREASURY_PRIVATE_KEY must start with ed25519:").optional(),

  /** Auto cash-out starts at this much spendable NEAR. */
  AUTO_MIN_NEAR: z.coerce.number().min(0.1).default(0.4),
  /** NEAR left in each address for fees. */
  RESERVE_NEAR: z.coerce.number().min(0.01).default(0.02),

  PORT: z.coerce.number().int().default(8787),
  DB_PATH: z.string().default(`${DATA_DIR}/paya-data.json`),
  BUYS_PATH: z.string().default(`${DATA_DIR}/paya-buys.json`),
  USERS_PATH: z.string().default(`${DATA_DIR}/paya-users.json`),
  ACCESS_PATH: z.string().default(`${DATA_DIR}/paya-access.json`),
  WAITLIST_PATH: z.string().default(`${DATA_DIR}/paya-waitlist.json`),
  /**
   * Private testing: when set, the app's API only answers people who unlocked
   * it with a tester access code. Same value as the website's ACCESS_SECRET.
   * Generate with: openssl rand -hex 32
   */
  ACCESS_SECRET: z.string().min(32, "ACCESS_SECRET must be at least 32 characters").optional(),
  /** Optional shared tester code (e.g. for judges): unlimited uses, never expires, survives redeploys. */
  PUBLIC_ACCESS_CODE: z.string().min(8).optional(),
  /** How often deposit addresses are checked for incoming NEAR. */
  DEPOSIT_POLL_MS: z.coerce.number().int().min(5000).default(15000),
  POLL_MS: z.coerce.number().int().min(2000).default(5000),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
const env = parsed.data;

// Accounts can't work without these three; refuse to start half-configured.
const missing = (["MASTER_SEED", "DATA_KEY", "SESSION_SECRET"] as const).filter((k) => !env[k]);
if (missing.length) {
  console.error(`Missing ${missing.join(", ")}. Generate each with: openssl rand -hex 32`);
  process.exit(1);
}

export const config = {
  ...env,
  /** Orders are simulated unless we have a PAJ key AND live orders are switched on. */
  demo: !env.PAJ_API_KEY || !env.LIVE_ORDERS,
  corsOrigins: env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
};
