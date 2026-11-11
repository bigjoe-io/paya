import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

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

  /** Optional 1Click partner JWT: without it 1Click adds 0.25% to every quote. */
  ONECLICK_JWT: z.string().optional().default(""),

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

  PORT: z.coerce.number().int().default(8787),
  DB_PATH: z.string().default("./paya-data.json"),
  BUYS_PATH: z.string().default("./paya-buys.json"),
  POLL_MS: z.coerce.number().int().min(2000).default(5000),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
const env = parsed.data;

export const config = {
  ...env,
  /** Orders are simulated unless we have a PAJ key AND live orders are switched on. */
  demo: !env.PAJ_API_KEY || !env.LIVE_ORDERS,
  corsOrigins: env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
};
