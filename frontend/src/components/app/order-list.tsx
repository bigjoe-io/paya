"use client";

import { useEffect, useState } from "react";
import { Check, Landmark } from "lucide-react";
import { api, formatNgn, type Order, type OrderStatus } from "@/lib/api";
import { useSession } from "@/components/app/session-provider";
import { Amount, EmptyState } from "@/components/app/ui";
import { NearIcon } from "@/components/landing/icons";
import { cn } from "@/lib/utils";

const STEPS: { key: OrderStatus[]; label: string }[] = [
  { key: ["created", "forwarding"], label: "Received" },
  { key: ["swapping"], label: "Swapping" },
  { key: ["paying"], label: "Paying" },
  { key: ["paid"], label: "Paid" },
];

function stepIndex(status: OrderStatus) {
  const i = STEPS.findIndex((s) => s.key.includes(status));
  return i === -1 ? 0 : i;
}

export function useOrders(pollMs = 5000) {
  const { email } = useSession();
  const [orders, setOrders] = useState<Order[] | null>(null);
  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    const load = () =>
      api
        .orders({ email })
        .then((o) => {
          if (!cancelled) setOrders(o);
        })
        .catch(() => undefined);
    void load();
    const t = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [email, pollMs]);
  return orders;
}

export function OrderList({ limit }: { limit?: number }) {
  const orders = useOrders();
  const { me } = useSession();

  if (orders === null) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading cash-outs">
        {[0, 1].map((i) => (
          <div key={i} className="glass-card h-24 animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }
  if (orders.length === 0) {
    return (
      <EmptyState
        title="No cash-outs yet"
        body={
          me?.bank
            ? `Send NEAR to ${me.depositAccount ?? "your Paya address"} and it will show up here within seconds.`
            : "Add your bank account first, then send NEAR to your Paya address."
        }
      />
    );
  }
  const rows = limit ? orders.slice(0, limit) : orders;
  return (
    <ul className="space-y-3">
      {rows.map((o) => (
        <li key={o.id}>
          <OrderRow order={o} />
        </li>
      ))}
    </ul>
  );
}

function OrderRow({ order: o }: { order: Order }) {
  const failed = o.status === "failed" || o.status === "refunded";
  const idx = stepIndex(o.status);
  const done = o.status === "paid";
  return (
    <article className="glass-card rounded-2xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-foreground text-background">
            {done ? <Landmark className="size-4" aria-hidden="true" /> : <NearIcon className="size-5" />}
          </span>
          <div>
            <p className="font-medium">
              <Amount className="text-base">{o.nearAmount.toFixed(4)} NEAR</Amount>
              {o.ngnAmount != null && (
                <>
                  <span className="mx-2 text-muted-foreground">→</span>
                  <Amount className="text-base text-success">{formatNgn(o.ngnAmount)}</Amount>
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(o.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              {o.payoutReference && <span className="font-mono"> · {o.payoutReference}</span>}
              {o.simulated && <span className="ml-1 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] text-warning">simulated</span>}
            </p>
          </div>
        </div>
        {failed ? (
          <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">
            {o.status === "refunded" ? "Refunded" : "Failed"}
          </span>
        ) : done ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
            <Check className="size-3.5" aria-hidden="true" />
            Paid
          </span>
        ) : (
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">In progress</span>
        )}
      </div>

      {!failed && (
        <ol className="mt-4 grid grid-cols-4 gap-2" aria-label="Progress">
          {STEPS.map((s, i) => {
            const reached = i <= idx;
            const current = i === idx && !done;
            return (
              <li key={s.label} className="min-w-0">
                <span
                  className={cn(
                    "block h-1 rounded-full",
                    reached ? "bg-accent" : "bg-border",
                    current && "animate-pulse",
                  )}
                />
                <span className={cn("mt-1 block truncate text-[11px]", reached ? "text-foreground" : "text-muted-foreground")}>
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {o.error && (
        <p className="mt-3 text-xs text-warning" role="status">
          {o.error}
        </p>
      )}
    </article>
  );
}
