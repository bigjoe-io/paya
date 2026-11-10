import type { ReactNode } from "react";
import { ArrowDown, Landmark } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { NearIcon } from "@/components/landing/icons";

export function Hero() {
  return (
    <section className="container-page pt-16 pb-6 md:pt-24">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl lg:text-6xl">
          One click from NEAR to naira.
        </h1>
        <p className="mt-4 max-w-md text-lg text-muted-foreground text-pretty">
          Send NEAR. Cash lands in your bank account in under a minute.
        </p>
        <ButtonLink href="/app" className="mt-8">
          Open app
        </ButtonLink>
      </div>

      {/*
        Hero visual. The reference uses a full-bleed product photo here
        (phone on gravel). Drop the final render into /design and swap this
        block for <Image>. Until then, a live-looking quote card holds the space.
      */}
      <div className="mt-14 rounded-4xl bg-card p-4 md:mt-20 md:p-10">
        <div className="flex min-h-104 items-center justify-center md:min-h-128">
          <QuoteCard />
        </div>
      </div>
    </section>
  );
}

function QuoteCard() {
  return (
    <div
      role="img"
      aria-label="Paya quote: send 25 NEAR, receive 98,450 naira to a GTBank account"
      className="w-full max-w-sm rounded-3xl bg-background p-5 shadow-sm"
    >
      <Row
        label="You send"
        amount="25.00"
        unit="NEAR"
        icon={<NearIcon className="size-5" />}
      />
      <div className="my-2 flex justify-center">
        <span className="flex size-8 items-center justify-center rounded-full bg-card">
          <ArrowDown className="size-4" aria-hidden="true" />
        </span>
      </div>
      <Row
        label="You receive"
        amount="₦98,450"
        unit="NGN"
        icon={<Landmark className="size-5" aria-hidden="true" />}
        positive
      />
      <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Rate</dt>
          <dd className="font-mono tabular-nums">1 NEAR = ₦3,938</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">To</dt>
          <dd className="font-mono tabular-nums">GTBank ···· 4821</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Arrives</dt>
          <dd>Under 1 minute</dd>
        </div>
      </dl>
      <div className="mt-5 flex min-h-11 items-center justify-center rounded-full bg-primary text-[15px] font-medium text-primary-foreground">
        Cash out
      </div>
    </div>
  );
}

function Row({
  label,
  amount,
  unit,
  icon,
  positive = false,
}: {
  label: string;
  amount: string;
  unit: string;
  icon: ReactNode;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-card px-4 py-3">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`mt-0.5 font-mono text-2xl font-medium tabular-nums ${
            positive ? "text-success" : ""
          }`}
        >
          {amount}
        </p>
      </div>
      <span className="inline-flex items-center gap-2 rounded-full bg-background px-3 py-1.5 text-sm font-medium">
        {icon}
        {unit}
      </span>
    </div>
  );
}
