/**
 * Meme coin market on NEAR.
 *
 * Launch:  NEAR's official token factory (tkn.primitives.near) creates a NEP-141 token owned by the
 *          creator, then a Ref Finance pool (token / wNEAR) is created and seeded with the creator's
 *          starting liquidity, so the coin is tradable immediately.
 * Trade:   buy and sell against that Ref pool (instant swap via ft_transfer_call), priced with
 *          Ref's get_return. Outputs go back to the trader's own account.
 *
 * MEMES_LIVE gates launching and trading until a funded end-to-end test has passed on mainnet.
 * Reading the market (list, prices, quotes) always works.
 */
import { audit } from "./audit.js";
import { memes, users, type Meme, type User } from "./db.js";
import { log, warn } from "./log.js";
import { accountExists, balances, isRegistered, sendTxs, toYocto, viewCall, wrapContract } from "./near.js";
import { cool, exclusive } from "./accounts.js";
import { fc, tokens as nearTokens, type WalletTx } from "./tokenswap.js";

export const MEMES_LIVE = process.env.MEMES_LIVE === "on";

const FACTORY = "tkn.primitives.near";
const REF = "v2.ref-finance.near";
const WNEAR = () => wrapContract();
const DECIMALS = 18;
const POOL_FEE = 30; // 0.3 %
const TGAS = (n: number) => (BigInt(n) * 10n ** 12n).toString();
const YOCTO_1 = "1";
const STORAGE_FT = "1250000000000000000000"; // 0.00125 NEAR
const REF_STORAGE = "100000000000000000000000"; // 0.1 NEAR (Ref account; unused part stays withdrawable)
const POOL_STORAGE = "100000000000000000000000"; // 0.1 NEAR attached to add_simple_pool (excess refunded)
const LIQ_STORAGE = "10000000000000000000000"; // 0.01 NEAR attached to add_liquidity
const GAS_BUFFER = toYocto(0.45); // NEAR checks prepaid gas at a pessimistic price; refunded after

const pow10 = (n: number) => 10n ** BigInt(n);
const toRaw = (amount: number, decimals: number) => {
  const [w, f = ""] = amount.toFixed(Math.min(decimals, 12)).split(".");
  return BigInt(w + f.padEnd(decimals, "0").slice(0, decimals));
};
const fromRaw = (raw: string | bigint, decimals: number) => Number(BigInt(raw) * 1_000_000n / pow10(decimals)) / 1_000_000;

export const tokenIdFor = (symbol: string) => `${symbol.toLowerCase()}.${FACTORY}`;

/* ---------------- validation ---------------- */

export type LaunchInput = {
  name: string;
  symbol: string;
  description?: string;
  icon?: string | null; // data:image/...;base64, ≤ 24 KB
  supply: number; // whole tokens, e.g. 1_000_000_000
  liquidityNear: number; // NEAR paired in the pool
  liquidityPercent: number; // share of supply put in the pool (rest stays with the creator)
};

function validate(i: LaunchInput) {
  const name = i.name.trim();
  const symbol = i.symbol.trim().toUpperCase();
  if (name.length < 2 || name.length > 32) throw new Error("Name must be 2–32 characters.");
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(symbol)) throw new Error("Ticker must be 2–8 letters or numbers, starting with a letter.");
  if (!Number.isFinite(i.supply) || i.supply < 1_000 || i.supply > 1e15 || !Number.isInteger(i.supply)) throw new Error("Supply must be a whole number between 1,000 and 1,000,000,000,000,000.");
  if (!(i.liquidityNear >= 0.5 && i.liquidityNear <= 10_000)) throw new Error("Starting liquidity must be at least 0.5 NEAR.");
  if (!(i.liquidityPercent >= 10 && i.liquidityPercent <= 100)) throw new Error("Put between 10% and 100% of the supply in the pool.");
  if (i.icon && (!/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/.test(i.icon) || i.icon.length > 24_000)) throw new Error("Image must be a PNG, JPG, WebP, GIF or SVG under ~16 KB.");
  return { name, symbol, description: (i.description ?? "").trim().slice(0, 280), icon: i.icon ?? null };
}

/* ---------------- costs ---------------- */

function metadata(name: string, symbol: string, icon: string | null) {
  return { spec: "ft-1.0.0", name, symbol, icon, reference: null, reference_hash: null, decimals: DECIMALS };
}

/** What a launch will cost, from the factory's own get_required. */
export async function launchCost(input: LaunchInput, owner = "paya.near") {
  const v = validate(input);
  const total = toRaw(input.supply, DECIMALS).toString();
  const required = await viewCall<string>(FACTORY, "get_required", {
    args: { owner_id: owner, total_supply: total, metadata: metadata(v.name, v.symbol, v.icon) },
  });
  if (!required) throw new Error("Couldn't price the launch right now. Try again in a moment.");
  const factory = BigInt(required);
  const extras = BigInt(REF_STORAGE) + BigInt(POOL_STORAGE) + BigInt(LIQ_STORAGE) + BigInt(STORAGE_FT) * 4n;
  const liquidity = toYocto(input.liquidityNear);
  const taken = await accountExists(tokenIdFor(v.symbol));
  return {
    tokenId: tokenIdFor(v.symbol),
    available: !taken,
    factoryNear: fromRaw(factory, 24),
    feesNear: fromRaw(extras, 24),
    liquidityNear: input.liquidityNear,
    totalNear: fromRaw(factory + extras + liquidity, 24),
    // What the account must hold before starting (gas is checked up front, then mostly refunded).
    requiredBalanceNear: fromRaw(factory + extras + liquidity + GAS_BUFFER, 24),
  };
}

/* ---------------- transactions ---------------- */

/** Phase A: create the token, set up Ref, create the pool. */
function phaseA(creator: string, input: LaunchInput, v: ReturnType<typeof validate>, factoryDeposit: string): WalletTx[] {
  const token = tokenIdFor(v.symbol);
  const total = toRaw(input.supply, DECIMALS).toString();
  return [
    {
      receiverId: FACTORY,
      actions: [fc("create_token", { args: { owner_id: creator, total_supply: total, metadata: metadata(v.name, v.symbol, v.icon) } }, factoryDeposit, TGAS(300))],
    },
    {
      // Ref must be registered on the new token to hold the pool's side.
      receiverId: token,
      actions: [fc("storage_deposit", { account_id: REF, registration_only: true }, STORAGE_FT, TGAS(10))],
    },
    {
      receiverId: REF,
      actions: [
        fc("storage_deposit", { account_id: creator, registration_only: false }, REF_STORAGE, TGAS(10)),
        fc("register_tokens", { token_ids: [token, WNEAR()] }, YOCTO_1, TGAS(10)),
        fc("add_simple_pool", { tokens: [token, WNEAR()], fee: POOL_FEE }, POOL_STORAGE, TGAS(20)),
      ],
    },
  ];
}

/** Phase B: deposit both sides into Ref and add the liquidity. */
function phaseB(input: LaunchInput, token: string, poolId: number): WalletTx[] {
  const total = toRaw(input.supply, DECIMALS);
  const tokenSide = (total * BigInt(Math.round(input.liquidityPercent * 100))) / 10_000n;
  const nearSide = toYocto(input.liquidityNear);
  return [
    {
      receiverId: WNEAR(),
      actions: [
        fc("storage_deposit", { registration_only: true }, STORAGE_FT, TGAS(10)),
        fc("near_deposit", {}, nearSide.toString(), TGAS(10)),
        fc("ft_transfer_call", { receiver_id: REF, amount: nearSide.toString(), msg: "" }, YOCTO_1, TGAS(60)),
      ],
    },
    {
      receiverId: token,
      actions: [fc("ft_transfer_call", { receiver_id: REF, amount: tokenSide.toString(), msg: "" }, YOCTO_1, TGAS(60))],
    },
    {
      receiverId: REF,
      actions: [fc("add_liquidity", { pool_id: poolId, amounts: [tokenSide.toString(), nearSide.toString()] }, LIQ_STORAGE, TGAS(30))],
    },
  ];
}

type RefPool = { token_account_ids: string[]; amounts: string[]; total_fee: number; pool_kind: string };

/** Find the newest Ref pool for token/wNEAR (scans the most recent pools). */
async function findPool(token: string): Promise<number | null> {
  const n = await viewCall<number>(REF, "get_number_of_pools", {});
  if (!n) return null;
  const from = Math.max(0, n - 60);
  const pools = (await viewCall<RefPool[]>(REF, "get_pools", { from_index: from, limit: n - from })) ?? [];
  for (let k = pools.length - 1; k >= 0; k--) {
    const ids = pools[k].token_account_ids;
    if (ids.includes(token) && ids.includes(WNEAR()) && pools[k].pool_kind === "SIMPLE_POOL") return from + k;
  }
  return null;
}

/* ---------------- launch (Paya accounts) ---------------- */

export function launch(u: User, input: LaunchInput) {
  if (!MEMES_LIVE) throw new Error("Launching opens very soon. The market is being tested on mainnet.");
  return exclusive(u, async () => {
    const v = validate(input);
    const token = tokenIdFor(v.symbol);
    const cost = await launchCost(input, u.address);
    if (!cost.available) throw new Error(`${v.symbol} is already taken on NEAR. Pick another ticker.`);
    const { available } = await balances(u.address);
    if (available < toYocto(cost.requiredBalanceNear)) throw new Error(`You need about ${cost.requiredBalanceNear.toFixed(2)} NEAR in your balance to launch this coin.`);

    const required = await viewCall<string>(FACTORY, "get_required", {
      args: { owner_id: u.address, total_supply: toRaw(input.supply, DECIMALS).toString(), metadata: metadata(v.name, v.symbol, v.icon) },
    });
    const now = new Date().toISOString();
    memes.insert({
      id: token, name: v.name, symbol: v.symbol, icon: v.icon, description: v.description, decimals: DECIMALS,
      total_supply: toRaw(input.supply, DECIMALS).toString(), creator: u.address, pool_id: null, status: "creating",
      error: null, create_tx: null, created_at: now, updated_at: now,
    } as Meme);
    try {
      const a = await sendTxs(u.key_index, phaseA(u.address, input, v, required!));
      memes.update(token, { create_tx: a[0] });
      const poolId = await findPool(token);
      if (poolId === null) throw new Error("The pool was created but couldn't be found yet.");
      await sendTxs(u.key_index, phaseB(input, token, poolId));
      memes.update(token, { pool_id: poolId, status: "live" });
      users.event(u.id, "meme_launched", { token, poolId, liquidityNear: input.liquidityNear });
      audit("meme_launched", u.email, { token, poolId });
      log("memes", `${u.id} launched ${token} (pool ${poolId})`);
      return memes.byId(token)!;
    } catch (e) {
      memes.update(token, { status: "failed", error: (e as Error).message });
      warn("memes", `launch ${token} failed: ${(e as Error).message}`);
      throw new Error(`Launch didn't finish: ${(e as Error).message}. Anything already created stays in your account; contact support with the ticker.`);
    } finally {
      cool(u);
    }
  });
}

/* ---------------- market data ---------------- */

export type MarketCoin = {
  id: string; name: string; symbol: string; icon: string | null; description: string; creator: string;
  poolId: number | null; status: Meme["status"]; createdAt: string;
  priceNear: number | null; priceUsd: number | null; liquidityUsd: number | null; marketCapUsd: number | null;
};

let nearUsdCache: { at: number; v: number } | null = null;
async function nearUsd() {
  if (nearUsdCache && Date.now() - nearUsdCache.at < 60_000) return nearUsdCache.v;
  const n = (await nearTokens()).find((t) => t.id === "near");
  nearUsdCache = { at: Date.now(), v: n?.priceUsd ?? 0 };
  return nearUsdCache.v;
}

async function priced(m: Meme, usd: number): Promise<MarketCoin> {
  let priceNear: number | null = null, liquidityUsd: number | null = null;
  if (m.pool_id !== null) {
    const p = await viewCall<RefPool>(REF, "get_pool", { pool_id: m.pool_id });
    if (p) {
      const ti = p.token_account_ids.indexOf(m.id), ni = p.token_account_ids.indexOf(WNEAR());
      const tok = fromRaw(p.amounts[ti], m.decimals), near = fromRaw(p.amounts[ni], 24);
      if (tok > 0) priceNear = near / tok;
      liquidityUsd = near * 2 * usd;
    }
  }
  const supply = fromRaw(m.total_supply, m.decimals);
  return {
    id: m.id, name: m.name, symbol: m.symbol, icon: m.icon, description: m.description, creator: m.creator,
    poolId: m.pool_id, status: m.status, createdAt: m.created_at,
    priceNear, priceUsd: priceNear === null ? null : priceNear * usd,
    liquidityUsd, marketCapUsd: priceNear === null ? null : priceNear * usd * supply,
  };
}

export async function market(): Promise<MarketCoin[]> {
  const usd = await nearUsd();
  const list = memes.all().filter((m) => m.status !== "failed").sort((a, b) => b.created_at.localeCompare(a.created_at));
  return Promise.all(list.map((m) => priced(m, usd)));
}

export async function coin(id: string) {
  const m = memes.byId(id);
  if (!m) throw new Error("Coin not found.");
  return priced(m, await nearUsd());
}

/* ---------------- trading ---------------- */

export type TradeQuote = { side: "buy" | "sell"; amountIn: number; amountOut: number; minOut: number; priceImpact: number | null };

async function refReturn(poolId: number, tokenIn: string, amountIn: bigint, tokenOut: string) {
  const out = await viewCall<string>(REF, "get_return", { pool_id: poolId, token_in: tokenIn, amount_in: amountIn.toString(), token_out: tokenOut });
  if (!out) throw new Error("No price available for this coin right now.");
  return BigInt(out);
}

export async function quoteTrade(id: string, side: "buy" | "sell", amount: number): Promise<TradeQuote> {
  const m = memes.byId(id);
  if (!m || m.pool_id === null || m.status !== "live") throw new Error("This coin isn't tradable yet.");
  const [inTok, inDec, outTok, outDec] = side === "buy" ? [WNEAR(), 24, m.id, m.decimals] : [m.id, m.decimals, WNEAR(), 24];
  const raw = toRaw(amount, inDec);
  if (raw <= 0n) throw new Error("Enter an amount.");
  const out = await refReturn(m.pool_id, inTok, raw, outTok);
  const small = await refReturn(m.pool_id, inTok, raw / 1000n || 1n, outTok);
  const spot = Number(small) * 1000;
  const impact = spot > 0 ? Math.max(0, 1 - Number(out) / spot) : null;
  return { side, amountIn: amount, amountOut: fromRaw(out, outDec), minOut: fromRaw((out * 98n) / 100n, outDec), priceImpact: impact };
}

/** Transactions for a trade from `account` (instant swap on Ref; output returns to the account). */
export async function tradeTxs(account: string, id: string, side: "buy" | "sell", amount: number): Promise<{ txs: WalletTx[]; quote: TradeQuote }> {
  const m = memes.byId(id);
  if (!m || m.pool_id === null) throw new Error("This coin isn't tradable yet.");
  const q = await quoteTrade(id, side, amount);
  const txs: WalletTx[] = [];
  if (side === "buy") {
    const raw = toYocto(amount);
    const minOut = toRaw(q.minOut, m.decimals);
    if (!(await isRegistered(m.id, account))) txs.push({ receiverId: m.id, actions: [fc("storage_deposit", { account_id: account, registration_only: true }, STORAGE_FT, TGAS(10))] });
    txs.push({
      receiverId: WNEAR(),
      actions: [
        fc("storage_deposit", { registration_only: true }, STORAGE_FT, TGAS(10)),
        fc("near_deposit", {}, raw.toString(), TGAS(10)),
        fc("ft_transfer_call", {
          receiver_id: REF, amount: raw.toString(),
          msg: JSON.stringify({ force: 0, actions: [{ pool_id: m.pool_id, token_in: WNEAR(), token_out: m.id, min_amount_out: minOut.toString() }] }),
        }, YOCTO_1, TGAS(100)),
      ],
    });
  } else {
    const raw = toRaw(amount, m.decimals);
    const minOut = toRaw(q.minOut, 24);
    txs.push({ receiverId: WNEAR(), actions: [fc("storage_deposit", { registration_only: true }, STORAGE_FT, TGAS(10))] });
    txs.push({
      receiverId: m.id,
      actions: [fc("ft_transfer_call", {
        receiver_id: REF, amount: raw.toString(),
        msg: JSON.stringify({ force: 0, actions: [{ pool_id: m.pool_id, token_in: m.id, token_out: WNEAR(), min_amount_out: minOut.toString() }] }),
      }, YOCTO_1, TGAS(100))],
    });
    // Unwrap what came back so the trader holds native NEAR.
    txs.push({ receiverId: WNEAR(), actions: [fc("near_withdraw", { amount: minOut.toString() }, YOCTO_1, TGAS(10))] });
  }
  return { txs, quote: q };
}

/** Paya account trade: the relay signs with the account's key. */
export function accountTrade(u: User, id: string, side: "buy" | "sell", amount: number) {
  if (!MEMES_LIVE) throw new Error("Trading opens very soon. The market is being tested on mainnet.");
  return exclusive(u, async () => {
    try {
      const { txs, quote } = await tradeTxs(u.address, id, side, amount);
      const hashes = await sendTxs(u.key_index, txs);
      users.event(u.id, "meme_trade", { id, side, amount, amountOut: quote.amountOut, tx: hashes[hashes.length - 1] });
      audit("meme_trade", u.email, { id, side, amount });
      return { ...quote, txHash: hashes[hashes.length - 1] };
    } finally {
      cool(u);
    }
  });
}

export async function walletTrade(account: string, id: string, side: "buy" | "sell", amount: number) {
  if (!MEMES_LIVE) throw new Error("Trading opens very soon. The market is being tested on mainnet.");
  return tradeTxs(account, id, side, amount);
}
