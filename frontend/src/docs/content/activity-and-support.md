---
title: Activity and Support IDs
summary: See every purchase and cash-out, what each status means, and how to trace an order.
group: Using Paya
order: 6
tags: troubleshooting, get-help
---

## Activity

The **Activity** tab lists every purchase and cash-out on your account, newest first. Tap **Details & transaction IDs** on any order to see:

| Field | What it is |
|---|---|
| **Support ID** | The order's ID, like `swp_1a2b3c4d5e6f` (cash-out) or `buy_…` (purchase). Give this to support. |
| **NEAR sent** | The transaction that sent your NEAR to the exchange provider |
| **Exchanged by** | The provider that converted it |
| **USDC received / USDC to payout** | The Solana transactions for the dollar leg |
| **NEAR delivered** | For purchases: the transaction that delivered your NEAR |
| **Bank reference** | The payout reference, once paid |

Each transaction ID links to a public explorer, so you can check it yourself.

## Cash-out statuses

| Status | Meaning |
|---|---|
| **Processing** | Converting and paying out. Usually 5–10 minutes. |
| **Paid** | The money is in your bank account. |
| **Refunded** | The exchange couldn't complete; your NEAR is back in your balance. |
| **Expired** | Nothing was sent; nothing left your balance. |
| **Failed** | Something went wrong. Contact support with the Support ID. |

## Purchase statuses

| Status | Meaning |
|---|---|
| **Awaiting transfer** | Waiting for your bank transfer. |
| **Processing** | Payment received; buying your NEAR. |
| **Received** | The NEAR is in your balance. |
| **Cancelled** | Closed before payment. A payment made within 24 hours is still delivered. |
| **Expired** | No payment arrived within 24 hours. |
| **Failed** | Contact support with the Support ID. Your money is safe with Paya. |

## Your Support ID

Every order screen and every Activity row shows a **Support ID** you can copy. With it, our team can see every step of the order and exactly where the money is.
