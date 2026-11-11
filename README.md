# Paya

One click from NEAR to fiat. Send NEAR to your Paya address; naira lands in your bank account. Nothing else to do.

Built for the [NEAR Hackathon](https://nearhackathon.com) — Track 08, Real-World Money.

## How it works

```
connect a NEAR wallet (HOT, Meteor, Nightly, …) ──▶ type an amount ──▶ pick a bank account ──▶ Swap
                                                                                         │ one signature
NEAR ──NEAR Intents (1Click)──▶ USDC on Solana ──PAJ──▶ bank payout (NGN · GHS · KES · TZS · ZAR)
```

- **Frontend** ([frontend/](frontend/)): landing page and the swap app — wallet connect via NEAR Connect, email verification with the payout network, bank accounts with real account-holder names, a live quote with every fee shown, and progress until the money lands.
- **Relay** ([services/relay/](services/relay/)): quotes, places the PAJ order and the exact-output 1Click swap, hands the wallet one transaction to sign, tracks both legs. Never holds funds.
- **Contracts** ([contracts/](contracts/)): the earlier deposit-account design (factory + locked per-user accounts). Not used by the current wallet flow; kept for a "send NEAR from an exchange" mode.

## Run it locally

```bash
# 1. relay
cd services/relay && cp .env.example .env   # set PAJ_API_KEY
npm install && npm run dev                   # http://localhost:8787

# 2. frontend
cd frontend && npm install && npm run dev    # http://localhost:3000 → /app
```

With `LIVE_ORDERS=false` (the default) everything is real except the money movement: sign-in, banks, name lookup and quotes hit the live services, and swaps are simulated. Set `LIVE_ORDERS=true` in the relay to place real orders (mainnet NEAR, real payouts).

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
