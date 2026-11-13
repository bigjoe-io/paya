"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { NearIcon } from "@/components/landing/icons";
import { Amount } from "@/components/app/ui";
import type { Holding, SwapToken } from "@/lib/api";
import { cn } from "@/lib/utils";

const USDC_IDS = new Set(["17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"]);

/** Token logo; tokens on NEAR (everything except NEAR itself) carry a small NEAR badge bottom-right. */
export function TokenAvatar({ token, size = 40 }: { token: Pick<SwapToken, "id" | "symbol" | "icon">; size?: number }) {
  const isNear = token.id === "near";
  const src = USDC_IDS.has(token.id) ? "/tokens/usdc.svg" : token.icon;
  const badge = Math.max(14, Math.round(size * 0.42));
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      {isNear ? (
        <span className="flex size-full items-center justify-center rounded-full bg-foreground text-background">
          <NearIcon className="size-1/2" />
        </span>
      ) : src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full rounded-full bg-card object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center rounded-full bg-card text-sm font-semibold text-muted-foreground">
          {token.symbol.slice(0, 1)}
        </span>
      )}
      {!isNear ? (
        <span
          className="absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full bg-foreground text-background ring-2 ring-panel"
          style={{ width: badge, height: badge }}
        >
          <NearIcon className="size-[55%]" />
        </span>
      ) : null}
    </span>
  );
}

export const tokenLabel = (t: Pick<SwapToken, "id" | "symbol">) => (t.id === "near" ? "NEAR" : `${t.symbol}`);

const fmtAmount = (n: number) =>
  n === 0 ? "0" : n < 0.0001 ? "<0.0001" : n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 2 : 4 });
export const fmtUsd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The account's tokens, each with its own balance and value. */
export function HoldingsList({ holdings }: { holdings: Holding[] | null }) {
  if (!holdings) {
    return (
      <div className="glass-card mt-6 space-y-3 rounded-3xl p-4" aria-busy="true" aria-label="Loading tokens">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="size-10 animate-pulse rounded-full bg-card" />
            <div className="h-4 flex-1 animate-pulse rounded bg-card" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <section aria-label="Tokens" className="glass-card mt-6 rounded-3xl p-2">
      <ul>
        {holdings.map((h) => (
          <li key={h.id} className="flex items-center gap-3 rounded-2xl px-3 py-3">
            <TokenAvatar token={h} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{h.id === "near" ? "NEAR" : h.name}</p>
              <p className="text-sm text-muted-foreground">
                {fmtUsd(h.priceUsd)}
                {h.id !== "near" ? <span className="ml-1.5">· on NEAR</span> : null}
              </p>
            </div>
            <div className="text-right">
              <p className="font-medium">
                <Amount>{`${fmtAmount(h.amount)} ${tokenLabel(h)}`}</Amount>
              </p>
              <p className="text-sm text-muted-foreground">
                <Amount>{fmtUsd(h.usd)}</Amount>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Searchable token list in a dialog. */
export function TokenPicker({
  open,
  tokens,
  holdings,
  exclude,
  onPick,
  onClose,
}: {
  open: boolean;
  tokens: SwapToken[];
  holdings: Holding[];
  exclude?: string;
  onPick: (t: SwapToken) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [q, setQ] = useState("");
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const held = useMemo(() => new Map(holdings.map((h) => [h.id, h])), [holdings]);
  const list = tokens
    .filter((t) => t.id !== exclude)
    .filter((t) => !q || `${t.symbol} ${t.name}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (held.get(b.id)?.usd ?? 0) - (held.get(a.id)?.usd ?? 0));

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => {
        setQ("");
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto w-[min(100%-2rem,26rem)] rounded-3xl border border-border bg-panel p-0 text-foreground shadow-xl backdrop:bg-foreground/20 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between px-5 pt-5">
        <h2 id={titleId} className="text-lg font-semibold tracking-tight">
          Select a token
        </h2>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="focus-ring -mr-2 grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="px-5 pt-3">
        <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-border bg-card px-3">
          <Search className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search tokens</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name"
            autoComplete="off"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>
      <ul className="mt-2 max-h-[60vh] overflow-y-auto p-2">
        {list.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted-foreground">No tokens match “{q}”.</li> : null}
        {list.map((t) => {
          const h = held.get(t.id);
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(t);
                  ref.current?.close();
                }}
                className="focus-ring flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-card"
              >
                <TokenAvatar token={t} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{tokenLabel(t)}</span>
                  <span className="block truncate text-sm text-muted-foreground">{t.id === "near" ? "NEAR" : t.name}</span>
                </span>
                {h ? (
                  <span className={cn("text-right text-sm")}>
                    <Amount className="block">{fmtAmount(h.amount)}</Amount>
                    <Amount className="block text-muted-foreground">{fmtUsd(h.usd)}</Amount>
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </dialog>
  );
}
