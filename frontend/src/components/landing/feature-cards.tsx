import type { ReactNode } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { CoinIcon, NearIcon } from "@/components/landing/icons";

export function FeatureCards() {
  return (
    <section id="features" className="container-page scroll-mt-20">
      <div className="grid gap-4">
        <FlowCard />
        <Card
          title={
            <>
              Cash out NEAR to naira
              <br />
              in one click
            </>
          }
          illustration={<OffRampIllustration />}
        />
        <Card
          title={
            <>
              Bridge to Solana
              <br />
              without leaving Paya
            </>
          }
          illustration={<BridgeIllustration />}
        />
        <Card
          title={
            <>
              Stake NEAR and keep
              <br />
              earning until you cash out
            </>
          }
          illustration={<StakeIllustration />}
        />
        <Card
          title={
            <>
              Non-custodial by design.
              <br />
              We never hold your money.
            </>
          }
          illustration={<CustodyIllustration />}
        />
      </div>
    </section>
  );
}

/** Dark gradient card — mirrors the reference's "grow your balance" panel. */
function FlowCard() {
  return (
    <article
      className="relative overflow-hidden rounded-4xl p-8 text-white md:min-h-128 md:p-12"
      style={{ background: "var(--gradient-dark)" }}
    >
      <FlowChart />
      <p className="relative mt-56 max-w-sm text-2xl font-medium text-pretty md:absolute md:bottom-12 md:left-12 md:mt-0 md:text-3xl">
        <span className="text-white">From your wallet</span>{" "}
        <span className="text-white/70">
          to your bank account in a single transaction
        </span>
      </p>
    </article>
  );
}

function FlowChart() {
  const steps = [
    { label: "Wallet", sub: "NEAR" },
    { label: "Paya", sub: "swap + settle" },
    { label: "Bank", sub: "₦ naira" },
  ];
  return (
    <div
      aria-hidden="true"
      className="absolute top-8 right-8 left-8 flex items-center justify-between gap-3 md:top-12 md:right-12 md:left-auto md:w-md"
    >
      {steps.map((step, i) => (
        <div key={step.label} className="flex flex-1 items-center gap-3">
          <div className="min-w-0 flex-1 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/10">
            <p className="truncate text-sm font-medium">{step.label}</p>
            <p className="truncate text-xs text-white/60">{step.sub}</p>
          </div>
          {i < steps.length - 1 && (
            <ArrowRight className="size-4 shrink-0 text-white/50" />
          )}
        </div>
      ))}
    </div>
  );
}

function Card({
  title,
  illustration,
}: {
  title: ReactNode;
  illustration: ReactNode;
}) {
  return (
    <article className="flex min-h-104 flex-col justify-between rounded-4xl bg-card p-8 md:p-12">
      <div>{illustration}</div>
      <h3 className="mt-16 text-2xl font-medium tracking-tight text-pretty md:text-3xl">
        {title}
      </h3>
    </article>
  );
}

/* Illustrations — small compositions like the reference's badge pills. */

function OffRampIllustration() {
  return (
    <div className="inline-flex items-center rounded-full bg-background p-1.5 pr-5">
      <span className="flex size-12 items-center justify-center rounded-full bg-foreground text-background">
        <NearIcon />
      </span>
      <span className="-ml-3 flex size-12 items-center justify-center rounded-full bg-success text-white ring-4 ring-background">
        <span className="text-lg font-semibold">₦</span>
      </span>
      <span className="ml-3 text-sm text-muted-foreground">1 click</span>
    </div>
  );
}

function BridgeIllustration() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-12 items-center justify-center rounded-full bg-foreground text-background">
        <NearIcon />
      </span>
      <ArrowRight className="size-5" aria-hidden="true" />
      <div className="flex">
        <CoinIcon label="SOL" className="ring-2 ring-card" />
        <CoinIcon label="USDC" className="-ml-3 ring-2 ring-card" />
        <CoinIcon label="USDT" className="-ml-3 ring-2 ring-card" />
      </div>
    </div>
  );
}

function StakeIllustration() {
  const bars = [28, 36, 44, 52, 64, 80];
  return (
    <div aria-hidden="true" className="flex h-20 items-end gap-2">
      {bars.map((h, i) => (
        <span
          key={h}
          className={`w-6 rounded-md ${i === bars.length - 1 ? "bg-accent" : "bg-background"}`}
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

function CustodyIllustration() {
  return (
    <span className="flex size-20 items-center justify-center rounded-full bg-accent-soft">
      <ShieldCheck className="size-9 text-accent" aria-hidden="true" />
    </span>
  );
}
