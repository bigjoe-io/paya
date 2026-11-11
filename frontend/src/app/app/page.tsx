"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/app/topbar";
import { SwapCard } from "@/components/app/swap-card";
import { Amount } from "@/components/app/ui";
import { useWallet } from "@/components/app/wallet-provider";
import { api, type Currency } from "@/lib/api";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "buy", label: "Buy", soon: true },
  { id: "sell", label: "Sell", soon: false },
  { id: "bridge", label: "Bridge", soon: true },
];

export default function SwapPage() {
  const { accountId, balance } = useWallet();
  const [currencies, setCurrencies] = useState<Currency[] | null>(null);
  const [prices, setPrices] = useState<{ nearUsd: number; ngnPerUsd: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.currencies(), api.prices()])
      .then(([c, p]) => {
        if (cancelled) return;
        setCurrencies(c);
        setPrices(p);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const usd = balance !== null && prices ? balance * prices.nearUsd : null;

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-xl px-4 pb-12">
        {/* total balance of the connected wallet */}
        <section className="pt-2 text-center">
          <p className="text-sm text-muted-foreground">Total balance</p>
          {accountId ? (
            <>
              <p className="mt-1 text-4xl font-semibold tracking-tight">
                <Amount>{usd === null ? "…" : `$${usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}</Amount>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                <Amount>{balance === null ? "…" : `${balance.toFixed(4)} NEAR`}</Amount>
                {usd !== null && prices?.ngnPerUsd ? (
                  <>
                    {" · "}
                    <Amount>{`≈ ₦${Math.floor(usd * prices.ngnPerUsd).toLocaleString("en-US")}`}</Amount>
                  </>
                ) : null}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Connect a NEAR wallet to see your balance.</p>
          )}
        </section>

        {/* Buy / Sell / Bridge */}
        <div role="tablist" aria-label="Mode" className="mt-8 grid grid-cols-3 gap-1 rounded-2xl border border-border bg-card p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={!t.soon}
              aria-disabled={t.soon || undefined}
              tabIndex={t.soon ? -1 : 0}
              onClick={(e) => t.soon && e.preventDefault()}
              className={cn(
                "focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium",
                t.soon ? "cursor-not-allowed text-muted-foreground" : "bg-panel text-foreground shadow-sm",
              )}
            >
              {t.label}
              {t.soon && (
                <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                  Soon
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {error ? (
            <p role="alert" className="glass-card rounded-3xl p-6 text-sm text-warning">
              {error}
            </p>
          ) : currencies ? (
            <SwapCard currencies={currencies} />
          ) : (
            <div className="glass-card h-[28rem] animate-pulse rounded-3xl" aria-busy="true" aria-label="Loading" />
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground text-pretty">
          Your NEAR goes from your wallet straight into the swap. Paya never holds your funds.
        </p>
      </main>
    </>
  );
}
