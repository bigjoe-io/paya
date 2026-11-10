"use client";

import { ArrowDownLeft, ArrowLeftRight, Landmark, Lock, Unlock } from "lucide-react";
import { Topbar } from "@/components/app/topbar";
import { Amount, AssetIcon, Card, EmptyState, PageTitle } from "@/components/app/ui";
import { useWallet } from "@/components/app/wallet-provider";
import { activity, formatNgn, formatToken, type ActivityItem } from "@/lib/mock";
import { cn } from "@/lib/utils";

const icons: Record<ActivityItem["type"], typeof Landmark> = {
  "Cash out": Landmark,
  Stake: Lock,
  Unstake: Unlock,
  Bridge: ArrowLeftRight,
  Receive: ArrowDownLeft,
};

function groupByDay(items: ActivityItem[]) {
  const groups = new Map<string, ActivityItem[]>();
  for (const item of items) {
    const day = new Date(item.date).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  return [...groups.entries()];
}

export default function ActivityPage() {
  const { accountId, connect, connecting } = useWallet();

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-4xl px-4 pb-12 lg:px-6">
        <PageTitle>Activity</PageTitle>

        {!accountId ? (
          <div className="mt-6">
            <EmptyState
              title="No activity yet"
              body="Connect your wallet to see cash-outs, stakes and bridges tied to it."
              action={
                <button
                  type="button"
                  onClick={connect}
                  disabled={connecting}
                  className="focus-ring min-h-11 rounded-xl bg-foreground px-5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-60"
                >
                  {connecting ? "Connecting…" : "Connect wallet"}
                </button>
              }
            />
          </div>
        ) : (
          <div className="mt-6 space-y-8">
            {groupByDay(activity).map(([day, items]) => (
              <section key={day}>
                <h2 className="mb-3 text-sm text-muted-foreground">{day}</h2>
                <Card className="divide-y divide-border">
                  {items.map((item) => {
                    const Icon = icons[item.type];
                    const out = item.type === "Cash out" || item.type === "Stake";
                    return (
                      <article key={item.id} className="flex items-center gap-4 px-5 py-4">
                        <span className="relative">
                          <AssetIcon symbol={item.asset} />
                          <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-card ring-2 ring-card">
                            <Icon className="size-3" aria-hidden="true" />
                          </span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{item.type}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {item.fiat ? `${item.fiat.to}` : `${item.txHash}`} ·{" "}
                            {new Date(item.date).toLocaleTimeString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <div className="text-right">
                          <Amount className={cn("block text-sm", out ? "" : "text-success")}>
                            {out ? "−" : "+"}
                            {formatToken(item.amount, item.asset)}
                          </Amount>
                          {item.fiat && (
                            <Amount className="block text-sm text-success">
                              +{formatNgn(item.fiat.amount)}
                            </Amount>
                          )}
                          <p
                            className={cn(
                              "mt-0.5 text-xs",
                              item.status === "Completed" && "text-muted-foreground",
                              item.status === "Pending" && "text-warning",
                              item.status === "Failed" && "text-foreground",
                            )}
                          >
                            {item.status}
                          </p>
                        </div>
                      </article>
                    );
                  })}
                </Card>
              </section>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
