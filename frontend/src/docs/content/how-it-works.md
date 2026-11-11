---
title: How it works
summary: The path your money takes for a cash-out and a purchase.
group: Fees & security
order: 3
tags: cash-out, buying-near, fees-and-limits
---

## Cash-out

```text title="Cash-out"
Your Paya NEAR address
   │  NEAR
   ▼
Exchange provider (the best available: ChangeNOW, SimpleSwap, The Change, …)
   │  USDC on Solana
   ▼
Paya's payout wallet  ── reads exactly how much arrived
   │  that exact USDC
   ▼
Payment partner (PAJ)
   │  local currency
   ▼
Your bank account
```

Paya asks several exchange providers for a price and uses the best one that's available at that moment. If one is down, the next is used.

## Purchase

```text title="Purchase"
Your bank transfer
   │  local currency
   ▼
Payment partner (PAJ)
   │  USDC on Solana
   ▼
Paya's payout wallet
   │  USDC
   ▼
Exchange provider (the best available)
   │  NEAR
   ▼
Your Paya NEAR address
```

If a provider can't complete a purchase, the USDC comes back to Paya and is sent to a different provider, up to three times.

## Why USDC?

USDC is a digital US dollar. It's the bridge between NEAR and local currencies: exchange providers turn NEAR into USDC, and our payment partner turns USDC into naira, cedis, shillings or rand.

## Who does what

| | Role |
|---|---|
| **Paya** | Your account, your NEAR address, routing, and keeping each order on track |
| **Exchange providers** | Converting NEAR ⇄ USDC, chosen per order through the Rubic aggregator |
| **PAJ** | Licensed payment partner: bank payouts, collections and account-name checks |
