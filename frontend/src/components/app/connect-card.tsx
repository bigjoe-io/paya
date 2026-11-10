"use client";

import Link from "next/link";
import { ArrowRight, Landmark, Wallet } from "lucide-react";
import { useWallet } from "@/components/app/wallet-provider";
import { AssetIcon, Card } from "@/components/app/ui";

/**
 * The first card on Home. Before a wallet is connected it's the single call
 * to action; after, it becomes the cash-out shortcut.
 */
export function ConnectCard() {
  const { accountId, connect, connecting } = useWallet();

  if (!accountId) {
    return (
      <Card className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-medium">Connect your wallet to get started</h2>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex">
              <AssetIcon symbol="NEAR" className="size-8 ring-2 ring-card" />
              <AssetIcon symbol="USDC" className="-ml-2 size-8 ring-2 ring-card" />
              <AssetIcon symbol="SOL" className="-ml-2 size-8 ring-2 ring-card" />
            </div>
            <p className="text-sm text-muted-foreground">
              Paya never holds your funds. Your wallet is what gets linked to your bank account.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={connect}
          disabled={connecting}
          className="focus-ring inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-foreground px-5 text-sm font-medium text-background transition-colors duration-100 hover:bg-foreground/90 disabled:opacity-60"
        >
          <Wallet className="size-4" aria-hidden="true" />
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-5 p-6 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-lg font-medium">Cash out to your bank</h2>
        <div className="mt-3 flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-full bg-success-soft text-success">
            <Landmark className="size-4" aria-hidden="true" />
          </span>
          <p className="text-sm text-muted-foreground">
            NEAR, USDC or SOL to naira in under a minute. Escrowed until your bank confirms.
          </p>
        </div>
      </div>
      <Link
        href="/app/cash-out"
        className="focus-ring inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-foreground px-5 text-sm font-medium text-background transition-colors duration-100 hover:bg-foreground/90"
      >
        Cash out
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </Card>
  );
}
