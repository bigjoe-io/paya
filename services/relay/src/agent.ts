/**
 * "Ask Paya": a chat assistant for signed-in users. It can look things up (balances, activity,
 * prices) and PROPOSE money movements. It never moves money itself: every proposal comes back to
 * the app as a confirmation card, and the user's tap runs the normal endpoint (with the email code
 * for anything that leaves the account).
 */
import Anthropic from "@anthropic-ai/sdk";
import { buys, swaps, type User } from "./db.js";
import { audit } from "./audit.js";
import { holdings, quoteSwap, tokens } from "./tokenswap.js";
import { bridgeChains, accountQuoteOut } from "./bridge.js";
import { preview } from "./quote.js";

const MODEL = "claude-opus-5-5";
const MAX_STEPS = 6;
const DAILY_LIMIT = 40; // messages per user per day

export type ChatTurn = { role: "user" | "assistant"; text: string };
export type Proposal =
  | { id: string; kind: "swap"; from: string; to: string; amount: number; fromSymbol: string; toSymbol: string; amountOut: number; minOut: number }
  | { id: string; kind: "cashout"; near: number; fiatOut: number; currency: string; bank: string }
  | { id: string; kind: "bridge_out"; from: string; fromSymbol: string; toAsset: string; toSymbol: string; chain: string; amount: number; recipient: string; amountOut: number }
  | { id: string; kind: "send_near"; to: string; near: number };

const SYSTEM = `You are Paya's in-app assistant. Paya lets people in Africa move money between NEAR and their bank account: buy NEAR with a bank transfer, cash NEAR out to their linked bank (Nigeria live), swap tokens on NEAR (NEAR, USDC, USDT, BTC, ETH and more) via NEAR Intents, bridge tokens to and from other chains (Solana, Ethereum, Base, Arbitrum, Optimism, BNB Chain, Polygon, Avalanche, Bitcoin, Tron), and send NEAR to any .near name.

How you work:
- Use the tools to look up the user's real balances, activity and live prices. Never invent numbers.
- You cannot move money. When the user wants a swap, cash-out, bridge or NEAR send, get a quote first, then call propose_action. The app shows the user a confirmation card; nothing happens until they tap Confirm (sends and bridges also need a code from their email).
- Propose at most one action per message unless the user clearly asked for several steps, and say what the card will do in one short sentence.
- Buying NEAR with a bank transfer happens in the Buy tab; point the user there (you can't start a purchase).
- Amounts: if the user says "half" or "all", work it out from their balance; keep about 0.06 NEAR back for network fees.
- Be brief and plain: short sentences, no jargon, no markdown headings. Use the user's currency where it helps.
- If something isn't possible in Paya, say so and suggest the closest thing that is.`;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "get_balances",
    description: "The user's token balances in their Paya account, with USD values and the total.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_activity",
    description: "The user's recent purchases (buys) and cash-outs, newest first.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_tokens",
    description: "Tokens on NEAR the user can swap between, with their ids (use these ids in quote_swap / propose_action) and USD prices.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "quote_swap",
    description: "Live price for swapping one NEAR token to another inside the account. Returns amount out, minimum out and the maximum the user can swap.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Token id to swap from ('near' for NEAR, or a token contract id from list_tokens)." },
        to: { type: "string", description: "Token id to swap to." },
        amount: { type: "number", description: "Amount of the 'from' token." },
      },
      required: ["from", "to", "amount"],
      additionalProperties: false,
    },
  },
  {
    name: "quote_cashout",
    description: "Live quote for selling NEAR to the user's linked bank account: how much local currency arrives.",
    input_schema: {
      type: "object",
      properties: { near: { type: "number", description: "NEAR to sell (minimum 1)." } },
      required: ["near"],
      additionalProperties: false,
    },
  },
  {
    name: "list_bridge_chains",
    description: "Chains and tokens available for bridging out, with their asset ids.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "quote_bridge_out",
    description: "Live quote for sending a NEAR token to an address on another chain.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Token id on NEAR to send ('near' or a contract id)." },
        to_asset: { type: "string", description: "Destination asset id from list_bridge_chains." },
        amount: { type: "number" },
        recipient: { type: "string", description: "Recipient address on the destination chain." },
      },
      required: ["from", "to_asset", "amount", "recipient"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_action",
    description:
      "Show the user a confirmation card for a money movement. Nothing moves until they confirm. Quote first. kind: swap (from,to,amount), cashout (near), bridge_out (from,to_asset,amount,recipient), send_near (to,near).",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["swap", "cashout", "bridge_out", "send_near"] },
        from: { type: "string" },
        to: { type: "string" },
        to_asset: { type: "string" },
        amount: { type: "number" },
        near: { type: "number" },
        recipient: { type: "string" },
      },
      required: ["kind"],
      additionalProperties: false,
    },
  },
];

const usage = new Map<string, { day: string; n: number }>();
function checkLimit(u: User) {
  const day = new Date().toISOString().slice(0, 10);
  const cur = usage.get(u.id);
  const n = cur && cur.day === day ? cur.n : 0;
  if (n >= DAILY_LIMIT) throw new Error("You've reached today's limit for Ask Paya. Try again tomorrow.");
  usage.set(u.id, { day, n: n + 1 });
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
let seq = 0;

async function runTool(u: User, name: string, input: Record<string, unknown>, proposals: Proposal[]): Promise<unknown> {
  switch (name) {
    case "get_balances": {
      const h = await holdings(u.address);
      return { totalUsd: Number(h.totalUsd.toFixed(2)), tokens: h.holdings.map((x) => ({ id: x.id, symbol: x.symbol, amount: x.amount, usd: Number(x.usd.toFixed(2)) })) };
    }
    case "get_activity":
      return {
        buys: buys.forAccount(u.address).slice(0, 8).map((b) => ({ when: b.created_at, status: b.status, paid: `${b.fiat_amount} ${b.currency}` })),
        cashouts: swaps.forAccount(u.address).slice(0, 8).map((s) => ({ when: s.created_at, status: s.status, near: s.amount_in, currency: s.currency })),
      };
    case "list_tokens":
      return (await tokens()).map((t) => ({ id: t.id, symbol: t.symbol, name: t.name, priceUsd: t.priceUsd }));
    case "quote_swap": {
      const [from, to, amount] = [str(input.from), str(input.to), num(input.amount)];
      if (!from || !to || !amount) throw new Error("from, to and amount are required");
      return await quoteSwap(u, from, to, amount);
    }
    case "quote_cashout": {
      const near = num(input.near);
      if (!near) throw new Error("near is required");
      if (!u.currency || !u.bank_name) throw new Error("The user hasn't linked a bank account yet (Sell tab).");
      const p = await preview(near, u.currency);
      return { near, fiatOut: p.fiatOut, currency: p.currency, feePercent: p.feePercent, bank: u.bank_name };
    }
    case "list_bridge_chains":
      return (await bridgeChains()).map((c) => ({ chain: c.name, tokens: c.tokens.map((t) => ({ symbol: t.symbol, assetId: t.assetId })) }));
    case "quote_bridge_out": {
      const [from, toAsset, amount, recipient] = [str(input.from), str(input.to_asset), num(input.amount), str(input.recipient)];
      if (!from || !toAsset || !amount || !recipient) throw new Error("from, to_asset, amount and recipient are required");
      return await accountQuoteOut(u, { from, toAsset, amount, recipient });
    }
    case "propose_action":
      return propose(u, input, proposals);
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

/** Re-quote server-side so the card shows real numbers, whatever the model passed. */
async function propose(u: User, input: Record<string, unknown>, proposals: Proposal[]) {
  const id = `prop_${Date.now().toString(36)}_${++seq}`;
  const kind = input.kind;
  if (kind === "swap") {
    const [from, to, amount] = [str(input.from), str(input.to), num(input.amount)];
    if (!from || !to || !amount) throw new Error("swap needs from, to and amount");
    const q = await quoteSwap(u, from, to, amount);
    if (amount > q.max + 1e-9) throw new Error(`The user can swap at most ${q.max}`);
    const list = await tokens();
    const sym = (i: string) => list.find((t) => t.id === i)?.symbol ?? i;
    proposals.push({ id, kind, from, to, amount, fromSymbol: sym(from), toSymbol: sym(to), amountOut: q.amountOut, minOut: q.minOut });
  } else if (kind === "cashout") {
    const near = num(input.near);
    if (!near) throw new Error("cashout needs near");
    if (!u.currency || !u.bank_name) throw new Error("No linked bank account yet.");
    const p = await preview(near, u.currency);
    proposals.push({ id, kind, near, fiatOut: p.fiatOut, currency: p.currency, bank: `${u.bank_name} •••• ${(u.account_number ?? "").slice(-4)}` });
  } else if (kind === "bridge_out") {
    const [from, toAsset, amount, recipient] = [str(input.from), str(input.to_asset), num(input.amount), str(input.recipient)];
    if (!from || !toAsset || !amount || !recipient) throw new Error("bridge_out needs from, to_asset, amount and recipient");
    const q = await accountQuoteOut(u, { from, toAsset, amount, recipient });
    const chains = await bridgeChains();
    const c = chains.find((x) => x.tokens.some((t) => t.assetId === toAsset))!;
    const list = await tokens();
    proposals.push({
      id,
      kind,
      from,
      fromSymbol: list.find((t) => t.id === from)?.symbol ?? from,
      toAsset,
      toSymbol: c.tokens.find((t) => t.assetId === toAsset)!.symbol,
      chain: c.name,
      amount,
      recipient,
      amountOut: q.amountOut,
    });
  } else if (kind === "send_near") {
    const [to, near] = [str(input.to), num(input.near)];
    if (!to || !near) throw new Error("send_near needs to and near");
    proposals.push({ id, kind, to: to.toLowerCase(), near });
  } else throw new Error("Unknown kind");
  return { shown: true, note: "A confirmation card is now on screen. The user must tap Confirm." };
}

const client = () => {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Ask Paya isn't switched on yet.");
  return new Anthropic();
};

export async function askPaya(u: User, history: ChatTurn[]): Promise<{ reply: string; proposals: Proposal[] }> {
  checkLimit(u);
  const anthropic = client();
  const messages: Anthropic.Beta.BetaMessageParam[] = history.slice(-20).map((t) => ({ role: t.role, content: t.text }));
  if (!messages.length || messages[0].role !== "user") throw new Error("Start with a question.");
  const proposals: Proposal[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);

    if (response.stop_reason === "refusal") return { reply: "Sorry, I can't help with that one.", proposals };
    messages.push({ role: "assistant", content: response.content });

    const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || !calls.length) {
      const reply = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      audit("ask_paya", u.email, { steps: step + 1, proposals: proposals.length });
      return { reply: reply || "Done.", proposals };
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(
      calls.map(async (call) => {
        try {
          const out = await runTool(u, call.name, (call.input ?? {}) as Record<string, unknown>, proposals);
          return { type: "tool_result" as const, tool_use_id: call.id, content: JSON.stringify(out) };
        } catch (e) {
          return { type: "tool_result" as const, tool_use_id: call.id, content: (e as Error).message, is_error: true };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }
  return { reply: "That took too many steps. Try asking more simply.", proposals };
}
