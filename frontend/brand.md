# Brand — Paya

_Status: active_

Paya is a one-click off-ramp built on NEAR: send NEAR, receive naira in your bank account. Not a wallet, not an exchange, never custodial.

## Visual direction

Derived from the reference in `../design/references/fuse-wallet-landing.png`: near-white page, near-black type, large soft-gray cards with 2rem radius, one blue accent, one black contrast card per page. Illustrations sit top-left of a card, titles bottom-left. Lots of air.

## Palette (CSS variables in `src/app/globals.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#FAFAFA` | `#0A0A0A` | page |
| `--foreground` | `#0A0A0A` | `#EDEDED` | headings, body |
| `--card` | `#F3F4F6` | `#141414` | feature cards, panels |
| `--card-foreground` | `#0A0A0A` | `#EDEDED` | text on cards |
| `--muted-foreground` | `#6B7280` | `#A1A1AA` | secondary copy (≥4.5:1 on card + background) |
| `--border` | `#E5E7EB` | `#262626` | 1px dividers, grid lines |
| `--primary` | `#0A0A0A` | `#EDEDED` | primary buttons (black pill) |
| `--primary-foreground` | `#FFFFFF` | `#0A0A0A` | text on primary |
| `--accent` | `#0A66FF` | `#3B82F6` | progress bars, single highlight |
| `--success` | `#16A34A` | `#22C55E` | positive amounts, "paid" states |
| `--inverse` | `#000000` | `#FAFAFA` | the one black contrast card |
| `--inverse-foreground` | `#FFFFFF` | `#0A0A0A` | text on inverse |
| `--ring` | `#0A66FF` | `#3B82F6` | focus rings |

Grays are cool (blue-tinted). One accent: blue. Green only for money-positive meaning.

## Typography

- Sans: **Inter** via `next/font` with the `opsz` axis (`--font-sans`). Large text automatically renders as **Inter Display** — the same Inter + Inter Display pairing Fuse uses. Headings `tracking-tight`, weight 600. Display sizes `text-4xl md:text-5xl lg:text-6xl`.
- Everything is light — landing and dashboard. No dark mode. (The `.dark` token set exists in `globals.css` only for a possible future opt-in; nothing uses it.)
- Mono: **Geist Mono** (`--font-mono`) for amounts, rates, account numbers. Always `tabular-nums`.

## Shape

- Big cards: `rounded-4xl` (2rem). Buttons: `rounded-full`. Small tiles: `rounded-2xl`.
- Separate with background tone, not borders and shadows together. Shadows only on the hero mock card (`shadow-sm`).

## Voice

Direct, plain, confident. Second person. Short sentences. Say what happens ("Cash lands in your bank in under a minute"), never how to click. Naira is written `₦` with the amount in mono. "NEAR" is the token, "Paya" is the product, never "PAYA".

## Gradients

Only one: the dark feature card, `linear-gradient(180deg, #0B1020 0%, #1C2440 100%)` (near-black navy). Nothing else is gradiented.
