---
title: Agent API reference
summary: Endpoints, request and response shapes, and the sign-and-submit flow for building NEAR trading agents on Paya.
group: Developers
order: 2
tags: developers, swapping-tokens, bridging
---

Base URL: `https://paya-render.onrender.com`. All responses are JSON. Errors return a non-2xx status with `{ "error": "…" }`. No API key is required.

## The flow

1. **Quote**: get a live price (no signing).
2. **Build**: ask Paya for the swap or bridge. It returns a one-time `depositAddress` and the `transactions` to sign.
3. **Sign and send** those transactions, in order, from the agent's NEAR account.
4. **Submit** the last transaction hash so settlement starts immediately.
5. **Track** status until `done` (or `refunded` / `failed`, in which case funds went back automatically).

## Tokens

### `GET /tokens`

Tokens on NEAR that can be swapped. `id` is `"near"` for native NEAR, otherwise the token contract.

```json
[{ "id": "near", "symbol": "NEAR", "decimals": 24, "priceUsd": 3.31 },
 { "id": "17208628f84f…36133a1", "symbol": "USDC", "decimals": 6, "priceUsd": 1 }]
```

### `GET /wallet/holdings?account=<near-account>`

Every token the account holds, with USD values and the total.

```json
{ "totalUsd": 1049.45, "holdings": [{ "id": "near", "symbol": "NEAR", "amount": 263.15, "usd": 928.95 }] }
```

## Swaps (NEAR ⇄ tokens on NEAR)

### `GET /wallet/quote?account=&from=&to=&amount=`

`amount` is in whole units of `from` (e.g. `1.5` NEAR).

```json
{ "amountIn": 1, "amountOut": 3.31, "minOut": 3.27, "amountInUsd": 3.31, "amountOutUsd": 3.30, "max": 12.4, "etaSeconds": 22 }
```

`max` is the most the account can swap right now (NEAR keeps a little back for network fees).

### `POST /wallet/swap`

```json
{ "account": "my-agent.near", "from": "near", "to": "17208628f84f…36133a1", "amount": 1 }
```

Response:

```json
{
  "depositAddress": "319720149fe8…",
  "amountOut": 3.31,
  "transactions": [
    { "receiverId": "wrap.near", "actions": [
      { "type": "FunctionCall", "params": { "methodName": "near_deposit", "args": {}, "gas": "30000000000000", "deposit": "1000000000000000000000000" } }
    ] }
  ]
}
```

Sign each transaction with the account's key (for example with `near-api-js` `account.signAndSendTransaction`). If the account can't yet receive the output token, the first transaction registers it (`storage_deposit`, 0.00125 NEAR).

### `POST /wallet/swap/submit`

```json
{ "depositAddress": "319720149fe8…", "txHash": "<hash of the last transaction>" }
```

### `GET /wallet/swap/<depositAddress>`

```json
{ "status": "processing" | "done" | "refunded" | "failed", "raw": "SUCCESS" }
```

## Bridges (NEAR ⇄ other chains)

### `GET /bridge/chains`

```json
[{ "id": "sol", "name": "Solana", "tokens": [{ "assetId": "nep141:sol-5ce3…omft.near", "symbol": "USDC", "decimals": 6 }] }]
```

### Send out: `GET /wallet/bridge/out/quote` and `POST /wallet/bridge/out`

Parameters: `account`, `from` (token id on NEAR), `toAsset` (from `/bridge/chains`), `amount`, `recipient` (address on the destination chain; its format is checked). The POST returns `depositAddress`, `amountOut` and `transactions` exactly like `/wallet/swap`; submit and track the same way.

### Receive in: `GET /wallet/bridge/in/quote` and `POST /wallet/bridge/in`

Parameters: `account` (the NEAR account that receives), `fromAsset`, `to` (token id on NEAR), `amount`, `refundAddress` (on the origin chain). The POST returns deposit instructions:

```json
{ "depositAddress": "0x7a3f…", "chain": "Ethereum", "symbol": "USDC", "amount": 50, "amountOut": 14.12, "deadline": "…", "registration": null }
```

Send exactly `amount` of that token on that chain to `depositAddress`. If `registration` is a transaction, sign it first so the account can receive the token. Track with `GET /wallet/swap/<depositAddress>`.

## Use it from an LLM agent

Expose the endpoints as tools (quote, swap, bridge, status) and keep signing in your own code: the model proposes, your code checks the quote and signs. This is exactly how **Ask Paya** works inside the app. See [Ask Paya](/docs/ask-paya).

## Example agent

[`examples/near-trading-agent`](https://github.com/bigjoe-io/paya/tree/main/examples/near-trading-agent):

```bash
npx tsx agent.ts quote near usdc 1          # price
npx tsx agent.ts swap near usdc 1           # swap, signed by your key
npx tsx agent.ts rebalance 50               # keep ~50% of value in USDC
npx tsx agent.ts bridge usdc sol:USDC 5 <solana-address>
```

## Limits

Be reasonable: the upstream NEAR Intents route has its own rate limits, so avoid tight polling loops (every 4–5 seconds is plenty for status). Minimum amounts depend on the route; a too-small amount returns a clear error.
