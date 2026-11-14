"use client";

import { useCallback, useEffect, useState } from "react";
import { Landmark, Mail, Zap } from "lucide-react";
import { Topbar } from "@/components/app/topbar";
import { SwapCard } from "@/components/app/swap-card";
import { BuyCard } from "@/components/app/buy-card";
import { TokenSwapCard } from "@/components/app/token-swap-card";
import { HoldingsList } from "@/components/app/tokens";
import { LinkBank } from "@/components/app/link-bank";
import { SignInDialog } from "@/components/app/sign-in-dialog";
import { Amount } from "@/components/app/ui";
import { useAccount } from "@/components/app/account-provider";
import { useSession } from "@/components/app/session-provider";
import { api, type Currency, type Holding } from "@/lib/api";
import { cn } from "@/lib/utils";
import { usePersistentState } from "@/lib/persist";

const TABS = [
  { id: "buy", label: "Buy", soon: false },
  { id: "sell", label: "Sell", soon: false },
  { id: "swap", label: "Swap", soon: false },
];

export default function SwapPage() {
  const { signedIn } = useSession();
  const { me, loading, error: meError, refresh } = useAccount();
  const [currencies, setCurrencies] = useState<Currency[] | null>(null);
  const [prices, setPrices] = useState<{ nearUsd: number; ngnPerUsd: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = usePersistentState<"buy" | "sell" | "swap">("tab", "sell");
  const [holdings, setHoldings] = useState<{ holdings: Holding[]; totalUsd: number } | null>(null);
  const [signIn, setSignIn] = useState(false);

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

  const loadHoldings = useCallback(() => {
    api.holdings().then(setHoldings, () => {});
  }, []);
  useEffect(() => {
    if (!signedIn || !me) return;
    loadHoldings();
    const t = setInterval(loadHoldings, 30_000);
    return () => clearInterval(t);
  }, [signedIn, me, loadHoldings]);
  const onTokensChanged = useCallback(() => {
    loadHoldings();
    void refresh();
  }, [loadHoldings, refresh]);

  // Total = every token held (NEAR, USDC on NEAR, …); falls back to NEAR alone until token prices load.
  const usd = holdings ? holdings.totalUsd : me && prices ? me.balance * prices.nearUsd : null;

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-xl px-4 pb-12">
        {/* balance of the account's own NEAR address */}
        <section className="pt-2 text-center">
          <p className="text-sm text-muted-foreground">Total balance</p>
          {me ? (
            <>
              <p className="mt-1 text-4xl font-semibold tracking-tight">
                <Amount>{usd === null ? "…" : `$${usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}</Amount>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {holdings && holdings.holdings.length > 1 ? (
                  <Amount>{`${holdings.holdings.length} tokens`}</Amount>
                ) : (
                  <Amount>{`${me.balance.toFixed(4)} NEAR`}</Amount>
                )}
                {usd !== null && prices?.ngnPerUsd ? (
                  <>
                    {" · "}
                    <Amount>{`≈ ₦${Math.floor(usd * prices.ngnPerUsd).toLocaleString("en-US")}`}</Amount>
                  </>
                ) : null}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{signedIn ? "Loading your account…" : "Sign in to see your balance."}</p>
          )}
        </section>

        {signedIn && me ? <HoldingsList holdings={holdings?.holdings ?? null} /> : null}

        {error || meError ? (
          <p role="alert" className="glass-card mt-8 rounded-3xl p-6 text-sm text-warning">
            {error ?? meError}
          </p>
        ) : !signedIn ? (
          <Welcome onStart={() => setSignIn(true)} />
        ) : loading || !me || !currencies ? (
          <div className="glass-card mt-8 h-[28rem] animate-pulse rounded-3xl" aria-busy="true" aria-label="Loading" />
        ) : !me.bank ? (
          <section className="glass-card mt-8 rounded-3xl p-6">
            <h2 className="text-lg font-semibold tracking-tight">Link your bank account</h2>
            <p className="mt-1 mb-5 text-sm text-muted-foreground text-pretty">
              This is where your NEAR is paid out. Pick your country, then your bank. We confirm the account name with the bank.
            </p>
            <LinkBank />
          </section>
        ) : (
          <>
            <div role="tablist" aria-label="Mode" className="mt-8 grid grid-cols-3 gap-1 rounded-2xl border border-border bg-card p-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  aria-disabled={t.soon || undefined}
                  tabIndex={t.soon ? -1 : 0}
                  onClick={(e) => (t.soon ? e.preventDefault() : setTab(t.id as "buy" | "sell" | "swap"))}
                  className={cn(
                    "focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors duration-100",
                    t.soon
                      ? "cursor-not-allowed text-muted-foreground"
                      : tab === t.id
                        ? "bg-panel text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                  {t.soon && (
                    <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">Soon</span>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-4">
              {tab === "buy" ? (
                <BuyCard me={me} currencies={currencies.filter((c) => !c.comingSoon)} />
              ) : tab === "swap" ? (
                <TokenSwapCard holdings={holdings?.holdings ?? []} onChanged={onTokensChanged} />
              ) : (
                <SwapCard me={me} currencies={currencies} />
              )}
            </div>
          </>
        )}

        <SignInDialog open={signIn} onClose={() => setSignIn(false)} />
      </main>
    </>
  );
}

function Welcome({ onStart }: { onStart: () => void }) {
  const steps = [
    { icon: Mail, title: "Sign in with your email", body: "Your account and your own NEAR address are created instantly." },
    { icon: Landmark, title: "Link your bank account", body: "Nigeria today, with more countries coming soon." },
    { icon: Zap, title: "Send NEAR, get paid", body: "NEAR sent to your address lands in your bank automatically." },
  ];
  return (
    <section className="glass-card mt-8 rounded-3xl p-6">
      <h2 className="text-lg font-semibold tracking-tight">NEAR to your bank, in one step</h2>
      <ol className="mt-5 space-y-4">
        {steps.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="flex gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
              <Icon className="size-4" aria-hidden="true" />
              <span className="sr-only">Step {i + 1}</span>
            </span>
            <span>
              <span className="block text-sm font-medium">{title}</span>
              <span className="block text-sm text-muted-foreground">{body}</span>
            </span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onStart}
        className="focus-ring mt-6 min-h-14 w-full rounded-2xl bg-foreground text-base font-medium text-background hover:bg-foreground/90"
      >
        Sign in with email
      </button>
      <a
        href="/app/wallet"
        className="focus-ring mt-3 flex min-h-12 w-full items-center justify-center rounded-2xl border border-border text-sm font-medium hover:bg-card"
      >
        Connect a NEAR wallet
      </a>
    </section>
  );
}
