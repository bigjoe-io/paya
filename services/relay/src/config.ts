import { z } from "zod";

const schema = z.object({
  NEAR_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  NEAR_RPC_URL: z.string().url().optional(),
  FACTORY_ACCOUNT_ID: z.string().min(2),
  OPERATOR_ACCOUNT_ID: z.string().min(2),
  OPERATOR_PRIVATE_KEY: z.string().startsWith("ed25519:"),
  /** Deposit contract deployed onto each user's hex address. */
  DEPOSIT_WASM_PATH: z.string().default("../../contracts/factory/res/deposit.wasm"),

  ONECLICK_JWT: z.string().optional().default(""),
  SOLANA_USDC_RECIPIENT: z.string().optional().default(""),

  FOSSAPAY_API_KEY: z.string().optional().default(""),
  FOSSAPAY_API_URL: z.string().url().default("https://api-production.fossapay.com/api/v1"),
  FOSSAPAY_WEBHOOK_SECRET: z.string().optional().default(""),

  MARGIN_BPS: z.coerce.number().int().min(0).max(2000).default(50),
  MIN_CASHOUT_NEAR: z.coerce.number().positive().default(0.1),
  DEPOSIT_RESERVE_NEAR: z.coerce.number().min(0).default(0.06),

  PRIVY_APP_ID: z.string().optional().default(""),
  PRIVY_APP_SECRET: z.string().optional().default(""),

  PORT: z.coerce.number().int().default(8787),
  DB_PATH: z.string().default("./paya.db"),
  POLL_MS: z.coerce.number().int().min(1000).default(6000),
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
  rpcUrl:
    env.NEAR_RPC_URL ??
    (env.NEAR_NETWORK === "mainnet" ? "https://free.rpc.fastnear.com" : "https://test.rpc.fastnear.com"),
  /** 1Click only exists on mainnet; elsewhere the swap is simulated. */
  simulateSwap: env.NEAR_NETWORK !== "mainnet",
  /** No production API key → payouts are simulated and logged. */
  simulatePayout: !env.FOSSAPAY_API_KEY,
  /** No Privy credentials → accept x-demo-email from the frontend. */
  demoAuth: !env.PRIVY_APP_ID || !env.PRIVY_APP_SECRET,
  corsOrigins: env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
};

export type Config = typeof config;
