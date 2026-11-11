"use client";

import { useId, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { AssetIcon, Card } from "@/components/app/ui";
import { useWallet } from "@/components/app/wallet-provider";
import { assets, formatUsd, type EarnProduct } from "@/lib/mock";
import { cn } from "@/lib/utils";

type Mode = "Stake" | "Unstake";

export function StakePanel({ product }: { product: EarnProduct }) {
  const { accountId } = useWallet();
  const [mode, setMode] = useState<Mode>("Stake");
  const [value, setValue] = useState("");
  const inputId = useId();

  const asset = assets.find((a) => a.symbol === product.asset)!;
  const available = accountId ? (mode === "Stake" ? asset.balance : 500) : 0;
  const amount = Number(value) || 0;
  const tooMuch = amount > available;
  const verb = mode === "Stake" ? "Stake" : "Unstake";

  return (
    <div>
      <h2 className="text-lg font-medium">Earn</h2>

      <div role="group" aria-label="Action" className="mt-4 grid grid-cols-2 rounded-xl bg-card p-1">
        {(["Stake", "Unstake"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={cn(
              "focus-ring min-h-10 rounded-lg text-sm transition-colors duration-100",
              mode === m ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m}
          </button>
        ))}
      </div>

      <Card className="mt-3 p-5">
        <label htmlFor={inputId} className="sr-only">
          Amount in {product.asset}
        </label>
        <div className="flex items-baseline justify-center gap-2">
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ""))}
            aria-invalid={tooMuch || undefined}
            aria-describedby={`${inputId}-hint`}
            className="focus-ring w-32 bg-transparent text-center font-mono text-4xl font-semibold tabular-nums placeholder:text-muted-foreground"
          />
          <span className="text-xl text-muted-foreground">{product.asset}</span>
        </div>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          <span className="font-mono tabular-nums">{formatUsd(amount * asset.priceUsd)}</span>
        </p>

        <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
          <AssetIcon symbol={product.asset} className="size-9" />
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Available</p>
            <p id={`${inputId}-hint`} className="font-mono text-sm tabular-nums">
              {available.toLocaleString()} {product.asset}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setValue(String(available))}
            disabled={!accountId}
            className="focus-ring min-h-9 rounded-lg bg-foreground/10 px-3 text-sm transition-colors duration-100 hover:bg-foreground/15 disabled:opacity-50"
          >
            Use max
          </button>
        </div>
        {tooMuch && (
          <p role="alert" className="mt-3 text-sm text-warning">
            That&apos;s more than you have available.
          </p>
        )}
      </Card>

      {mode === "Unstake" && (
        <div className="mt-3 flex gap-3 rounded-xl bg-warning-soft p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-foreground/90">
            Unstaking takes about 2 days. You can cash out the moment it clears.
          </p>
        </div>
      )}

      <button
        type="button"
        disabled={!accountId || amount <= 0 || tooMuch}
        className="focus-ring mt-4 min-h-12 w-full rounded-xl bg-foreground text-sm font-medium text-background transition-colors duration-100 hover:bg-foreground/90 disabled:bg-foreground/20 disabled:text-muted-foreground"
      >
        {verb} {product.asset}
      </button>
      <p className="mt-2 text-center text-xs text-muted-foreground">Staking goes live after cash-out. Preview only.</p>
    </div>
  );
}
