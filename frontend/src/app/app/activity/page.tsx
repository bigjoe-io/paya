"use client";

import { useEffect, useState } from "react";
import { ArrowDownLeft, Check, ChevronDown, Copy, ExternalLink, Landmark } from "lucide-react";
import { Topbar } from "@/components/app/topbar";
import { Amount, EmptyState, PageTitle } from "@/components/app/ui";
import { useSession } from "@/components/app/session-provider";
import { SignInDialog } from "@/components/app/sign-in-dialog";
import { api, formatFiat, type Buy, type Currency, type Swap } from "@/lib/api";
import { cn } from "@/lib/utils";

const LABEL: Record<Swap["status"], string> = {
  awaiting_deposit: "Processing",
  swapping: "Processing",
  paying: "Processing",
  paid: "Paid",
  refunded: "Refunded",
  expired: "Expired",
  failed: "Failed",
};

const BUY_LABEL: Record<Buy["status"], string> = {
  awaiting_payment: "Awaiting transfer",
  cancelled: "Cancelled",
  converting: "Processing",
  delivered: "Received",
  refunded: "Refunded",
  expired: "Expired",
  failed: "Failed",
};

type Item = { kind: "sell"; at: string; s: Swap } | { kind: "buy"; at: string; b: Buy };

export default function ActivityPage() {
  const { signedIn } = useSession();
  const [signIn, setSignIn] = useState(false);
  const [list, setList] = useState<Item[] | null>(null);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.currencies().then(setCurrencies).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const load = () =>
      api
        .activity()
        .then(({ cashouts: sells, buys }) => {
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
  }, [signedIn]);

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-3xl px-4 pb-12 lg:px-6">
        <PageTitle>Activity</PageTitle>
        <p className="mt-1 text-sm text-muted-foreground">Every purchase and cash-out on your account.</p>

        <div className="mt-6">
          {!signedIn ? (
            <EmptyState
              title="Sign in to see your activity"
              body="Purchases and cash-outs on your account show up here."
              action={
                <button
                  type="button"
                  onClick={() => setSignIn(true)}
                  className="focus-ring min-h-11 rounded-xl bg-foreground px-5 text-sm font-medium text-background hover:bg-foreground/90"
                >
                  Sign in with email
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
                  <li key={s.id} className="glass-card rounded-2xl p-4">
                    <div className="flex items-center gap-4">
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
                    </div>
                    <TxDetails ids={[["Support ID", s.supportId ?? s.id, null], ["NEAR sent (NEAR)", s.nearTx, s.nearTx ? `https://nearblocks.io/txns/${s.nearTx}` : null], ["Exchanged by", s.provider, null], ["USDC received (Solana)", s.providerTx, s.providerTx ? `https://solscan.io/tx/${s.providerTx}` : null], ["USDC to payout (Solana)", s.solanaTx, s.solanaTx ? `https://solscan.io/tx/${s.solanaTx}` : null], ["NEAR returned (NEAR)", s.refundTx, s.refundTx ? `https://nearblocks.io/txns/${s.refundTx}` : null], ["Bank reference", s.paymentReference, null]]} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <SignInDialog open={signIn} onClose={() => setSignIn(false)} />
      </main>
    </>
  );
}

function BuyRow({ b, cur }: { b: Buy; cur?: Currency }) {
  const done = b.status === "delivered";
  const bad = ["refunded", "expired", "failed", "cancelled"].includes(b.status);
  return (
    <li className="glass-card rounded-2xl p-4">
      <div className="flex items-center gap-4">
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
      </div>
      <TxDetails ids={[["Support ID", b.supportId ?? b.id, null], ["USDC from payment (Solana)", b.solanaTx, b.solanaTx ? `https://solscan.io/tx/${b.solanaTx}` : null], ["Exchanged by", b.provider, null], ["USDC to exchange (Solana)", b.providerTx, b.providerTx ? `https://solscan.io/tx/${b.providerTx}` : null], ["NEAR delivered (NEAR)", b.nearTx, b.nearTx ? `https://nearblocks.io/txns/${b.nearTx}` : null]]} />
    </li>
  );
}

type IdRow = [label: string, value: string | null | undefined, href: string | null];

/** Support ID and every transaction hash for an order, each copyable. Share the Support ID with support. */
function TxDetails({ ids }: { ids: IdRow[] }) {
  const rows = ids.filter((r): r is [string, string, string | null] => Boolean(r[1]));
  return (
    <details className="group mt-3 border-t border-border pt-2">
      <summary className="focus-ring inline-flex min-h-9 cursor-pointer list-none items-center gap-1 rounded text-xs font-medium text-muted-foreground hover:text-foreground">
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
        Details & transaction IDs
      </summary>
      <dl className="mt-1 space-y-1 text-xs">
        {rows.map(([label, value, href]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd className="flex min-w-0 items-center gap-1">
              {href ? (
                <a href={href} target="_blank" rel="noreferrer" className="focus-ring inline-flex min-w-0 items-center gap-1 rounded font-mono hover:underline" title={value}>
                  <span className="truncate">{value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value}</span>
                  <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                </a>
              ) : (
                <span className="truncate font-mono" title={value}>
                  {value}
                </span>
              )}
              <CopyId value={value} label={label} />
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function CopyId({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={() =>
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
      className="focus-ring flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-card hover:text-foreground"
    >
      {copied ? <Check className="size-3.5 text-success" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
    </button>
  );
}
