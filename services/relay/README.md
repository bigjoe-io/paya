# Paya relay

Runs Paya accounts: email sign-in, one NEAR address per user, a linked payout bank, and the cash-outs and purchases between them.

```
any wallet / exchange ──NEAR──▶ user's Paya address (implicit account, key derived from MASTER_SEED)
                                    │ deposit watcher sees it (auto cash-out on)
                                    ▼ relay signs: wrap + send wNEAR
                          NEAR Intents deposit address
                                    │ 1Click EXACT_OUTPUT: exactly the USDC PAJ asked for, on Solana
                                    ▼
                    PAJ deposit address ──▶ PAJ pays the linked bank ──▶ COMPLETED
```

## Accounts and custody

- **Sign-in** is email OTP through PAJ. Verifying creates the account on first use and returns a Paya session (HMAC-signed, 30 days). The PAJ session is stored encrypted (AES-256-GCM, `DATA_KEY`) because cash-outs run while the user is away.
- **NEAR address**: user *i* gets the implicit account `hex(ed25519_pub(HMAC-SHA256(MASTER_SEED, "paya/near/v1/i")))`. Only the index is stored. **`MASTER_SEED` is the custody of every user's NEAR**: back it up offline, keep it only in the host's secret store, never change it.
- **Payout bank**: one per account, changeable. The holder's name always comes from the bank lookup, never from the client.
- **Auto cash-out** (default on): every address is polled; spendable NEAR ≥ `AUTO_MIN_NEAR` is cashed out to the linked bank. `RESERVE_NEAR` stays for fees. A failed or refunded attempt pauses auto for 30 minutes. If the PAJ session has expired, the NEAR waits until the user verifies their email again.
- **Buying** turns auto cash-out off for that user, so bought NEAR isn't sold straight back. wNEAR that arrives is unwrapped automatically.
- **Sending NEAR elsewhere** needs a fresh email code every time.
- Every send waits for `FINAL`, one transfer per user at a time, with a cooldown so a lagging RPC read can never trigger a second send.

## Run

```bash
cp .env.example .env   # PAJ_API_KEY, and MASTER_SEED / DATA_KEY / SESSION_SECRET (openssl rand -hex 32 each)
npm install
npm run dev            # http://localhost:8787
npm test               # key derivation, signing, encryption, sessions
```

`LIVE_ORDERS=false`: sign-in, banks, account-name lookup and quotes are real; no PAJ order is created and no NEAR is sent. Set `LIVE_ORDERS=true` only when you mean to move real money.

## API

| Method | Path | Auth | What |
|---|---|---|---|
| GET | `/health`, `/currencies`, `/prices` | — | reference data |
| GET | `/quote?near=&currency=` | optional | cash-out price breakdown |
| POST | `/auth/start` · `/auth/verify` | — | email code → Paya session (creates the account) |
| GET | `/me` | session | email, NEAR address, balances, linked bank, auto cash-out |
| PUT | `/me/bank` | session | link or change the payout bank |
| PUT | `/me/auto` | session | auto cash-out on/off |
| POST | `/cashout` | session | cash out NEAR from the balance now |
| POST | `/me/withdraw` | session + email code | send NEAR to another address |
| GET | `/me/activity` | session | cash-outs and purchases |
| GET | `/swaps/:id` | session (owner) | cash-out status |
| GET | `/banks?currency=` · POST `/bank-accounts/resolve` · GET/POST `/bank-accounts` · POST `/kyc` | session | bank data via PAJ |
| GET | `/buy/currencies` · `/buy/quote` | optional | purchase pricing |
| POST | `/buys` · `/buys/:id/sent` · GET `/buys/:id` | session (owner) | buy NEAR by bank transfer |
| POST | `/webhooks/paj` | — | hint only; the order is re-read from PAJ |
| * | `/admin/*` | `ADMIN_TOKEN` | server-to-server admin API (no CORS) |

## Fees, per cash-out

| Leg | Cost |
|---|---|
| 1Click swap | 0.25 % platform fee (≈0.2 % with a partner JWT) + solver spread, and a fixed ≈0.22 USDC Solana withdrawal fee |
| PAJ | its spread is inside the rate it quotes |
| Paya | `FEE_PERCENT` of the USDC (default 0.5 %), charged through PAJ |
