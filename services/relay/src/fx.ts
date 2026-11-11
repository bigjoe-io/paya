import { warn } from "./log.js";

/**
 * Indicative market FX (local currency per USD) for showing a price before
 * the user signs in. PAJ only publishes a public rate for NGN; every other
 * currency is priced by PAJ once there's a session. These numbers never set
 * an order's price: orders always use PAJ's own quote.
 */
let cache: { at: number; rates: Record<string, number> } | null = null;
const TTL = 60 * 60 * 1000;

/** PAJ's rate sits a little off mid-market; widen so the preview doesn't over-promise. */
const SPREAD = 0.02;

async function load() {
  if (cache && Date.now() - cache.at < TTL) return cache.rates;
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(8000) });
    const j = (await r.json()) as { result: string; rates: Record<string, number> };
    if (j.result !== "success") throw new Error("FX source returned an error");
    cache = { at: Date.now(), rates: j.rates };
  } catch (e) {
    warn("fx", (e as Error).message);
    if (!cache) throw new Error("Rates are unavailable right now. Sign in to see your exact rate.");
  }
  return cache!.rates;
}

/** Fiat per USD a user would get when cashing out (rate shaded down). */
export async function indicativeSellRate(currency: string) {
  const r = (await load())[currency];
  if (!r) throw new Error(`Sign in to see ${currency} rates`);
  return r * (1 - SPREAD);
}

/** Fiat per USD a user would pay when buying (rate shaded up). */
export async function indicativeBuyRate(currency: string) {
  const r = (await load())[currency];
  if (!r) throw new Error(`Sign in to see ${currency} rates`);
  return r * (1 + SPREAD);
}
