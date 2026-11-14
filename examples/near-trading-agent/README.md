# Paya NEAR trading agent (example)

A minimal, non-custodial trading agent built on the **Paya Agent API**. It quotes, swaps and bridges tokens from **your own NEAR account**: Paya prices each trade through NEAR Intents and returns the exact transactions to sign. Your private key never leaves this process, and every output and refund goes back to your account.

```bash
npm install
cp .env.example .env                                       # NEAR_ACCOUNT_ID + NEAR_PRIVATE_KEY
npx tsx --env-file=.env agent.ts quote near usdc 1         # price only (no key needed)
npx tsx --env-file=.env agent.ts swap near usdc 1          # swap 1 NEAR -> USDC
npx tsx --env-file=.env agent.ts rebalance 50              # keep ~50% of value in USDC
npx tsx --env-file=.env agent.ts bridge usdc sol:USDC 5 <solana-address>
```

API reference: https://www.usepaya.xyz/docs/agent-api
