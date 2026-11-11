import { config } from "./config.js";
import { log, warn } from "./log.js";
import { USDC_MINT } from "./solana.js";

/**
 * Rubic: an aggregator of instant-exchange providers (ChangeNOW, SimpleSwap,
 * The Change, ChangeHero, …). For a "deposit" swap we send funds to the
 * provider's deposit address and it delivers to our receiver; if it can't,
 * it refunds to our refund address. Every quote asks all providers; we take
 * the best one that's actually available, so one provider being down
 * doesn't stop Paya.
 *
 * NEAR Intents is one of Rubic's providers and is excluded on purpose.
 */
export const EXCLUDED_PROVIDERS = new Set(["near_intents"]);

export const TOKENS = {
  NEAR: { address: "near", blockchain: "NEAR", decimals: 24 },
  USDC_SOL: { address: USDC_MINT.toBase58(), blockchain: "SOLANA", decimals: 6 },
} as const;
type Token = (typeof TOKENS)[keyof typeof TOKENS];

export type RubicRoute = {
  id: string;
  providerType: string;
  estimate: { destinationTokenAmount: string; destinationTokenMinAmount: string; durationInMinutes: number; priceImpact: number | null };
};
export type DepositInstructions = {
  depositAddress: string;
  amountToSend: string;
  exchangeId: string | null;
  extraFields: { name: string; value: string } | null;
};
export type RubicStatus = "PENDING" | "NOT_FOUND" | "SUCCESS" | "REVERTED" | "FAIL" | "KYC_REQUIRED" | "READY_TO_CLAIM";

/* ---------- rate limit: the free API allows 10 requests per minute ---------- */

const LIMIT = config.RUBIC_API_KEY ? 300 : 9; // keep one spare
const stamps: number[] = [];
let chain: Promise<unknown> = Promise.resolve();

/** Run calls one at a time and never more than LIMIT per rolling minute. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    const now = Date.now();
    while (stamps.length && now - stamps[0] > 60_000) stamps.shift();
    if (stamps.length >= LIMIT) await new Promise((r) => setTimeout(r, 60_000 - (now - stamps[0]) + 50));
    stamps.push(Date.now());
    return fn();
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}

/** Requests left in the current minute (previews only spend spare capacity). */
export function spareCapacity() {
  const now = Date.now();
  return LIMIT - stamps.filter((t) => now - t < 60_000).length;
}

const base = () => (config.RUBIC_API_KEY ? config.RUBIC_API_URL.replace("api-v2", "pro-api-v2") : config.RUBIC_API_URL);

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  return throttled(async () => {
    const r = await fetch(`${base()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(config.RUBIC_API_KEY ? { apikey: config.RUBIC_API_KEY } : {}),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(60_000),
    });
    const text = await r.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    if (!r.ok) {
      const reason = (body as { errors?: { reason?: string }[]; error?: { reason?: string } })?.errors?.[0]?.reason ?? (body as { error?: { reason?: string } })?.error?.reason;
      throw new Error(`Rubic ${path.split("?")[0]} ${r.status}: ${reason ?? String(text).slice(0, 160)}`);
    }
    return body as T;
  });
}

const amountStr = (n: number, decimals: number) => n.toFixed(Math.min(decimals, 8)).replace(/\.?0+$/, "");

type QuoteAll = {
  routes: RubicRoute[];
  failed?: { providerType: string; data?: { minAmount?: string }; error?: { data?: { minAmount?: string } } }[];
};

/**
 * All deposit routes for `amount` of `from` → `to`, best first, NEAR Intents
 * removed. Also returns the smallest provider minimum seen, if any.
 */
export async function quote(from: Token, to: Token, amount: number) {
  const r = await call<QuoteAll>("/api/routes/quoteDepositTrades", {
    method: "POST",
    body: JSON.stringify({
      srcTokenAddress: from.address,
      srcTokenBlockchain: from.blockchain,
      srcTokenAmount: amountStr(amount, from.decimals),
      dstTokenAddress: to.address,
      dstTokenBlockchain: to.blockchain,
      referrer: config.RUBIC_REFERRER,
      showFailedRoutes: true,
    }),
  });
  const routes = (r.routes ?? [])
    .filter((x) => !EXCLUDED_PROVIDERS.has(x.providerType))
    .sort((a, b) => Number(b.estimate.destinationTokenAmount) - Number(a.estimate.destinationTokenAmount));
  const mins = (r.failed ?? [])
    .filter((f) => !EXCLUDED_PROVIDERS.has(f.providerType))
    .map((f) => Number(f.data?.minAmount ?? f.error?.data?.minAmount))
    .filter((n) => Number.isFinite(n) && n > 0);
  return { routes, smallestMin: mins.length ? Math.min(...mins) : null };
}

/** Lock a route and get where to send the funds. */
export async function swap(p: {
  from: Token;
  to: Token;
  amount: number;
  route: RubicRoute;
  receiver: string;
  refundAddress: string;
  fromAddress: string;
}): Promise<DepositInstructions & { provider: string; estimate: RubicRoute["estimate"] }> {
  const r = await call<{ transaction: DepositInstructions; providerType: string; estimate: RubicRoute["estimate"] }>(
    "/api/routes/swapDepositTrade",
    {
      method: "POST",
      body: JSON.stringify({
        srcTokenAddress: p.from.address,
        srcTokenBlockchain: p.from.blockchain,
        srcTokenAmount: amountStr(p.amount, p.from.decimals),
        dstTokenAddress: p.to.address,
        dstTokenBlockchain: p.to.blockchain,
        referrer: config.RUBIC_REFERRER,
        id: p.route.id,
        preferredProvider: p.route.providerType,
        receiver: p.receiver,
        refundAddress: p.refundAddress,
        fromAddress: p.fromAddress,
      }),
    },
  );
  const t = r.transaction;
  if (!t?.depositAddress || !t.amountToSend) throw new Error("Rubic returned no deposit address");
  log("rubic", `${r.providerType}: send ${t.amountToSend} to ${t.depositAddress}${t.extraFields ? ` (${t.extraFields.name} ${t.extraFields.value})` : ""}`);
  return { ...t, extraFields: t.extraFields ?? null, exchangeId: t.exchangeId ?? null, provider: r.providerType, estimate: r.estimate };
}

/**
 * Try routes best-first until one gives deposit instructions we can use.
 * `acceptExtra`: whether the source chain can carry a memo (Solana yes, a
 * plain NEAR transfer no).
 */
export async function lockBestRoute(p: {
  from: Token;
  to: Token;
  amount: number;
  receiver: string;
  refundAddress: string;
  fromAddress: string;
  acceptExtra: boolean;
  exclude?: string[];
}) {
  const { routes, smallestMin } = await quote(p.from, p.to, p.amount);
  const usable = routes.filter((r) => !(p.exclude ?? []).includes(r.providerType));
  if (!usable.length) {
    throw new Error(smallestMin ? `Amount too small for the exchange providers (minimum about ${smallestMin})` : "No exchange provider can take this swap right now. Please try again shortly.");
  }
  let lastError: Error | null = null;
  for (const route of usable.slice(0, 3)) {
    try {
      const s = await swap({ ...p, route });
      if (s.extraFields?.value && !p.acceptExtra) {
        warn("rubic", `${route.providerType} needs ${s.extraFields.name}; skipping`);
        continue;
      }
      return { ...s, rubicId: route.id };
    } catch (e) {
      lastError = e as Error;
      warn("rubic", `${route.providerType} refused: ${lastError.message}`);
    }
  }
  throw lastError ?? new Error("No exchange provider could lock this swap");
}

export async function status(srcTxHash: string, id: string) {
  const r = await call<{ status: RubicStatus | { status?: RubicStatus }; destinationTxHash: string | null }>(
    `/api/info/statusExtended?srcTxHash=${encodeURIComponent(srcTxHash)}&id=${encodeURIComponent(id)}`,
  );
  const st = (typeof r.status === "string" ? r.status : r.status?.status) ?? "NOT_FOUND";
  return { status: st as RubicStatus, destinationTxHash: r.destinationTxHash || null };
}
