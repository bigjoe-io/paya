/**
 * Paya NEAR trading agent: a minimal, non-custodial example.
 *
 *   npx tsx agent.ts quote near usdc 1          live price for 1 NEAR -> USDC (no key needed)
 *   npx tsx agent.ts swap  near usdc 1          swap 1 NEAR -> USDC, signed by your key, back to your account
 *   npx tsx agent.ts rebalance 50               keep ~50% of your value in USDC (swaps the difference)
 *   npx tsx agent.ts bridge usdc sol:USDC 5 <solana-address>   send 5 USDC to Solana
 *
 * The Paya Agent API prices each trade through NEAR Intents and returns the exact transactions to
 * sign. Your key stays here; every output and refund goes back to your own account.
 */
import { Account, actions, JsonRpcProvider, type KeyPairString } from "near-api-js";

const API = process.env.PAYA_API ?? "https://paya-render.onrender.com";
const ACCOUNT = process.env.NEAR_ACCOUNT_ID ?? "";
const KEY = process.env.NEAR_PRIVATE_KEY as KeyPairString | undefined;
const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC ?? "https://free.rpc.fastnear.com" });

type Token = { id: string; symbol: string; decimals: number; priceUsd: number };
type WalletTx = {
  receiverId: string;
  actions: { type: "FunctionCall"; params: { methodName: string; args: object; gas: string; deposit: string } }[];
};

async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}

/** "near", "usdc", "usdt", … or a token contract id -> a Paya token. */
async function token(sym: string) {
  const list = await call<Token[]>("/tokens");
  const t = list.find((x) => x.symbol.toLowerCase() === sym.toLowerCase() || x.id === sym);
  if (!t) throw new Error(`Unknown token ${sym}. Try: ${list.slice(0, 8).map((x) => x.symbol).join(", ")}`);
  return t;
}

/** Sign and send the transactions Paya returned, in order. Returns the last hash. */
async function signAll(txs: WalletTx[]) {
  if (!ACCOUNT || !KEY) throw new Error("Set NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY (see .env.example)");
  const account = new Account(ACCOUNT, provider, KEY);
  let hash = "";
  for (const tx of txs) {
    const r = await account.signAndSendTransaction({
      receiverId: tx.receiverId,
      actions: tx.actions.map((a) =>
        actions.functionCall(a.params.methodName, a.params.args as Record<string, unknown>, BigInt(a.params.gas), BigInt(a.params.deposit)),
      ),
      waitUntil: "FINAL",
    });
    hash = r.transaction.hash as string;
  }
  return hash;
}

async function settle(depositAddress: string) {
  for (let i = 0; i < 60; i++) {
    const s = await call<{ status: string; raw: string }>(`/wallet/swap/${depositAddress}`);
    if (s.status !== "processing") return s.status;
    await new Promise((r) => setTimeout(r, 5000));
  }
  return "still processing";
}

async function swap(from: string, to: string, amount: number) {
  const [a, b] = await Promise.all([token(from), token(to)]);
  const s = await call<{ depositAddress: string; amountOut: number; transactions: WalletTx[] }>("/wallet/swap", {
    account: ACCOUNT,
    from: a.id,
    to: b.id,
    amount,
  });
  console.log(`Swapping ${amount} ${a.symbol} -> ~${s.amountOut} ${b.symbol} (${s.transactions.length} tx to sign)`);
  const hash = await signAll(s.transactions);
  await call("/wallet/swap/submit", { depositAddress: s.depositAddress, txHash: hash });
  console.log("Result:", await settle(s.depositAddress));
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "quote") {
    const [from = "near", to = "usdc", amt = "1"] = args;
    const [a, b] = await Promise.all([token(from), token(to)]);
    const q = await call<{ amountOut: number; minOut: number }>(
      `/wallet/quote?account=${ACCOUNT || "near"}&from=${encodeURIComponent(a.id)}&to=${encodeURIComponent(b.id)}&amount=${amt}`,
    );
    console.log(`${amt} ${a.symbol} -> ${q.amountOut} ${b.symbol} (minimum ${q.minOut})`);
  } else if (cmd === "swap") {
    const [from, to, amt] = args;
    await swap(from, to, Number(amt));
  } else if (cmd === "rebalance") {
    // A tiny strategy: keep a target share of the account's value in USDC.
    const target = Number(args[0] ?? 50) / 100;
    const { holdings, totalUsd } = await call<{ holdings: (Token & { amount: number; usd: number })[]; totalUsd: number }>(
      `/wallet/holdings?account=${ACCOUNT}`,
    );
    const usdc = holdings.find((h) => h.symbol === "USDC")?.usd ?? 0;
    const gap = target * totalUsd - usdc;
    const near = holdings.find((h) => h.id === "near");
    console.log(`Total $${totalUsd.toFixed(2)}, USDC $${usdc.toFixed(2)}, target $${(target * totalUsd).toFixed(2)}`);
    if (Math.abs(gap) < 1) return console.log("Within $1 of target. Nothing to do.");
    if (gap > 0 && near) await swap("near", "usdc", Number((gap / near.priceUsd).toFixed(4)));
    else await swap("usdc", "near", Number((-gap).toFixed(2)));
  } else if (cmd === "bridge") {
    const [from, dest, amt, recipient] = args; // dest like "sol:USDC"
    const [chainId, sym] = dest.split(":");
    const chains = await call<{ id: string; tokens: { assetId: string; symbol: string }[] }[]>("/bridge/chains");
    const toAsset = chains.find((c) => c.id === chainId)?.tokens.find((t) => t.symbol === sym)?.assetId;
    if (!toAsset) throw new Error(`Unknown destination ${dest}`);
    const a = await token(from);
    const b = await call<{ depositAddress: string; amountOut: number; transactions: WalletTx[] }>("/wallet/bridge/out", {
      account: ACCOUNT,
      from: a.id,
      toAsset,
      amount: Number(amt),
      recipient,
    });
    console.log(`Bridging ${amt} ${a.symbol} -> ~${b.amountOut} ${sym} on ${chainId}`);
    const hash = await signAll(b.transactions);
    await call("/wallet/swap/submit", { depositAddress: b.depositAddress, txHash: hash });
    console.log("Result:", await settle(b.depositAddress));
  } else {
    console.log("Commands: quote | swap | rebalance | bridge  (see the top of agent.ts)");
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
