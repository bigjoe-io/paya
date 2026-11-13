/**
 * Swaps inside the user's own Paya address: NEAR ⇄ any NEAR-chain token NEAR Intents (1Click)
 * supports, e.g. USDC on NEAR. Funds leave the user's address for a 1Click deposit address and
 * come back to the same address (refunds too), so nothing ever goes anywhere else.
 */
import { audit } from "./audit.js";
import { config } from "./config.js";
import { users, type User } from "./db.js";
import { log } from "./log.js";
import {
  balances,
  ensureRegistered,
  ftBalance,
  ftMetadata,
  INTENTS_FT_COST,
  INTENTS_NEAR_COST,
  REGISTER_COST,
  sendFtToIntents,
  sendNearToIntents,
  toYocto,
  wrapContract,
} from "./near.js";
import { cool, exclusive, setAuto } from "./accounts.js";

const API = "https://1click.chaindefuser.com/v0";
const headers = (): Record<string, string> => ({
  "content-type": "application/json",
  ...(process.env.ONECLICK_JWT ? { authorization: `Bearer ${process.env.ONECLICK_JWT}` } : {}),
});

/** "near" is native NEAR (wNEAR under the hood); every other id is a token contract. */
export type Token = { id: string; symbol: string; name: string; decimals: number; icon: string | null; priceUsd: number };
const NEAR_ID = "near";
const assetOf = (id: string) => `nep141:${id === NEAR_ID ? wrapContract() : id}`;
const contractOf = (id: string) => (id === NEAR_ID ? wrapContract() : id);

const FIRST = ["near", "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1", "usdt.tether-token.near"];
const MAX_ICON = 24_000; // data-URI chars; bigger icons fall back to a letter

let catalog: { at: number; tokens: Token[] } | null = null;

/** NEAR-chain tokens NEAR Intents can swap, with a price; cached 10 minutes. */
export async function tokens(): Promise<Token[]> {
  if (catalog && Date.now() - catalog.at < 10 * 60_000) return catalog.tokens;
  const r = await fetch(`${API}/tokens`, { headers: headers() });
  if (!r.ok) throw new Error("Couldn't load the token list. Try again in a moment.");
  const all = (await r.json()) as { assetId: string; blockchain: string; symbol: string; decimals: number; price?: number; contractAddress?: string }[];
  const near = all.filter((t) => t.blockchain === "near" && t.assetId.startsWith("nep141:") && (t.price ?? 0) > 0);
  const list = await Promise.all(
    near.map(async (t): Promise<Token> => {
      const contract = t.assetId.slice("nep141:".length);
      const isNear = contract === wrapContract();
      const meta = isNear ? null : await ftMetadata(contract);
      const icon = meta?.icon && meta.icon.length <= MAX_ICON ? meta.icon : null;
      return {
        id: isNear ? NEAR_ID : contract,
        symbol: isNear ? "NEAR" : t.symbol,
        name: isNear ? "NEAR" : (meta?.name ?? t.symbol),
        decimals: isNear ? 24 : t.decimals,
        icon,
        priceUsd: t.price ?? 0,
      };
    }),
  );
  list.sort((a, b) => {
    const ia = FIRST.indexOf(a.id), ib = FIRST.indexOf(b.id);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.symbol.localeCompare(b.symbol);
  });
  catalog = { at: Date.now(), tokens: list };
  return list;
}

const tokenById = async (id: string) => {
  const t = (await tokens()).find((x) => x.id === id);
  if (!t) throw new Error("That token isn't supported for swaps.");
  return t;
};

export type Holding = Token & { balance: string; amount: number; usd: number };

/** Every token the address holds (with a price), plus native NEAR. Sorted by USD value. */
export async function holdings(address: string): Promise<{ holdings: Holding[]; totalUsd: number }> {
  const list = await tokens();
  const bal = await balances(address);
  // FastNEAR indexes which tokens the account has touched; always include the stablecoins.
  let touched: string[] = [];
  try {
    const r = await fetch(`https://api.fastnear.com/v1/account/${address}/ft`);
    if (r.ok) touched = ((await r.json()) as { tokens?: { contract_id: string }[] }).tokens?.map((t) => t.contract_id) ?? [];
  } catch {}
  const ids = new Set([...touched, ...FIRST.slice(1)]);
  const out: Holding[] = [];
  const near = list.find((t) => t.id === NEAR_ID)!;
  const nearRaw = bal.available + bal.wnear;
  out.push(make(near, nearRaw));
  await Promise.all(
    list
      .filter((t) => t.id !== NEAR_ID && ids.has(t.id))
      .map(async (t) => {
        const raw = await ftBalance(t.id, address);
        if (raw > 0n) out.push(make(t, raw));
      }),
  );
  out.sort((a, b) => (a.id === NEAR_ID ? -1 : b.id === NEAR_ID ? 1 : b.usd - a.usd));
  return { holdings: out, totalUsd: out.reduce((s, h) => s + h.usd, 0) };
}

function make(t: Token, raw: bigint): Holding {
  const amount = Number(raw) / 10 ** t.decimals;
  return { ...t, balance: raw.toString(), amount, usd: amount * t.priceUsd };
}

/** Largest amount of `from` the user can swap right now (raw units). NEAR keeps fees + reserve back. */
async function spendable(u: User, from: Token): Promise<bigint> {
  const bal = await balances(u.address);
  const reserve = toYocto(config.RESERVE_NEAR) + REGISTER_COST;
  if (from.id === NEAR_ID) {
    const free = bal.available - reserve - INTENTS_NEAR_COST;
    return free > 0n ? free : 0n;
  }
  return ftBalance(from.id, u.address);
}

const toRaw = (amount: number, decimals: number) => {
  const [w, f = ""] = amount.toFixed(Math.min(decimals, 12)).split(".");
  return BigInt(w + f.padEnd(decimals, "0").slice(0, decimals));
};

type OneClickQuote = {
  quote: {
    amountIn: string;
    amountOut: string;
    amountOutFormatted: string;
    minAmountOut: string;
    amountInUsd?: string;
    amountOutUsd?: string;
    depositAddress?: string;
    timeEstimate?: number;
  };
};

async function oneClickQuote(u: User, from: Token, to: Token, raw: bigint, dry: boolean) {
  const r = await fetch(`${API}/quote`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      dry,
      swapType: "EXACT_INPUT",
      slippageTolerance: 100,
      originAsset: assetOf(from.id),
      depositType: "ORIGIN_CHAIN",
      destinationAsset: assetOf(to.id),
      amount: raw.toString(),
      refundTo: u.address,
      refundType: "ORIGIN_CHAIN",
      recipient: u.address,
      recipientType: "DESTINATION_CHAIN",
      deadline: new Date(Date.now() + 20 * 60_000).toISOString(),
      referral: "paya",
    }),
  });
  const j = (await r.json().catch(() => ({}))) as OneClickQuote & { message?: string };
  if (!r.ok || !j.quote) {
    const msg = String(j.message ?? "");
    if (/too low|amount is too small|minimum/i.test(msg)) throw new Error("That amount is too small to swap. Try a larger amount.");
    throw new Error("No swap price is available for that pair right now. Try again in a moment.");
  }
  return j.quote;
}

export type SwapQuote = {
  from: string;
  to: string;
  amountIn: number;
  amountOut: number;
  minOut: number;
  amountInUsd: number | null;
  amountOutUsd: number | null;
  max: number;
  etaSeconds: number | null;
};

export async function quoteSwap(u: User, fromId: string, toId: string, amount: number): Promise<SwapQuote> {
  if (fromId === toId) throw new Error("Pick two different tokens.");
  const [from, to] = await Promise.all([tokenById(fromId), tokenById(toId)]);
  const max = await spendable(u, from);
  const raw = toRaw(amount, from.decimals);
  if (raw <= 0n) throw new Error("Enter an amount.");
  const q = await oneClickQuote(u, from, to, raw, true);
  return {
    from: from.id,
    to: to.id,
    amountIn: amount,
    amountOut: Number(q.amountOut) / 10 ** to.decimals,
    minOut: Number(q.minAmountOut) / 10 ** to.decimals,
    amountInUsd: q.amountInUsd ? Number(q.amountInUsd) : null,
    amountOutUsd: q.amountOutUsd ? Number(q.amountOutUsd) : null,
    max: Number(max) / 10 ** from.decimals,
    etaSeconds: q.timeEstimate ?? null,
  };
}

export type SwapStarted = { depositAddress: string; txHash: string; amountOut: number; to: string };

export function startSwap(u: User, fromId: string, toId: string, amount: number): Promise<SwapStarted> {
  return exclusive(u, async () => {
    if (fromId === toId) throw new Error("Pick two different tokens.");
    const [from, to] = await Promise.all([tokenById(fromId), tokenById(toId)]);
    const raw = toRaw(amount, from.decimals);
    const max = await spendable(u, from);
    if (raw <= 0n) throw new Error("Enter an amount.");
    if (raw > max) throw new Error(`You can swap up to ${(Number(max) / 10 ** from.decimals).toFixed(4)} ${from.symbol}.`);
    if (from.id !== NEAR_ID) {
      const { available } = await balances(u.address);
      if (available < INTENTS_FT_COST + REGISTER_COST) throw new Error("You need about 0.03 NEAR in your balance to pay the network fee for this swap.");
    }

    // NEAR arriving would otherwise be cashed out straight away.
    if (to.id === NEAR_ID && u.auto_cashout) u = setAuto(u, false);

    try {
      await ensureRegistered(u.key_index, contractOf(to.id));
      const q = await oneClickQuote(u, from, to, raw, false);
      if (!q.depositAddress) throw new Error("No swap price is available right now. Try again in a moment.");
      const txHash =
        from.id === NEAR_ID
          ? await sendNearToIntents(u.key_index, q.depositAddress, raw)
          : await sendFtToIntents(u.key_index, from.id, q.depositAddress, raw);
      await fetch(`${API}/deposit/submit`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ txHash, depositAddress: q.depositAddress }),
      }).catch(() => {});
      const amountOut = Number(q.amountOut) / 10 ** to.decimals;
      users.event(u.id, "token_swap", { from: from.symbol, to: to.symbol, amount, amountOut, depositAddress: q.depositAddress, tx: txHash });
      audit("token_swap", u.email, { from: from.symbol, to: to.symbol, amount, amountOut });
      log("swap", `${u.id} ${amount} ${from.symbol} → ${to.symbol} via NEAR Intents (${q.depositAddress.slice(0, 8)}…)`);
      return { depositAddress: q.depositAddress, txHash, amountOut, to: to.id };
    } finally {
      cool(u);
    }
  });
}

/** 1Click status for a swap this user started (deposit address must be in their history). */
export async function swapStatus(u: User, depositAddress: string) {
  const mine = (users.byId(u.id)?.events ?? []).some(
    (e) => e.type === "token_swap" && (e.detail as { depositAddress?: string } | undefined)?.depositAddress === depositAddress,
  );
  if (!mine) throw new Error("Swap not found.");
  const r = await fetch(`${API}/status?depositAddress=${encodeURIComponent(depositAddress)}`, { headers: headers() });
  const j = (await r.json().catch(() => ({}))) as { status?: string };
  const s = j.status ?? "PENDING_DEPOSIT";
  return { status: s === "SUCCESS" ? "done" : s === "REFUNDED" ? "refunded" : s === "FAILED" ? "failed" : "processing", raw: s };
}

