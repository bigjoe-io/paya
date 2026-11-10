# Paya relay

The service that turns a NEAR deposit into naira in a bank account, with no action from the user.

```
<user>.paya.near receives NEAR
      │  watcher sees balance ≥ MIN_CASHOUT_NEAR
      ▼
order created ── 1Click quote (NEAR → USDC on Solana, recipient = rail's Solana wallet)
      │  operator calls forward_all on the deposit account (on-chain, logged as an event)
      ▼
swapping ── poll 1Click until SUCCESS → amountOut USDC
      │  naira = USDC × live rate − rail payout fee − Paya margin
      ▼
paying ── rail payout to the user's verified bank account (idempotent reference)
      │  webhook or poll → completed
      ▼
paid
```

## Run

```bash
cp .env.example .env   # fill in the factory, operator key, and (optionally) rail + Privy keys
npm install
npm run dev
```

Everything that only exists on mainnet/production degrades to a clearly-labelled simulation:

| Missing | What happens |
|---|---|
| `NEAR_NETWORK=testnet` | 1Click is simulated; NEAR is still forwarded on-chain (to the operator) so the contract path is exercised |
| no `FOSSAPAY_API_KEY` | banks list, name enquiry, fees and payouts are simulated and logged |
| no Privy keys | the API trusts an `x-demo-email` header from the frontend |

## API

| Method | Path | What |
|---|---|---|
| GET | `/health` | mode flags |
| GET | `/rate` | live USDC→NGN and NEAR→NGN (CoinGecko, 60s cache, open.er-api fallback) |
| GET | `/estimate?near=25` | full cost breakdown for a given NEAR amount |
| GET | `/banks` | Nigerian banks and codes (from the rail) |
| POST | `/me` | create/resolve the caller's account and `<id>.paya.near` deposit address |
| GET | `/me` | account + live deposit balance |
| POST | `/me/bank/verify` | name enquiry preview |
| POST | `/me/bank` | verify and save the payout bank account |
| GET | `/me/orders` | cash-out history |
| POST | `/webhooks/fossapay` | signed payout events (HMAC-SHA256 of `data`) |

Auth: `Authorization: Bearer <privy access token>` or, in demo mode, `x-demo-email: you@example.com`.

## Pricing

```
gross  = usdc_received × rate(USDC→NGN, live)
rail   = payout fee quoted live by the rail
margin = gross × MARGIN_BPS / 10 000
net    = floor(gross − rail − margin)        ← what lands in the bank
```

The swap itself costs ~0.25 % (1Click platform fee without a partner key; ~0.2 % with one) plus solver spread; that is already reflected in `usdc_received`.
