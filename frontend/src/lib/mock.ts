/**
 * Mock data for the dashboard until contracts, Intents and the payout API land.
 * Everything that will later come from chain/APIs is shaped here first so the
 * UI doesn't change when the real sources arrive.
 */

export type TokenSymbol = "NEAR" | "USDC" | "SOL";

export type Asset = {
  symbol: TokenSymbol;
  name: string;
  priceUsd: number;
  change24h: number; // percent
  balance: number; // token units
};

export const assets: Asset[] = [
  { symbol: "NEAR", name: "NEAR", priceUsd: 2.86, change24h: 3.4, balance: 1240 },
  { symbol: "USDC", name: "USD Coin", priceUsd: 1.0, change24h: 0.01, balance: 312.5 },
  { symbol: "SOL", name: "Solana", priceUsd: 168.2, change24h: -1.2, balance: 2.15 },
];

export const ngnPerUsd = 1370;

export type EarnProduct = {
  id: string;
  name: string;
  provider: string;
  kind: "Staking" | "Vault";
  asset: TokenSymbol;
  rate: number; // percent
  rateLabel: "APR" | "APY";
  tvlUsd: number;
  withdrawals: string;
  minDeposit: string;
  fees: string;
  rewards: string;
  how: string[];
};

export const earnProducts: EarnProduct[] = [
  {
    id: "near",
    name: "NEAR Staking",
    provider: "NEAR Protocol",
    kind: "Staking",
    asset: "NEAR",
    rate: 8.9,
    rateLabel: "APR",
    tvlUsd: 17_200_000,
    withdrawals: "~2 days",
    minDeposit: "None",
    fees: "None",
    rewards: "Auto-compounded",
    how: [
      "When you stake through Paya, your NEAR is delegated to a validator from your own wallet. Paya never holds it.",
      "You earn a dynamic APR based on your share of the validator's total stake.",
      "After you unstake, it takes about 2 days (4 epochs) before your NEAR is ready to withdraw or cash out.",
    ],
  },
  {
    id: "usdc-vault",
    name: "USDC Vault",
    provider: "Tokenized vault",
    kind: "Vault",
    asset: "USDC",
    rate: 6.4,
    rateLabel: "APY",
    tvlUsd: 3_800_000,
    withdrawals: "Instant",
    minDeposit: "$10",
    fees: "None",
    rewards: "Auto-compounded",
    how: [
      "Deposits go into an ERC-4626-style vault on NEAR that lends USDC to over-collateralised borrowers.",
      "Yield accrues to your vault shares every block.",
      "Withdraw any time; cash out straight to your bank from the same screen.",
    ],
  },
  {
    id: "sol-vault",
    name: "SOL Vault",
    provider: "Bridged via Intents",
    kind: "Vault",
    asset: "SOL",
    rate: 4.5,
    rateLabel: "APY",
    tvlUsd: 2_200_000,
    withdrawals: "Instant",
    minDeposit: "$25",
    fees: "None",
    rewards: "Auto-compounded",
    how: [
      "SOL is bridged through NEAR Intents and deposited into a liquid-staking vault.",
      "Rewards accrue to the vault token, which you can bridge back or cash out.",
      "Withdrawals settle in under a minute.",
    ],
  },
];

export type ActivityItem = {
  id: string;
  date: string; // ISO
  type: "Cash out" | "Stake" | "Unstake" | "Bridge" | "Receive";
  asset: TokenSymbol;
  amount: number;
  fiat?: { currency: "NGN"; amount: number; to: string };
  status: "Completed" | "Pending" | "Failed";
  txHash: string;
};

export const activity: ActivityItem[] = [
  {
    id: "a1",
    date: "2026-11-09T14:12:00Z",
    type: "Cash out",
    asset: "NEAR",
    amount: 25,
    fiat: { currency: "NGN", amount: 98_450, to: "GTBank ···· 4821" },
    status: "Completed",
    txHash: "9Qk2…f7Da",
  },
  {
    id: "a2",
    date: "2026-11-09T09:40:00Z",
    type: "Stake",
    asset: "NEAR",
    amount: 500,
    status: "Completed",
    txHash: "3Hx1…c0Ab",
  },
  {
    id: "a3",
    date: "2026-11-08T18:03:00Z",
    type: "Bridge",
    asset: "SOL",
    amount: 2.15,
    status: "Completed",
    txHash: "7Lm4…e9Qz",
  },
  {
    id: "a4",
    date: "2026-11-07T11:25:00Z",
    type: "Cash out",
    asset: "USDC",
    amount: 120,
    fiat: { currency: "NGN", amount: 161_300, to: "Kuda ···· 1190" },
    status: "Completed",
    txHash: "2Pq8…a1Ve",
  },
  {
    id: "a5",
    date: "2026-11-06T08:10:00Z",
    type: "Receive",
    asset: "NEAR",
    amount: 1800,
    status: "Completed",
    txHash: "5Tn6…b4Kx",
  },
];

export type Contact = {
  id: string;
  name: string;
  bank: string;
  accountMasked: string;
  lastUsed: string; // ISO
};

export const contacts: Contact[] = [
  { id: "c1", name: "Adaeze Okafor", bank: "GTBank", accountMasked: "···· 4821", lastUsed: "2026-11-09" },
  { id: "c2", name: "Joseph (me)", bank: "Kuda", accountMasked: "···· 1190", lastUsed: "2026-11-07" },
  { id: "c3", name: "Emeka Nwosu", bank: "Access Bank", accountMasked: "···· 0377", lastUsed: "2026-10-28" },
];

/** Compounded growth series for the staking chart: value of `principal` over `years`. */
export function growthSeries(principal: number, ratePct: number, years: number, points = 24) {
  const out: { t: number; v: number }[] = [];
  for (let i = 0; i <= points; i++) {
    const t = (years * i) / points;
    out.push({ t, v: principal * Math.pow(1 + ratePct / 100, t) });
  }
  return out;
}

export const formatUsd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

export const formatNgn = (n: number) =>
  "₦" + new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(n);

export const formatCompactUsd = (n: number) =>
  "$" + new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export const formatToken = (n: number, symbol: TokenSymbol) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: symbol === "USDC" ? 2 : 4 }).format(n) + " " + symbol;
