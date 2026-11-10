# Paya

One click from NEAR to fiat. Paya is a non-custodial off-ramp built on NEAR: send NEAR (or any token via NEAR Intents), receive cash in your bank account in under a minute. Nigeria (NGN) first.

Built for the [NEAR Hackathon](https://nearhackathon.com) — Track 08, Real-World Money.

## Repository layout

| Folder | What lives here |
|---|---|
| [`frontend/`](frontend/) | Next.js 16 app: landing page and (soon) the off-ramp app UI |
| [`contracts/`](contracts/) | NEAR smart contracts (Rust, `near-sdk-rs`): order escrow and settlement |
| [`design/`](design/) | Brand notes, reference screenshots, final assets |

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000.

## Status

- [x] Landing page
- [ ] App UI (quote → bank details → send)
- [ ] Escrow contract
- [ ] Payout service (naira)
