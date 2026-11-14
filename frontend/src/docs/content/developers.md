---
title: Paya for developers
summary: Build NEAR agents and apps on Paya: a public, non-custodial API for token prices, swaps and cross-chain bridges via NEAR Intents.
group: Developers
order: 1
tags: agent-api
---

Paya exposes the same rails its app uses as a **public API**. Any app, bot or AI agent with a NEAR account can use it to:

- **Read balances** of any NEAR account across every supported token, with USD values.
- **Price swaps** between NEAR and tokens on NEAR (USDC, USDT, BTC, ETH, …).
- **Swap**: Paya returns the exact transactions to sign; outputs and refunds go back to the same account.
- **Bridge** to and from Solana, Ethereum, Base, Arbitrum, Optimism, BNB Chain, Polygon, Avalanche, Bitcoin and Tron.
- **Track** every swap or bridge until it settles.

## Why build on it

- **Non-custodial.** Paya never holds funds or keys. Your agent signs; Paya only prices and builds the transactions.
- **No API key needed** to start. Base URL: `https://paya-render.onrender.com`.
- **Best execution** through NEAR Intents, with automatic refunds if a trade can't fill.
- **An example agent** you can copy: [`examples/near-trading-agent`](https://github.com/bigjoe-io/paya/tree/main/examples/near-trading-agent) quotes, swaps, rebalances and bridges in ~150 lines.

## Quick taste

```bash
curl "https://paya-render.onrender.com/wallet/quote?account=my-agent.near&from=near&to=17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1&amount=1"
# {"amountOut":3.31,"minOut":3.27,...}
```

Next: the full [Agent API reference](/docs/agent-api).

## Coming next

Fiat payouts (NEAR → bank in NGN and more), collections, and signed webhooks for partners. Tell us what you need in the [Paya Telegram](https://t.me/+6bF2vlPxU_kwMzk0).
