---
title: Ask Paya (AI assistant)
summary: Ask in plain words. Paya checks your balance and live prices and prepares swaps, cash-outs, bridges and sends for you to confirm.
group: Using Paya
order: 9
tags: swapping-tokens, bridging, agent-api
---

**Ask Paya** is an AI assistant inside the app. It understands plain requests, looks up your real balances and live prices, and prepares the money movement for you. **It never moves money on its own.**

## What you can ask

- "What's my balance?"
- "How much naira would I get for 5 NEAR?"
- "Swap half my NEAR to USDC."
- "Send 2 USDC to my Solana wallet `…`."
- "Send 3 NEAR to joseph.near."
- "What have I bought recently?"

## How confirmation works

When you ask for a swap, cash-out, bridge or send, Ask Paya shows a **confirmation card** with the exact amounts. Then:

1. **Paya re-checks the price on its own servers**, so the numbers on the card are real, whatever the assistant said.
2. Nothing happens until you tap **Confirm**. **Cancel** discards the card.
3. Anything that **leaves your account** (sending NEAR, bridging out) also needs the **code from your email**, just like the Send and Bridge screens.

Buying NEAR with a bank transfer stays in the **Buy** tab; the assistant points you there.

## Limits and privacy

- Up to 40 messages per account per day.
- The assistant sees your balances, recent activity and the prices it looks up, only while answering you. It never sees your keys.
- Ask Paya runs on Claude by Anthropic.
