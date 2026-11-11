"use client";

import { useEffect, useState } from "react";
import { ArrowDownLeft, Check, Landmark } from "lucide-react";
import { Topbar } from "@/components/app/topbar";
import { Amount, EmptyState, PageTitle } from "@/components/app/ui";
import { useWallet } from "@/components/app/wallet-provider";
import { api, formatFiat, type Buy, type Currency, type Swap } from "@/lib/api";
import { cn } from "@/lib/utils";

const LABEL: Record<Swap["status"], string> = {
  awaiting_deposit: "Waiting for wallet",
  swapping: "Swapping",
  paying: "Paying out",
  paid: "Paid",
  refunded: "Refunded",
  expired: "Expired",
  failed: "Failed",
};

const BUY_LABEL: Record<Buy["status"], string> = {
  awaiting_payment: "Awaiting transfer",
  converting: "Buying NEAR",
  delivered: "Received",
  refunded: "Refunded",
  expired: "Expired",
  failed: "Failed",
};

type Item = { kind: "sell"; at: string; s: Swap } | { kind: "buy"; at: string; b: Buy };

export default function ActivityPage() {
  const { accountId, ready, connect } = useWallet();
  const [list, setList] = useState<Item[] | null>(null);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.currencies().then(setCurrencies).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    const load = () =>
      Promise.all([api.swaps(accountId), api.buys(accountId).catch(() => [] as Buy[])])
        .then(([sells, buys]) => {
          if (!cancelled) {
            const items: Item[] = [
              ...sells.map((s) => ({ kind: "sell" as const, at: s.createdAt, s })),
              ...buys.map((b) => ({ kind: "buy" as const, at: b.createdAt, b })),
            ].sort((a, z) => z.at.localeCompare(a.at));
            setList(items);
            setError(null);
          }
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message);
        });
    void load();
    const t = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [accountId]);

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-3xl px-4 pb-12 lg:px-6">
        <PageTitle>Activity</PageTitle>
        <p className="mt-1 text-sm text-muted-foreground">Every purchase and cash-out for your connected wallet.</p>

        <div className="mt-6">
          {!accountId ? (
            <EmptyState
              title="No wallet connected"
              body="Connect the NEAR wallet you cash out from to see its history."
              action={
                <button
                  type="button"
                  onClick={() => void connect()}
                  disabled={!ready}
                  className="focus-ring min-h-11 rounded-xl bg-foreground px-5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-60"
                >
                  Connect wallet
                </button>
              }
            />
          ) : error ? (
            <p role="alert" className="rounded-2xl bg-warning-soft p-4 text-sm">
              {error}
            </p>
          ) : list === null ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading">
              {[0, 1].map((i) => (
                <div key={i} className="glass-card h-20 animate-pulse rounded-2xl" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <EmptyState title="No activity yet" body="NEAR you buy and cash-outs to bank accounts will show up here." />
          ) : (
            <ul className="space-y-3">
              {list.map((item) => {
                if (item.kind === "buy") return <BuyRow key={item.b.id} b={item.b} cur={currencies.find((c) => c.code === item.b.currency)} />;
                const s = item.s;
                const cur = currencies.find((c) => c.code === s.currency);
                const paid = s.status === "paid";
                const bad = ["refunded", "expired", "failed"].includes(s.status);
                return (
                  <li key={s.id} className="glass-card flex items-center gap-4 rounded-2xl p-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                      <Landmark className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        <Amount className="text-base">{`${s.nearIn.toFixed(4)} NEAR`}</Amount>
                        <span className="mx-2 text-muted-foreground">→</span>
                        <Amount className={cn("text-base", paid && "text-success")}>
                          {cur ? formatFiat(s.fiatAmount, cur) : `${s.fiatAmount} ${s.currency}`}
                        </Amount>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.recipient.name} · {s.recipient.bankName} {s.recipient.account} ·{" "}
                        {new Date(s.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {s.demo && <span className="ml-1 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] text-warning">simulated</span>}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                        paid && "bg-success-soft text-success",
                        bad && "bg-warning-soft text-warning",
                        !paid && !bad && "bg-accent-soft text-accent",
                      )}
                      title={s.error ?? undefined}
                    >
                      {paid && <Check className="size-3.5" aria-hidden="true" />}
                      {LABEL[s.status]}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}

function BuyRow({ b, cur }: { b: Buy; cur?: Currency }) {
  const done = b.status === "delivered";
  const bad = ["refunded", "expired", "failed"].includes(b.status);
  return (
    <li className="glass-card flex items-center gap-4 rounded-2xl p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-panel">
        <ArrowDownLeft className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          <Amount className="text-base">{cur ? formatFiat(b.fiatAmount, cur) : `${b.fiatAmount} ${b.currency}`}</Amount>
          <span className="mx-2 text-muted-foreground">→</span>
          <Amount className={cn("text-base", done && "text-success")}>{`${b.nearExpected.toFixed(4)} NEAR`}</Amount>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          Bought by bank transfer ·{" "}
          {new Date(b.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          {b.demo && <span className="ml-1 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] text-warning">simulated</span>}
        </p>
      </div>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
          done && "bg-success-soft text-success",
          bad && "bg-warning-soft text-warning",
          !done && !bad && "bg-accent-soft text-accent",
        )}
        title={b.error ?? undefined}
      >
        {done && <Check className="size-3.5" aria-hidden="true" />}
        {BUY_LABEL[b.status]}
      </span>
    </li>
  );
}
