"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LogOut, ShieldCheck, Wallet } from "lucide-react";
import { Topbar } from "@/components/app/topbar";
import { Amount, PageTitle } from "@/components/app/ui";
import { HoldingsList, fmtUsd } from "@/components/app/tokens";
import { TokenSwapCard, type SwapEngine } from "@/components/app/token-swap-card";
import { useWallet } from "@/components/app/wallet-provider";
import { api, type Holding } from "@/lib/api";

const short = (a: string) => (a.length > 24 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);

/** Connect any NEAR wallet and swap tokens in it. Paya never holds the funds: the wallet signs, tokens come back to it. */
export default function WalletSwapPage() {
  const { accountId, ready, connecting, connect, disconnect, signAndSendAll } = useWallet();
  const [holdings, setHoldings] = useState<{ holdings: Holding[]; totalUsd: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!accountId) return;
    api.walletHoldings(accountId).then(setHoldings, () => {});
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [accountId, load]);

  const engine = useMemo<SwapEngine | null>(
    () =>
      accountId
        ? {
            quote: (f, t, a) => api.walletQuote(accountId, f, t, a),
            start: async (f, t, a) => {
              const r = await api.walletSwap({ account: accountId, from: f, to: t, amount: a });
              const hashes = await signAndSendAll(r.transactions);
              await api.walletSubmit(r.depositAddress, hashes[hashes.length - 1]);
              return { depositAddress: r.depositAddress, amountOut: r.amountOut };
            },
            status: (d) => api.walletSwapStatus(d),
            destination: `Sent back to ${short(accountId)}`,
            sending: "Approve in your wallet…",
          }
        : null,
    [accountId, signAndSendAll],
  );

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-xl px-4 pb-12">
        <PageTitle>Wallet swap</PageTitle>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Connect your own NEAR wallet and swap tokens in it, e.g. NEAR to USDC. Your wallet approves every swap and the tokens come
          straight back to it.
        </p>

        {!ready ? (
          <div className="glass-card mt-8 h-48 animate-pulse rounded-3xl" aria-busy="true" aria-label="Loading" />
        ) : !accountId ? (
          <section className="glass-card mt-8 rounded-3xl p-6 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-foreground text-background">
              <Wallet className="size-5" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-lg font-semibold tracking-tight">Connect a NEAR wallet</h2>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">HOT, Meteor, Nightly, MyNEAR Wallet and more. No email needed.</p>
            {error ? (
              <p role="alert" className="mt-4 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setError(null);
                connect().catch((e: Error) => setError(e.message || "Couldn't connect the wallet."));
              }}
              disabled={connecting}
              className="focus-ring mt-6 min-h-14 w-full rounded-2xl bg-foreground text-base font-medium text-background hover:bg-foreground/90 disabled:opacity-60"
            >
              {connecting ? "Connecting…" : "Connect wallet"}
            </button>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" aria-hidden="true" /> Paya never holds your funds or your keys.
            </p>
          </section>
        ) : (
          <>
            <section className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Connected wallet</p>
                <p className="truncate font-mono text-sm font-medium" title={accountId}>
                  {short(accountId)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="font-semibold">
                  <Amount>{holdings ? fmtUsd(holdings.totalUsd) : "…"}</Amount>
                </p>
              </div>
              <button
                type="button"
                onClick={() => void disconnect()}
                className="focus-ring grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-panel hover:text-foreground"
                aria-label="Disconnect wallet"
              >
                <LogOut className="size-4" aria-hidden="true" />
              </button>
            </section>

            <HoldingsList holdings={holdings?.holdings ?? null} />

            <div className="mt-6">{engine ? <TokenSwapCard holdings={holdings?.holdings ?? []} onChanged={load} engine={engine} /> : null}</div>
          </>
        )}
      </main>
    </>
  );
}
