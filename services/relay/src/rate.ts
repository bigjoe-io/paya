import { log, warn } from "./log.js";

/**
 * Live rates. Primary: CoinGecko (USDC and NEAR priced directly in NGN).
 * Fallback: open.er-api daily USD→NGN with USDC assumed at $1.
 * Cached for 60s so a busy watcher never hammers either API.
 */
export type Rates = {
  ngnPerUsdc: number;
  ngnPerNear: number;
  usdPerNear: number;
  source: "coingecko" | "open.er-api";
  fetchedAt: string;
};

let cache: { at: number; rates: Rates } | null = null;
const TTL_MS = 60_000;

export async function getRates(): Promise<Rates> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rates;
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,near&vs_currencies=ngn,usd",
      { signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) throw new Error(`coingecko ${r.status}`);
    const j = (await r.json()) as {
      "usd-coin": { ngn: number; usd: number };
      near: { ngn: number; usd: number };
    };
    const rates: Rates = {
      ngnPerUsdc: j["usd-coin"].ngn,
      ngnPerNear: j.near.ngn,
      usdPerNear: j.near.usd,
      source: "coingecko",
      fetchedAt: new Date().toISOString(),
    };
    cache = { at: Date.now(), rates };
    return rates;
  } catch (e) {
    warn("rate", `coingecko failed, falling back: ${(e as Error).message}`);
  }
  const r = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`open.er-api ${r.status}`);
  const j = (await r.json()) as { rates: { NGN: number } };
  // NEAR/USD is unknown on this path; keep the last known value if we have one.
  const usdPerNear = cache?.rates.usdPerNear ?? 0;
  const rates: Rates = {
    ngnPerUsdc: j.rates.NGN,
    ngnPerNear: usdPerNear * j.rates.NGN,
    usdPerNear,
    source: "open.er-api",
    fetchedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), rates };
  log("rate", "using fallback source", { ngnPerUsdc: rates.ngnPerUsdc });
  return rates;
}
