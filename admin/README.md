# Paya Admin

Internal console for operating Paya: every cash-out, its full timeline, and an audit log of user activity. Not linked from the public site, never indexed, and every page is behind a password.

## How it's protected

| Layer | What it does |
|---|---|
| Password sign-in | `ADMIN_PASSWORD`. Wrong attempts are slowed down; 5 misses from one IP lock it for 15 minutes. |
| Signed session | httpOnly, `SameSite=Strict` cookie, HMAC-signed with `ADMIN_SESSION_SECRET`, 12 h expiry. Verified on the server for every page and action. |
| Proxy gate | `src/proxy.ts` bounces requests without a session cookie to `/login` before anything renders. |
| Server-only relay token | The console reads data from the relay's `/admin` API with `RELAY_ADMIN_TOKEN`, from the server only. The relay sends no CORS headers on `/admin`, so a browser can't call it. |
| Headers | `X-Robots-Tag: noindex`, `X-Frame-Options: DENY`, `Cache-Control: no-store`. |

## Run locally

```bash
# 1. relay must have ADMIN_TOKEN set in services/relay/.env, and be running
cd services/relay && npm run dev

# 2. admin console
cd admin
cp .env.example .env.local   # fill in the four values (RELAY_ADMIN_TOKEN = relay's ADMIN_TOKEN)
npm install
npm run dev                  # http://localhost:3001
```

## What you can do

- **Transactions** — totals (paid, in flight, failed/refunded, success rate, volume, fees earned), then every cash-out. Search by NEAR transaction hash, Solana signature, swap id, PAJ order id, wallet, account number or recipient name. Filter by status and live/simulated.
- **A transaction** — money breakdown, who sent and who received, every identifier with a link to its public explorer, and the full timeline (order created → wallet sent → NEAR Intents statuses → PAJ statuses). **Re-check with NEAR Intents** asks for the swap's status right now.
- **Audit log** — sign-ins, saved bank accounts, KYC submissions, created and refused swaps. Account numbers are masked; ID numbers and session tokens are never logged.

## Handling a dispute

1. Ask the user for anything they have: transaction hash, wallet, the amount and time, or their bank account number.
2. Paste it into Search on **Transactions**.
3. Open the swap. The timeline shows the last thing that happened:
   - stuck at **Awaiting wallet** → their wallet never sent; nothing left their account.
   - **Swapping** for long → press *Re-check with NEAR Intents*. `REFUNDED` means the NEAR is back in their wallet.
   - **Paying out** for long → the USDC reached PAJ; quote the PAJ order id and Solana address to PAJ support.
   - **Paid** → give them the bank reference.
4. If the order never appears, search the **Audit log** by their email or wallet: a *Swap rejected* entry shows the exact error they saw.

## Deploy

Deploy as its own project (e.g. a second Vercel project with root directory `admin`) on its own domain such as `admin.yourdomain.com`. Set the four env vars in the host. Consider adding Vercel's password protection or an IP allowlist on top.
