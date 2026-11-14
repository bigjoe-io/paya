/**
 * Bridge: move tokens between NEAR and other chains (Solana, Ethereum, Base, Bitcoin, Tron, …)
 * through NEAR Intents (1Click).
 *
 *  - Out: tokens on NEAR (from a Paya account or a connected wallet) → an address on another chain.
 *  - In:  a one-time deposit address on another chain → tokens on NEAR in the account / wallet.
 */
import { audit } from "./audit.js";
import { users, type User } from "./db.js";
import { log } from "./log.js";
import { balances, ensureRegistered, INTENTS_FT_COST, isRegistered, REGISTER_COST, sendFtToIntents, sendNearToIntents, wrapContract } from "./near.js";
import { cool, exclusive, setAuto } from "./accounts.js";
import {
  API,
  checkAccount,
  contractOf,
  fc,
  headers,
  NEAR_ID,
  spendable,
  STORAGE,
  toRaw,
  tokenById,
  walletSpendable,
  type Token,
  type WalletTx,
} from "./tokenswap.js";

/** Chains offered for bridging, with how to check an address on them. */
const CHAINS: { id: string; name: string; address: RegExp; tokens: string[] }[] = [
  { id: "sol", name: "Solana", address: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, tokens: ["SOL", "USDC", "USDT"] },
  { id: "eth", name: "Ethereum", address: /^0x[0-9a-fA-F]{40}$/, tokens: ["ETH", "USDC", "USDT"] },
  { id: "base", name: "Base", address: /^0x[0-9a-fA-F]{40}$/, tokens: ["ETH", "USDC"] },
  { id: "arb", name: "Arbitrum", address: /^0x[0-9a-fA-F]{40}$/, tokens: ["ETH", "USDC", "USDT0"] },
  { id: "op", name: "Optimism", address: /^0x[0-9a-fA-F]{40}$/, tokens: ["ETH", "USDC", "USDT"] },
  { id: "bsc", name: "BNB Chain", address: /^0x[0-9a-fA-F]{40}$/, tokens: ["BNB", "USDC", "USDT"] },
  { id: "pol", name: "Polygon", address: /^0x[0-9a-fA-F]{40}$/, tokens: ["POL", "USDC", "USDT"] },
  { id: "avax", name: "Avalanche", address: /^0x[0-9a-fA-F]{40}$/, tokens: ["AVAX", "USDC", "USDT"] },
  { id: "btc", name: "Bitcoin", address: /^(bc1[02-9ac-hj-np-z]{11,71}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/, tokens: ["BTC"] },
  { id: "tron", name: "Tron", address: /^T[1-9A-HJ-NP-Za-km-z]{33}$/, tokens: ["TRX", "USDT"] },
];

export type ChainToken = { assetId: string; chain: string; symbol: string; decimals: number; priceUsd: number };
export type Chain = { id: string; name: string; tokens: ChainToken[] };

let cache: { at: number; chains: Chain[] } | null = null;

export async function bridgeChains(): Promise<Chain[]> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.chains;
  const r = await fetch(`${API}/tokens`, { headers: headers() });
  if (!r.ok) throw new Error("Couldn't load the bridge list. Try again in a moment.");
  const all = (await r.json()) as { assetId: string; blockchain: string; symbol: string; decimals: number; price?: number }[];
  const chains = CHAINS.map((c) => ({
    id: c.id,
    name: c.name,
    tokens: c.tokens
      .map((sym) => all.find((t) => t.blockchain === c.id && t.symbol === sym && (t.price ?? 0) > 0))
      .filter((t): t is NonNullable<typeof t> => Boolean(t))
      .map((t) => ({ assetId: t.assetId, chain: c.id, symbol: t.symbol, decimals: t.decimals, priceUsd: t.price ?? 0 })),
  })).filter((c) => c.tokens.length);
  cache = { at: Date.now(), chains };
  return chains;
}

async function chainToken(assetId: string) {
  for (const c of await bridgeChains()) {
    const t = c.tokens.find((x) => x.assetId === assetId);
    if (t) return { chain: CHAINS.find((x) => x.id === c.id)!, token: t };
  }
  throw new Error("That token isn't supported for bridging.");
}

function checkAddress(chain: (typeof CHAINS)[number], address: string) {
  const a = address.trim();
  if (!chain.address.test(a)) throw new Error(`That doesn't look like a ${chain.name} address. Check it and try again.`);
  return a;
}

type Q = {
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  amountInUsd?: string;
  amountOutUsd?: string;
  depositAddress?: string;
  depositMemo?: string;
  deadline?: string;
  timeEstimate?: number;
};

async function oneClick(body: Record<string, unknown>): Promise<Q> {
  const r = await fetch(`${API}/quote`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ swapType: "EXACT_INPUT", slippageTolerance: 100, depositType: "ORIGIN_CHAIN", recipientType: "DESTINATION_CHAIN", refundType: "ORIGIN_CHAIN", referral: "paya", ...body }),
  });
  const j = (await r.json().catch(() => ({}))) as { quote?: Q; message?: string };
  if (!r.ok || !j.quote) {
    const msg = String(j.message ?? "");
    if (/too low|too small|minimum/i.test(msg)) throw new Error("That amount is too small to bridge. Try a larger amount.");
    throw new Error("No bridge price is available for that route right now. Try again in a moment.");
  }
  return j.quote;
}

export type BridgeQuote = {
  amountIn: number;
  amountOut: number;
  minOut: number;
  amountInUsd: number | null;
  amountOutUsd: number | null;
  etaSeconds: number | null;
  max: number | null;
};

const shape = (q: Q, inDec: number, outDec: number, amount: number, max: bigint | null): BridgeQuote => ({
  amountIn: amount,
  amountOut: Number(q.amountOut) / 10 ** outDec,
  minOut: Number(q.minAmountOut) / 10 ** outDec,
  amountInUsd: q.amountInUsd ? Number(q.amountInUsd) : null,
  amountOutUsd: q.amountOutUsd ? Number(q.amountOutUsd) : null,
  etaSeconds: q.timeEstimate ?? null,
  max: max === null ? null : Number(max) / 10 ** inDec,
});

const deadline = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
const assetOfNear = (t: Token) => `nep141:${contractOf(t.id)}`;

/* ---------------- out: NEAR → another chain ---------------- */

type OutArgs = { from: string; toAsset: string; amount: number; recipient: string };

async function outParts(a: OutArgs) {
  const from = await tokenById(a.from);
  const { chain, token } = await chainToken(a.toAsset);
  const recipient = checkAddress(chain, a.recipient);
  const raw = toRaw(a.amount, from.decimals);
  if (raw <= 0n) throw new Error("Enter an amount.");
  return { from, chain, token, recipient, raw };
}

/** Quote for sending from a NEAR account (Paya address or connected wallet). */
export async function quoteOut(nearAccount: string, a: OutArgs, max: (from: Token) => Promise<bigint>) {
  const { from, token, recipient, raw } = await outParts(a);
  const [m, q] = await Promise.all([
    max(from),
    oneClick({ dry: true, originAsset: assetOfNear(from), destinationAsset: token.assetId, amount: raw.toString(), refundTo: nearAccount, recipient, deadline: deadline(20) }),
  ]);
  return shape(q, from.decimals, token.decimals, a.amount, m);
}

export const accountQuoteOut = (u: User, a: OutArgs) => quoteOut(u.address, a, (from) => spendable(u, from));
export const walletQuoteOut = (account: string, a: OutArgs) => {
  const acc = checkAccount(account);
  return quoteOut(acc, a, (from) => walletSpendable(acc, from));
};

/** Paya account: the relay signs with the account's key (email code checked by the caller). */
export function accountBridgeOut(u: User, a: OutArgs) {
  return exclusive(u, async () => {
    const { from, chain, token, recipient, raw } = await outParts(a);
    const max = await spendable(u, from);
    if (raw > max) throw new Error(`You can send up to ${(Number(max) / 10 ** from.decimals).toFixed(4)} ${from.symbol}.`);
    if (from.id !== NEAR_ID) {
      const { available } = await balances(u.address);
      if (available < INTENTS_FT_COST + REGISTER_COST) throw new Error("You need about 0.03 NEAR in your balance to pay the network fee.");
    }
    try {
      const q = await oneClick({ dry: false, originAsset: assetOfNear(from), destinationAsset: token.assetId, amount: raw.toString(), refundTo: u.address, recipient, deadline: deadline(20) });
      if (!q.depositAddress) throw new Error("No bridge price is available right now. Try again in a moment.");
      const txHash =
        from.id === NEAR_ID
          ? await sendNearToIntents(u.key_index, q.depositAddress, raw)
          : await sendFtToIntents(u.key_index, from.id, q.depositAddress, raw);
      await submit(q.depositAddress, txHash);
      const amountOut = Number(q.amountOut) / 10 ** token.decimals;
      users.event(u.id, "token_swap", { kind: "bridge_out", from: from.symbol, to: `${token.symbol} (${chain.name})`, amount: a.amount, amountOut, recipient, depositAddress: q.depositAddress, tx: txHash });
      audit("bridge_out", u.email, { from: from.symbol, to: `${token.symbol}/${chain.id}`, amount: a.amount, recipient });
      log("bridge", `${u.id} ${a.amount} ${from.symbol} → ${token.symbol} on ${chain.name}`);
      return { depositAddress: q.depositAddress, amountOut, txHash };
    } finally {
      cool(u);
    }
  });
}

/** Connected wallet: the transactions the wallet signs. */
export async function walletBridgeOut(account: string, a: OutArgs) {
  const acc = checkAccount(account);
  const { from, chain, token, recipient, raw } = await outParts(a);
  const max = await walletSpendable(acc, from);
  if (raw > max) throw new Error(`You can send up to ${(Number(max) / 10 ** from.decimals).toFixed(4)} ${from.symbol} from this wallet.`);
  const q = await oneClick({ dry: false, originAsset: assetOfNear(from), destinationAsset: token.assetId, amount: raw.toString(), refundTo: acc, recipient, deadline: deadline(20) });
  if (!q.depositAddress) throw new Error("No bridge price is available right now. Try again in a moment.");
  const dep = q.depositAddress;
  const transactions: WalletTx[] =
    from.id === NEAR_ID
      ? [
          {
            receiverId: wrapContract(),
            actions: [
              fc("storage_deposit", { registration_only: true }, STORAGE),
              fc("storage_deposit", { account_id: dep, registration_only: true }, STORAGE),
              fc("near_deposit", {}, raw.toString()),
              fc("ft_transfer", { receiver_id: dep, amount: raw.toString(), memo: "paya bridge" }, "1"),
            ],
          },
        ]
      : [
          {
            receiverId: from.id,
            actions: [
              fc("storage_deposit", { account_id: dep, registration_only: true }, STORAGE),
              fc("ft_transfer", { receiver_id: dep, amount: raw.toString(), memo: "paya bridge" }, "1"),
            ],
          },
        ];
  audit("wallet_bridge_out_quoted", acc, { from: from.symbol, to: `${token.symbol}/${chain.id}`, amount: a.amount });
  return { depositAddress: dep, amountOut: Number(q.amountOut) / 10 ** token.decimals, transactions };
}

/* ---------------- in: another chain → NEAR ---------------- */

type InArgs = { fromAsset: string; to: string; amount: number; refundAddress: string };

async function inParts(a: InArgs) {
  const { chain, token } = await chainToken(a.fromAsset);
  const to = await tokenById(a.to);
  const refund = checkAddress(chain, a.refundAddress);
  const raw = toRaw(a.amount, token.decimals);
  if (raw <= 0n) throw new Error("Enter an amount.");
  return { chain, token, to, refund, raw };
}

export async function quoteIn(nearAccount: string, a: Omit<InArgs, "refundAddress"> & { refundAddress?: string }) {
  const { chain, token } = await chainToken(a.fromAsset);
  const to = await tokenById(a.to);
  const raw = toRaw(a.amount, token.decimals);
  if (raw <= 0n) throw new Error("Enter an amount.");
  void chain;
  const q = await oneClick({
    dry: true,
    originAsset: token.assetId,
    destinationAsset: assetOfNear(to),
    amount: raw.toString(),
    refundTo: a.refundAddress?.trim() || nearAccount, // dry quotes don't use it
    refundType: a.refundAddress ? "ORIGIN_CHAIN" : "INTENTS",
    recipient: nearAccount,
    deadline: deadline(60),
  });
  return shape(q, token.decimals, to.decimals, a.amount, null);
}

export type DepositInstructions = {
  depositAddress: string;
  depositMemo: string | null;
  chain: string;
  symbol: string;
  amount: number;
  amountOut: number;
  to: string;
  deadline: string | null;
  /** Wallet mode: sign this first so the wallet can receive the token. */
  registration: WalletTx | null;
};

async function startIn(nearAccount: string, a: InArgs): Promise<DepositInstructions & { _to: Token }> {
  const { chain, token, to, refund, raw } = await inParts(a);
  const q = await oneClick({
    dry: false,
    originAsset: token.assetId,
    destinationAsset: assetOfNear(to),
    amount: raw.toString(),
    refundTo: refund,
    recipient: nearAccount,
    deadline: deadline(60),
  });
  if (!q.depositAddress) throw new Error("No bridge price is available right now. Try again in a moment.");
  return {
    depositAddress: q.depositAddress,
    depositMemo: q.depositMemo ?? null,
    chain: chain.name,
    symbol: token.symbol,
    amount: a.amount,
    amountOut: Number(q.amountOut) / 10 ** to.decimals,
    to: to.id,
    deadline: q.deadline ?? null,
    registration: null,
    _to: to,
  };
}

export async function accountBridgeIn(u: User, a: InArgs): Promise<DepositInstructions> {
  const to = await tokenById(a.to);
  if (to.id !== NEAR_ID) await exclusive(u, async () => {
    try {
      await ensureRegistered(u.key_index, contractOf(to.id));
    } finally {
      cool(u);
    }
  });
  // NEAR arriving would otherwise be cashed out straight away.
  if (to.id === NEAR_ID && u.auto_cashout) setAuto(u, false);
  const { _to, ...d } = await startIn(u.address, a);
  users.event(u.id, "token_swap", { kind: "bridge_in", from: `${d.symbol} (${d.chain})`, to: _to.symbol, amount: a.amount, amountOut: d.amountOut, depositAddress: d.depositAddress });
  audit("bridge_in", u.email, { from: `${d.symbol}/${d.chain}`, to: _to.symbol, amount: a.amount });
  return d;
}

export async function walletBridgeIn(account: string, a: InArgs): Promise<DepositInstructions> {
  const acc = checkAccount(account);
  const { _to, ...d } = await startIn(acc, a);
  const registration: WalletTx | null =
    _to.id !== NEAR_ID && !(await isRegistered(_to.id, acc))
      ? { receiverId: _to.id, actions: [fc("storage_deposit", { account_id: acc, registration_only: true }, STORAGE)] }
      : null;
  audit("wallet_bridge_in", acc, { from: `${d.symbol}/${d.chain}`, to: _to.symbol, amount: a.amount });
  return { ...d, registration };
}

async function submit(depositAddress: string, txHash: string) {
  await fetch(`${API}/deposit/submit`, { method: "POST", headers: headers(), body: JSON.stringify({ txHash, depositAddress }) }).catch(() => {});
}
