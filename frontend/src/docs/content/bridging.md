---
title: Bridge to other chains
summary: Send tokens from NEAR to Solana, Ethereum, Base, Bitcoin and more, or receive from them into NEAR, with NEAR Intents.
group: Using Paya
order: 8
tags: swapping-tokens, agent-api
---

Bridge moves tokens between NEAR and **10 chains**: Solana, Ethereum, Base, Arbitrum, Optimism, BNB Chain, Polygon, Avalanche, Bitcoin and Tron, with their main tokens (the chain's own coin plus USDC and USDT where available).

## Send to another chain

1. Open **Bridge → Send to another chain**.
2. Choose the token on NEAR and the amount.
3. Choose the destination chain and token (for example **Solana · USDC**) and paste the recipient address.
4. Check what arrives, the minimum and the time, then confirm. Paya accounts confirm with a **code from your email**; connected wallets approve in the wallet.

Paya checks the address format for the chain you picked: an Ethereum address won't be accepted for Solana.

## Receive from another chain

1. Open **Bridge → Receive from another chain**.
2. Choose the chain and token you'll send from, the amount, and what you want to receive on NEAR.
3. Enter **your address on that chain** in case a refund is needed.
4. Paya gives you a **one-time deposit address**. Send exactly that amount of that token on that chain before the deadline shown.
5. Paya detects the deposit and the tokens arrive in your Paya balance (or connected wallet).

> [!WARNING]
> Only send the token and chain shown on the deposit screen. Other tokens or chains sent to that address can be lost.

## Fees and refunds

The rate shown already includes the route's fees. If a bridge can't complete, the funds are **refunded automatically**: outgoing bridges back to your NEAR account, incoming ones to the refund address you gave.
