"use client";

import { useEffect, useState } from "react";
import { Check, CheckCircle2, Copy, Loader2, RotateCcw } from "lucide-react";
import { api, formatFiat, type Currency, type Swap, type SwapStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

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
  const done = swap.status === "paid";
  const refunded = swap.status === "refunded";
  const stopped = current(swap.status) === -1;
  const running = !done && !stopped;
  const money = currency ? formatFiat(swap.fiatAmount, currency) : `${swap.fiatAmount} ${swap.currency}`;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const minutes = (now - Date.parse(swap.createdAt)) / 60_000;
  const slow = running && minutes > 10;

  return (
    <div className="text-center">
      <p className="text-sm text-muted-foreground">{done ? "Paid to" : "Cash-out to"} {swap.recipient.name}</p>
      <p className={cn("mt-1 font-mono text-4xl font-semibold tabular-nums", done && "text-success")}>{money}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {swap.recipient.bankName} {swap.recipient.account}
      </p>
      {swap.demo && (
        <span className="mt-2 inline-block rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">Demo — no funds moved</span>
      )}

      <div
        role="status"
        aria-live="polite"
        className={cn(
          "mt-6 flex flex-col items-center gap-3 rounded-2xl p-6",
          done ? "bg-success-soft" : stopped ? "bg-warning-soft" : "bg-card",
        )}
      >
        {done ? (
          <CheckCircle2 className="size-10 text-success" aria-hidden="true" />
        ) : stopped ? (
          <RotateCcw className="size-9 text-warning" aria-hidden="true" />
        ) : (
          <Loader2 className="size-10 text-foreground motion-safe:animate-spin" aria-hidden="true" />
        )}
        <p className="text-base font-medium">
          {done ? "Paid" : refunded ? "Returned to your balance" : stopped ? "Cash-out stopped" : "Processing payout"}
        </p>
        <p className="max-w-xs text-sm text-muted-foreground text-pretty">
          {done
            ? "The money is in your bank account."
            : refunded
              ? `This cash-out couldn't complete, so your ${swap.nearIn.toFixed(4)} NEAR came back to your Paya balance. You can try again.`
              : stopped
                ? (swap.error ?? "Nothing left your balance. You can try again.")
                : slow
                  ? "Taking longer than usual. If it can't go through, your NEAR comes back to your balance automatically."
                  : "Usually 2–5 minutes. You can leave this page; we'll keep going."}
        </p>
      </div>

      <SupportId id={swap.supportId ?? swap.id} />

      <button
        type="button"
        onClick={onDone}
        className={cn(
          "focus-ring mt-5 min-h-12 w-full rounded-2xl text-sm font-medium transition-colors duration-100",
          running ? "border border-border text-foreground hover:bg-card" : "bg-foreground text-background hover:bg-foreground/90",
        )}
      >
        {done ? "New cash-out" : running ? "Close" : "Try again"}
      </button>
    </div>
  );
}

/** The one thing a user needs for support: the order's ID, copyable. Details live in Activity. */
export function SupportId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        void navigator.clipboard?.writeText(id).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
      className="focus-ring mx-auto mt-4 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 font-mono text-xs text-muted-foreground hover:text-foreground"
      aria-label={`Copy support ID ${id}`}
    >
      Support ID {id}
      {copied ? <Check className="size-3.5 text-success" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
    </button>
  );
}
