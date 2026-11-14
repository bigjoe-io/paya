---
title: Swap tokens
summary: Swap NEAR, USDC, USDT, BTC, ETH and other tokens on NEAR, inside your Paya balance or from your own connected wallet.
group: Using Paya
order: 7
tags: bridging, ask-paya, agent-api
---

Paya can swap between NEAR and the tokens that live on NEAR: **USDC, USDT, BTC, ETH, stNEAR** and about two dozen more. Prices come from **NEAR Intents**, which routes each swap to the best available price.

## Swap in your Paya account

1. Open **Swap** in the app.
2. Pick what you have and what you want, for example **NEAR → USDC**. Tap the ⇅ button to flip them.
3. Type an amount or tap **Max**. You see the rate, the **minimum you'll get** and the route before you confirm.
4. Tap **Swap**. It usually lands in under a minute, and the new token appears in your balance list.

Each token shows as its own row with its amount and dollar value; tokens on NEAR carry a small NEAR badge on their logo. Your **total balance** adds up every token you hold.

> [!NOTE]
> Swapping **into NEAR** turns auto cash-out off, so the NEAR you just swapped into isn't immediately sold to your bank. Turn it back on in **Sell** whenever you like.

## Swap from your own wallet

No Paya account needed. Open **Wallet**, tap **Connect wallet** and choose HOT, Meteor, Nightly, MyNEAR Wallet or another NEAR wallet. Then swap exactly as above: your wallet approves the transaction and the tokens come straight back to it. Paya never holds your funds or keys.

The first time a wallet receives a token, it asks for one extra approval to register for it (about 0.00125 NEAR, refunded if not needed).

## If a swap can't complete

If the price moves past your minimum or the route can't fill, the swap is **refunded automatically** to where it came from. Nothing is lost.
