"use client";

import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Topbar } from "@/components/app/topbar";
import { ConnectCard } from "@/components/app/connect-card";
import { Amount, Card, Dots, Segmented } from "@/components/app/ui";
import { useWallet } from "@/components/app/wallet-provider";
import { activity, assets, earnProducts, formatUsd } from "@/lib/mock";

const tabs = [
  { href: "/app", label: "Overview" },
  { href: "/app/crypto", label: "Crypto" },
  { href: "/app/earn", label: "Earn" },
];

export default function HomePage() {
  const { accountId } = useWallet();
  const connected = Boolean(accountId);

  const total = connected
    ? assets.reduce((sum, a) => sum + a.balance * a.priceUsd, 0)
    : 0;
  const positions = connected ? 1 : 0;

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-4xl px-4 pb-12 lg:px-6">
        <Segmented items={tabs} className="justify-center pt-4" />

        <section className="mt-10">
          <p className="text-sm text-muted-foreground">Total account value</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight">
            {connected ? <Amount>{formatUsd(total)}</Amount> : <Dots className="py-3" />}
          </p>
        </section>

        <div className="mt-8">
          <ConnectCard />
        </div>

        <Card className="mt-6 divide-y divide-border">
          <Row
            href="/app/crypto"
            title="Crypto"
            sub={`${connected ? assets.length : 0} assets`}
            value={connected ? formatUsd(total) : undefined}
          />
          <Row
            href="/app/earn"
            title="Earn"
            sub={`${positions} ${positions === 1 ? "position" : "positions"}`}
            value={connected ? formatUsd(500 * assets[0].priceUsd) : undefined}
          />
          <Row
            href="/app/activity"
            title="Activity"
            sub={`${connected ? activity.length : 0} transactions`}
          />
        </Card>

        <section className="mt-12">
          <h2 className="text-xl font-semibold tracking-tight">Explore</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <ExploreCard
              href="/app/cash-out"
              title="Cash out"
              body="Crypto to naira in one click."
              visual={<CashOutVisual />}
            />
            <ExploreCard
              href={`/app/earn/${earnProducts[0].id}`}
              title="Stake NEAR"
              body={`${earnProducts[0].rate}% APR, auto-compounded.`}
              visual={<GrowthVisual />}
            />
            <ExploreCard
              href="/app/crypto"
              title="Bridge to Solana"
              body="Move NEAR to SOL without leaving Paya."
              visual={<BridgeVisual />}
            />
          </div>
        </section>
      </main>
    </>
  );
}

function Row({
  href,
  title,
  sub,
  value,
}: {
  href: string;
  title: string;
  sub: string;
  value?: string;
}) {
  return (
    <Link
      href={href}
      className="focus-ring flex min-h-20 items-center justify-between gap-4 px-6 transition-colors duration-100 first:rounded-t-2xl last:rounded-b-2xl hover:bg-foreground/3"
    >
      <span>
        <span className="block text-base font-medium">{title}</span>
        <span className="block text-sm text-muted-foreground">{sub}</span>
      </span>
      <span className="flex items-center gap-4">
        {value ? <Amount className="text-sm">{value}</Amount> : <Dots />}
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
      </span>
    </Link>
  );
}

function ExploreCard({
  href,
  title,
  body,
  visual,
}: {
  href: string;
  title: string;
  body: string;
  visual: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="focus-ring group overflow-hidden rounded-2xl border border-border bg-card transition-colors duration-100 hover:border-foreground/20"
    >
      <div className="flex h-32 items-end justify-center overflow-hidden px-6 pt-6">{visual}</div>
      <div className="flex items-center justify-between gap-3 p-5">
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
        </div>
        <ArrowRight
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-100 group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}

/* Small decorative visuals for the Explore cards. */

function CashOutVisual() {
  return (
    <div aria-hidden="true" className="w-full rounded-t-xl border border-b-0 border-border bg-background p-3">
      <div className="h-2 w-20 rounded-full bg-foreground/15" />
      <div className="mt-3 flex items-center gap-2">
        <div className="h-2.5 flex-1 rounded-full bg-foreground/15" />
        <div className="h-2.5 w-10 rounded-full bg-success" />
      </div>
      <div className="mt-2 h-2.5 w-2/3 rounded-full bg-foreground/10" />
    </div>
  );
}

function GrowthVisual() {
  return (
    <svg aria-hidden="true" viewBox="0 0 200 80" className="h-full w-full">
      <defs>
        <linearGradient id="explore-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 70 C 60 62, 120 48, 200 8 L200 80 L0 80 Z" fill="url(#explore-fill)" />
      <path d="M0 70 C 60 62, 120 48, 200 8" fill="none" stroke="var(--accent)" strokeWidth="2" />
    </svg>
  );
}

function BridgeVisual() {
  return (
    <div aria-hidden="true" className="w-full rounded-t-xl border border-b-0 border-border bg-background p-4">
      <div className="h-2 w-24 rounded-full bg-foreground/15" />
      <div className="mt-4 flex items-center gap-2">
        <span className="size-3 rounded-full bg-foreground/60" />
        <span className="h-0.5 flex-1 rounded-full bg-accent" />
        <span className="size-3 rounded-full bg-accent" />
      </div>
    </div>
  );
}
