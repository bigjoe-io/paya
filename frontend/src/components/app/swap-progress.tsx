"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { api, formatFiat, type Currency, type Swap, type SwapStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Order placed", detail: "Rate locked, payout reserved" },
  { label: "NEAR sent", detail: "From your wallet to NEAR Intents" },
  { label: "Swapped to USDC", detail: "Delivered on Solana" },
  { label: "Paying out", detail: "Local transfer to your recipient" },
  { label: "Paid", detail: "In the account" },
];

/** Index of the step that is in progress (all before it are done). */
function current(status: SwapStatus) {
  switch (status) {
    case "awaiting_deposit":
      return 1;
    case "swapping":
      return 2;
    case "paying":
      return 3;
    case "paid":
      return 5;
    default:
      return -1;
  }
}

export function useSwap(id: string | null, initial?: Swap | null) {
  const [swap, setSwap] = useState<Swap | null>(initial ?? null);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = () =>
      api
        .swap(id)
        .then((s) => {
          if (!cancelled) setSwap(s);
        })
        .catch(() => undefined);
    const t = setInterval(load, 3000);
    void load();
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [id]);
  return swap;
}

export function SwapProgress({
  swap,
  currency,
  onDone,
}: {
  swap: Swap;
  currency: Currency | undefined;
  onDone: () => void;
}) {
  const at = current(swap.status);
  const failed = at === -1;
  const done = swap.status === "paid";
  const money = currency ? formatFiat(swap.fiatAmount, currency) : `${swap.fiatAmount} ${swap.currency}`;

  return (
    <div>
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          {done ? "Paid to" : failed ? "Cash-out stopped" : "Paying"} {swap.recipient.name}
        </p>
        <p className={cn("mt-1 font-mono text-4xl font-semibold tabular-nums", done && "text-success")}>{money}</p>
        <p className="mt-1 font-mono text-sm text-muted-foreground tabular-nums">
          {swap.nearIn.toFixed(4)} NEAR · {swap.recipient.bankName} {swap.recipient.account}
        </p>
        {swap.demo && (
          <span className="mt-2 inline-block rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">
            Demo — no funds moved
          </span>
        )}
      </div>

      {failed ? (
        <div role="alert" className="mt-6 rounded-2xl bg-warning-soft p-4 text-sm text-foreground">
          <p className="font-medium capitalize">{swap.status}</p>
          <p className="mt-1 text-foreground/80">{swap.error ?? "Something went wrong."}</p>
        </div>
      ) : (
        <ol className="mt-6 space-y-1" aria-label="Progress">
          {STEPS.map((s, i) => {
            const isDone = i < at || done;
            const isNow = i === at && !done;
            return (
              <li key={s.label} className="flex items-start gap-3 py-2" aria-current={isNow ? "step" : undefined}>
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border",
                    isDone && "border-success bg-success text-white",
                    isNow && "border-accent text-accent",
                    !isDone && !isNow && "border-border text-muted-foreground",
                  )}
                >
                  {isDone ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : isNow ? (
                    <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
                  ) : (
                    <span className="text-[11px]">{i + 1}</span>
                  )}
                </span>
                <span>
                  <span className={cn("block text-sm font-medium", !isDone && !isNow && "text-muted-foreground")}>
                    {s.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">{s.detail}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {(swap.paymentReference || (swap.depositTx && !swap.demo)) && (
        <dl className="mt-4 space-y-1 border-t border-border pt-4 text-xs">
          {swap.paymentReference && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Bank reference</dt>
              <dd className="font-mono tabular-nums">{swap.paymentReference}</dd>
            </div>
          )}
          {swap.depositTx && !swap.demo && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">NEAR transaction</dt>
              <dd>
                <a
                  href={`https://nearblocks.io/txns/${swap.depositTx}`}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring inline-flex items-center gap-1 rounded font-mono hover:underline"
                >
                  {swap.depositTx.slice(0, 8)}…
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              </dd>
            </div>
          )}
        </dl>
      )}

      {(done || failed) && (
        <button
          type="button"
          onClick={onDone}
          className="focus-ring mt-6 min-h-12 w-full rounded-2xl bg-foreground text-sm font-medium text-background transition-colors duration-100 hover:bg-foreground/90"
        >
          {done ? "New cash-out" : "Try again"}
        </button>
      )}
    </div>
  );
}
