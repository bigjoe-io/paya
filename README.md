# Paya

One click from NEAR to fiat. Send NEAR to your Paya address; naira lands in your bank account. Nothing else to do.

Built for the [NEAR Hackathon](https://nearhackathon.com) — Track 08, Real-World Money.

## How it works

```
you@example.com ──sign in──▶ joseph.paya.near   (a deposit account created by the Paya factory contract)
                                   │  send NEAR here from any wallet or exchange
                                   ▼
relay sees the balance ──▶ 1Click quote: NEAR → USDC on Solana ──▶ contract `forward`s the NEAR (on-chain event)
                                   │
                                   ▼
USDC lands in the payout rail's Solana wallet ──▶ naira = USDC × live rate − bank fee − Paya fee
                                   │
                                   ▼
payout to the user's verified Nigerian bank account ──▶ paid
```

- **Contracts** ([contracts/](contracts/)): a factory that creates one deposit account per user, and the deposit contract that only lets NEAR leave via `forward` (operator, logged) or `withdraw` (user's own escape hatch).
- **Relay** ([services/relay/](services/relay/)): watches deposit accounts, drives NEAR Intents 1Click, prices in naira from a live rate, pays out through the rail, verifies webhooks.
- **Frontend** ([frontend/](frontend/)): landing page and the dashboard — email sign-in, your Paya address, bank setup with name verification, live rate with the full fee breakdown, cash-out history.

## Run it locally (testnet, simulated swap + payout)

```bash
# 1. relay
cd services/relay && cp .env.example .env   # set FACTORY_ACCOUNT_ID, OPERATOR_ACCOUNT_ID, OPERATOR_PRIVATE_KEY
npm install && npm run dev                   # http://localhost:8787

# 2. frontend
cd frontend && npm install && npm run dev    # http://localhost:3000 → /app
```

Sign in with any email, add a bank account (the full Nigerian bank list loads; account numbers are checked with the CBN NUBAN check digit — e.g. GTBank `0123456785` passes — and the holder's name is confirmed once the payout rail is live), then send testnet NEAR to the address shown. The order appears within seconds and walks Received → Swapping → Paying → Paid.

A factory is deployed on testnet at `paya-demo-6282.testnet` (see [contracts/README.md](contracts/README.md) to deploy your own).

## Going live

1Click (the swap) exists only on mainnet; the payout rail is production-only. To run for real:

| Need | Why |
|---|---|
| Mainnet NEAR account for the factory (e.g. `paya.near`) with ~10 NEAR | account creation + storage for deposit accounts; publish the deposit contract as a global contract to make each account cost < 0.01 NEAR |
| Payout rail API key + a funded master NGN wallet + a master Solana wallet | USDC arrives in the Solana wallet; naira leaves the NGN wallet |
| Privy app id + secret (email login) | replaces the demo `x-demo-email` header with verified tokens |
| 1Click partner JWT (optional) | drops the swap platform fee from 0.25 % to ~0.2 % |

## Pricing

```
gross  = USDC received × USDC→NGN (CoinGecko, 60 s cache; open.er-api fallback)
rail   = bank payout fee, quoted live by the rail
margin = gross × MARGIN_BPS / 10 000          (default 50 bps = 0.5 %)
net    = floor(gross − rail − margin)         ← what lands in the bank
```

The swap leg (1Click platform fee + solver spread, ~0.3 %) is already inside "USDC received".

## Status

- [x] Landing page
- [x] Dashboard (email sign-in, Paya address, bank setup, live rate, order tracking)
- [x] Factory + deposit contracts (unit-tested, deployed on testnet)
- [x] Relay: detection → 1Click → pricing → payout → webhooks, with simulation modes
- [x] End-to-end on testnet
- [ ] Privy login (needs app id)
- [ ] Mainnet deployment + live rail keys
- [ ] Bridge-only mode (NEAR → Solana to the user's own wallet)
- [ ] Staking (preview UI only)
