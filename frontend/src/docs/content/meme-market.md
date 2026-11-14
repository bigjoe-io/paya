---
title: Meme market
summary: Launch your own meme coin on NEAR in one step, and buy and sell every coin launched on Paya.
group: Using Paya
order: 10
tags: swapping-tokens, fees-and-limits
---

The **Meme market** (sidebar → Meme market) lists every meme coin launched on Paya, with its price, market cap, liquidity and age, and lets anyone launch a new one.

> [!NOTE]
> Launching and trading are switched on after the final mainnet test. Until then you can browse and preview the launch form and its costs.

## Launch a coin

1. Tap **Launch a coin**.
2. Add an image, a **name** (2–32 characters) and a **ticker** (2–8 letters or numbers). Add a description if you like.
3. Choose the **total supply**, how much **NEAR** to put in as starting liquidity (at least 0.5), and what **share of the supply** goes into the pool. You keep the rest.
4. Paya shows every cost before you launch: the token's NEAR storage deposit, the exchange setup and your starting liquidity.
5. Tap **Launch**. In about a minute your coin is live and tradable.

What happens on-chain:

- Your coin is created by **NEAR's official token factory** (`tkn.primitives.near`) as a standard NEP-141 token at `<ticker>.tkn.primitives.near`, owned by your account, with the full supply.
- A **Ref Finance** pool (your coin / wNEAR, 0.3% fee) is created and seeded with your starting liquidity, so anyone can trade it straight away. The liquidity stays in your Ref account and you can withdraw it later.

If a ticker already exists on NEAR, Paya tells you before you pay.

## Typical cost

For a 1,000,000,000-supply coin with 1 NEAR of liquidity: about **2.36 NEAR** token storage + **0.22 NEAR** exchange setup + **1 NEAR** liquidity = **about 3.57 NEAR**. Your balance needs about 4.02 NEAR before launching, because NEAR reserves gas up front and refunds most of it.

## Buy and sell

Tap any coin, choose **Buy** or **Sell** and an amount. You see what you'll get, the **minimum** (2% slippage protection) and the **price impact** before you confirm. Trades go through the coin's Ref Finance pool, and what you receive lands in your Paya balance.

> [!WARNING]
> Meme coins are very risky. Prices swing fast, and creators can withdraw their liquidity. Only trade what you can afford to lose.
