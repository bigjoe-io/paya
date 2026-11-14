# Paya

> ## 🧑‍⚖️ Judges: try Paya live
>
> **Open [usepaya.xyz/app](https://www.usepaya.xyz/app). No access code needed.**
>
> - **Sign in with your email** to get your own Paya account and NEAR address.
> - **Or connect a NEAR wallet** (HOT, Meteor, Nightly, MyNEAR Wallet, …) under **Wallet**.
>
> Paya is live on NEAR mainnet with real money: buying, cashing out, swapping and bridging move real funds.

![Paya app: buy NEAR with naira by bank transfer](docs/app-screenshot.png)

**Paya moves money between NEAR and African bank accounts, in both directions, and across chains.** Sign in with your email (no seed phrase) or connect your own wallet. Buy NEAR with a bank transfer, cash NEAR out to your bank, swap any token on NEAR, bridge to 10 other chains, or ask the built-in AI assistant to do it for you. Developers and AI agents can use the same rails through a public, non-custodial API.

Built at **NEAR HACKATHON** (1–14 November 2026). Track: **08, Real-World Money**. Also relevant to **Agent Economy** (Ask Paya and the Agent API).

## The problem

People and businesses in Africa are increasingly paid in crypto, but rent, salaries and suppliers are paid in local money. Moving between the two today means exchanges, P2P traders, seed phrases and long waits. Paya makes it one step, with every price shown before you commit and every step traceable on-chain.

## Features (all live)

| Feature | What it does | Where | Built on |
|---|---|---|---|
| **Email accounts** | Sign in with a one-time email code. Each account gets its own NEAR implicit address (64-hex), derived server-side. No seed phrase. | `/app` → Sign in with email | NEAR implicit accounts |
| **Buy NEAR** | Enter an amount in naira, see exactly how much NEAR you get, pay by normal bank transfer; NEAR lands in your Paya balance. | `/app` → **Buy** | PAJ (collections) → USDC on Solana → NEAR |
| **Sell / cash out** | Sell NEAR to your linked Nigerian bank account (account name verified with the bank). Rate and every fee shown first. | `/app` → **Sell** | NEAR → USDC (Solana) → PAJ (payouts) |
| **Auto cash-out** | Every NEAR payment that arrives at your Paya address is converted and paid to your bank automatically. | `/app` → **Sell** toggle | Deposit watcher in the relay |
| **Swap** | NEAR ⇄ USDC, USDT, BTC, ETH, stNEAR and ~20 more tokens on NEAR. Tokens stay in your balance, each listed with its own amount and USD value; the total adds them all. | `/app` → **Swap** | **NEAR Intents** (1Click) |
| **Bridge** | Send tokens from NEAR to Solana, Ethereum, Base, Arbitrum, Optimism, BNB Chain, Polygon, Avalanche, Bitcoin or Tron; or receive from them via a one-time deposit address. Address format checked per chain. | `/app` → **Bridge** | **NEAR Intents** (1Click) |
| **Send NEAR** | Send NEAR to any `.near` name or 64-hex address. Every send needs a fresh code from your email. | `/app/account` → Send NEAR | NEAR transfers |
| **Connect wallet** | Connect any NEAR wallet and swap or bridge from it. The wallet signs; outputs go back to it. Paya never holds funds or keys. | `/app/wallet` | NEAR Connect + NEAR Intents |
| **Ask Paya (AI)** | Chat in plain words ("swap half my NEAR to USDC", "send 2 USDC to my Solana wallet"). The assistant reads balances and live prices and proposes the action as a confirmation card; the server re-prices it, and nothing moves until the user confirms (sends and bridges also need the email code). | `/app/ask` | Claude (Anthropic) tool use |
| **Agent API** | Public, non-custodial API for apps and AI agents: holdings, quotes, swaps, bridges, status. Returns transactions for the caller to sign. | [`/docs/agent-api`](https://www.usepaya.xyz/docs/agent-api) | NEAR Intents |
| **Example trading agent** | ~150-line TypeScript agent: quote, swap, rebalance to a USDC target, bridge. | [`examples/near-trading-agent`](examples/near-trading-agent) | Agent API + near-api-js |
| **Activity** | Every buy and cash-out with its Support ID and the NEAR and Solana transaction IDs for each hop. | `/app/activity` | — |
| **Docs, blog, SEO** | 20 docs pages (incl. developer docs), two articles, sitemap, structured data. | [`/docs`](https://www.usepaya.xyz/docs), [`/blog`](https://www.usepaya.xyz/blog) | Next.js |
| **Admin console** | Password-protected support dashboard: accounts, orders with full timelines, audit log. | separate app | Next.js |

Coming soon: **Earn** (staking rewards). Payout countries after Nigeria: Ghana, Kenya, Tanzania, South Africa.

## Try it (do X → see Y)

1. Open [usepaya.xyz/app](https://www.usepaya.xyz/app) → you see two options: **Sign in with email** and **Connect a NEAR wallet**.
2. **Sign in with email** → enter the code from your inbox → your balance and your own NEAR address appear.
3. **Swap** tab → pick NEAR → USDC, type `0.1` → you see the rate, minimum received and "Route: NEAR Intents" before confirming.
4. **Bridge** tab → **Receive from another chain** → choose Ethereum · USDC → you get a one-time Ethereum deposit address and the exact amount to send.
5. **Wallet** (sidebar) → **Connect wallet** → your wallet's tokens and total appear; swap from it and approve in your wallet.
6. **Ask Paya** (sidebar) → type "What's my balance?" → it answers from your real balances; "Swap 1 NEAR to USDC" → a confirmation card appears.
7. Developers: `curl "https://paya-render.onrender.com/wallet/quote?account=near&from=near&to=17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1&amount=1"` → a live NEAR → USDC quote.

## How NEAR is used

- **Accounts:** every Paya user gets a NEAR implicit account, so anyone can pay them in NEAR like a bank account number, without the user handling keys.
- **NEAR Intents (1Click):** all token swaps and cross-chain bridges, for Paya accounts, connected wallets and the public Agent API. Funds are deposited to a one-time 1Click address; outputs and refunds return to the user's own account.
- **NEAR Connect:** wallet connection (HOT, Meteor, Nightly, MyNEAR Wallet, …).
- **near-api-js:** signing for Paya accounts (relay) and in the example agent.

## Architecture

```
Buy:     bank transfer ──PAJ──▶ USDC (Solana, Paya treasury) ──swap──▶ NEAR in the user's address
Sell:    NEAR in the user's address ──swap──▶ USDC (Solana) ──PAJ──▶ user's bank account
Swap:    token on NEAR ──NEAR Intents──▶ token on NEAR (same account)
Bridge:  token on NEAR ⇄ NEAR Intents ⇄ token on Solana / Ethereum / Base / Bitcoin / …
Ask:     user ⇄ Claude (tools: balances, quotes, propose) ⇄ confirmation card ⇄ the endpoints above
```

| Part | Path | What it is |
|---|---|---|
| Frontend | [`frontend/`](frontend/) | Next.js 16: landing page, the app (`/app`), docs (`/docs`), blog (`/blog`) |
| Relay | [`services/relay/`](services/relay/) | Node + Hono API: accounts, PAJ, NEAR Intents swaps and bridges, Ask Paya agent, deposit watcher |
| Admin | [`admin/`](admin/) | Next.js support console (server-to-server admin API) |
| Example agent | [`examples/near-trading-agent/`](examples/near-trading-agent/) | Agent API client: quote, swap, rebalance, bridge |
| Design | [`design/`](design/) | Brand kit, demo videos (Remotion + HyperFrames), social posts |
| Contracts | [`contracts/`](contracts/) | An earlier deposit-account design; not used by the live app |

Key relay files: [`tokenswap.ts`](services/relay/src/tokenswap.ts) (swaps, holdings, wallet API), [`bridge.ts`](services/relay/src/bridge.ts) (bridges), [`agent.ts`](services/relay/src/agent.ts) (Ask Paya), [`accounts.ts`](services/relay/src/accounts.ts) (accounts, cash-out, sends), [`buys.ts`](services/relay/src/buys.ts) (buying), [`paj.ts`](services/relay/src/paj.ts) (fiat partner).

## Security

- Paya accounts' keys are derived from a server-held master seed; nothing is ever shown to or stored by the browser.
- Anything leaving an account (send, bridge out) requires a fresh one-time code from the user's email.
- New accounts are never given a NEAR address that has been used on-chain before.
- Connected wallets and the Agent API are non-custodial: Paya returns transactions; the owner signs.
- Ask Paya can only **propose**; the server re-quotes every proposal and the user confirms.
- Bank accounts are verified by account-holder name before any payout.

## Run it locally

```bash
# relay
cd services/relay && cp .env.example .env    # PAJ_API_KEY, MASTER_SEED, ANTHROPIC_API_KEY (optional, for Ask Paya)
npm install && npm run dev                    # http://localhost:8787

# frontend
cd frontend && npm install && npm run dev     # http://localhost:3000 → /app
```

`LIVE_ORDERS=false` (default) keeps everything real except money movement. Set `LIVE_ORDERS=true` for real orders on mainnet.

## Deploy

| Part | Where | Settings |
|---|---|---|
| Frontend | Vercel | Root `frontend`. Env: `NEXT_PUBLIC_RELAY_URL` |
| Relay | Render / Railway / Fly (always-on) | Root `services/relay`, `Dockerfile`. Env: `PAJ_API_KEY`, `MASTER_SEED`, `LIVE_ORDERS`, `ANTHROPIC_API_KEY`, `CORS_ORIGINS`, `PUBLIC_URL`. Persistent disk at `/data` |

## Hackathon disclosure

- All code in this repository was written during NEAR HACKATHON; the first commit is dated 2026-11-10. There is no pre-hackathon code.
- AI coding assistance (Claude Code) was used throughout.
- Third-party services and libraries: NEAR Intents 1Click API, NEAR Connect (`@hot-labs/near-connect`), `near-api-js`, PAJ (fiat on/off-ramp, Nigeria), Rubic (NEAR ⇄ USDC route for buys and cash-outs), Solana `@solana/web3.js` + `@solana/spl-token`, Helius RPC, Anthropic Claude (`@anthropic-ai/sdk`), ElevenLabs (video voiceovers), Next.js, Hono, Tailwind, Remotion, HyperFrames.

## Demo videos

In [`design/hyper/out/`](design/hyper/out/): `paya-buy.mp4`, `paya-sell.mp4`, `paya-swap.mp4`, `paya-bridge.mp4`, plus the Ask Paya and Agent API videos.

## Links

- App: https://www.usepaya.xyz/app · Docs: https://www.usepaya.xyz/docs · X: [@usepaya](https://x.com/usepaya) · Support: [Telegram](https://t.me/+6bF2vlPxU_kwMzk0)
