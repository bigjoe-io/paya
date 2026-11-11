# Paya relay

Prices and tracks "NEAR → bank account" cash-outs. It never holds user funds: the user's wallet signs the only transaction that moves money.

```
user's NEAR wallet ──(wrap + ft_transfer, one signature)──▶ NEAR Intents deposit address
      │  1Click EXACT_OUTPUT: delivers exactly the USDC PAJ asked for, on Solana
      ▼
PAJ deposit address (Solana USDC) ──▶ PAJ pays the bank account ──▶ COMPLETED
```

1. **Quote** — dry 1Click quote (NEAR → USDC on Solana) + PAJ rate (public NGN rate before sign-in, the user's own `offramp-value` after).
2. **Sign-in** — email OTP with PAJ (`/auth/start`, `/auth/verify`). The relay holds Paya's business key; the user's session token comes back to the browser and is sent as `Authorization: Bearer`.
3. **Swap** — PAJ off-ramp order for A USDC (+ Paya's fee via `businessUSDCFee`) → PAJ deposit address + exact amount T → 1Click EXACT_OUTPUT for T USDC to that address → the wallet transaction (wrap NEAR, send wNEAR to the Intents deposit address). Unused NEAR from 1Click's slippage buffer is refunded to the user's wallet.
4. **Track** — 1Click status until `SUCCESS`, then PAJ transaction `INIT → PAID → COMPLETED`.

## Run

```bash
cp .env.example .env   # set PAJ_API_KEY
npm install
npm run dev            # http://localhost:8787
```

`LIVE_ORDERS=false` (default): sign-in, banks, account-name lookup and quotes are real; **no PAJ order is created and the wallet is never asked to send funds** — swaps are simulated. Set `LIVE_ORDERS=true` only when you mean to move real money (mainnet NEAR, real bank payouts).

## API

| Method | Path | Auth | What |
|---|---|---|---|
| GET | `/health` | — | `demo` flag, fee |
| GET | `/currencies` | — | NGN, GHS, KES, TZS, ZAR |
| GET | `/prices` | — | NEAR/USD, USD/NGN |
| GET | `/quote?near=&currency=&account=` | optional | price breakdown |
| POST | `/auth/start` · `/auth/verify` | — | email OTP → session token |
| GET | `/banks?currency=` | session | banks for a country |
| POST | `/bank-accounts/resolve` | session | real account-holder name |
| GET/POST | `/bank-accounts` | session | saved recipients (kept by PAJ) |
| POST | `/kyc` | session | BVN/NIN, if PAJ asks for it |
| POST | `/swaps` | session | place a cash-out → wallet transaction |
| POST | `/swaps/:id/deposit` | — | record the wallet's tx hash |
| GET | `/swaps/:id`, `/swaps?account=` | — | status / history |
| POST | `/webhooks/paj` | — | hint only; the order is re-read from PAJ |

## Fees, per cash-out

| Leg | Cost |
|---|---|
| 1Click swap | 0.25 % platform fee (≈0.2 % with a partner JWT) + solver spread, and a fixed ≈0.22 USDC Solana withdrawal fee |
| PAJ | its spread is inside the rate it quotes |
| Paya | `FEE_PERCENT` of the USDC (default 0.5 %), charged through PAJ |
