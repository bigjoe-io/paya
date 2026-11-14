"use client";

import { useEffect, useId, useState } from "react";
import { ArrowUpDown, CheckCircle2, ChevronDown, Loader2, TriangleAlert } from "lucide-react";
import { api, type Holding, type SwapToken, type TokenSwapQuote, type TokenSwapStatus } from "@/lib/api";
import { TokenAvatar, TokenPicker, fmtUsd, tokenLabel } from "@/components/app/tokens";
import { cn } from "@/lib/utils";

const USDC = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

type Phase =
  | { name: "idle" }
  | { name: "swapping" }
  | { name: "processing"; depositAddress: string; amountOut: number; to: SwapToken }
  | { name: "done"; amountOut: number; to: SwapToken }
  | { name: "refunded" | "failed" };

/** Where a swap runs: the user's Paya account (default) or a connected wallet that signs itself. */
export type SwapEngine = {
  quote: (from: string, to: string, amount: number) => Promise<TokenSwapQuote>;
  start: (from: string, to: string, amount: number) => Promise<{ depositAddress: string; amountOut: number }>;
  status: (depositAddress: string) => Promise<TokenSwapStatus>;
  /** Shown under "You get". */
  destination: string;
  /** Label while the swap is being sent (e.g. "Approve in your wallet…"). */
  sending?: string;
};

export const accountEngine: SwapEngine = {
  quote: (f, t, a) => api.tokenSwapQuote(f, t, a),
  start: (f, t, a) => api.tokenSwap({ from: f, to: t, amount: a }),
  status: (d) => api.tokenSwapStatus(d),
  destination: "Stays in your Paya balance",
};

/** Swap between NEAR and tokens on NEAR (e.g. USDC). */
export function TokenSwapCard({
  holdings,
  onChanged,
  engine = accountEngine,
}: {
  holdings: Holding[];
  onChanged: () => void;
  engine?: SwapEngine;
}) {
  const ids = useId();
  const [tokens, setTokens] = useState<SwapToken[] | null>(null);
  const [fromId, setFromId] = useState("near");
  const [toId, setToId] = useState(USDC);
  const [amount, setAmount] = useState("");
  const [quoted, setQuoted] = useState<{ key: string; q: TokenSwapQuote | null; error: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<"from" | "to" | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });

  useEffect(() => {
    api.swapTokens().then(setTokens, (e: Error) => setError(e.message));
  }, []);

  const from = tokens?.find((t) => t.id === fromId);
  const to = tokens?.find((t) => t.id === toId);
  const held = holdings.find((h) => h.id === fromId);
  const value = Number(amount);

  // Live quote, debounced. A quote only counts for the exact inputs it was made for.
  const key = `${fromId}|${toId}|${value}`;
  const ready = Boolean(value > 0 && from && to);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const t = setTimeout(() => {
      engine
        .quote(fromId, toId, value)
        .then((q) => !cancelled && setQuoted({ key, q, error: null }))
        .catch((e: Error) => !cancelled && setQuoted({ key, q: null, error: e.message }));
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [key, ready, fromId, toId, value, engine]);
  const current = quoted?.key === key ? quoted : null;
  const quote = ready ? (current?.q ?? null) : null;
  const quoting = ready && !current;
  const shownError = error ?? (ready ? (current?.error ?? null) : null);

  // Follow a swap until it settles.
  useEffect(() => {
    if (phase.name !== "processing") return;
    let stop = false;
    const tick = async () => {
      try {
        const s = await engine.status(phase.depositAddress);
        if (stop) return;
        if (s.status === "done") {
          setPhase({ name: "done", amountOut: phase.amountOut, to: phase.to });
          onChanged();
          return;
        }
        if (s.status === "refunded" || s.status === "failed") {
          setPhase({ name: s.status });
          onChanged();
          return;
        }
      } catch {}
      if (!stop) setTimeout(tick, 4000);
    };
    const t = setTimeout(tick, 4000);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [phase, onChanged, engine]);

  const max = quote?.max ?? null;
  const tooMuch = max !== null && value > max + 1e-12;

  async function swap() {
    if (!from || !to || !quote) return;
    setPhase({ name: "swapping" });
    setError(null);
    try {
      const r = await engine.start(fromId, toId, value);
      setPhase({ name: "processing", depositAddress: r.depositAddress, amountOut: r.amountOut, to });
      setAmount("");
      onChanged();
    } catch (e) {
      setPhase({ name: "idle" });
      setError((e as Error).message);
    }
  }

  function setMax() {
    // Ask for a quote with the full balance; the server answers with the real maximum.
    const bal = held?.amount ?? 0;
    if (!from || bal <= 0) return;
    engine
      .quote(fromId, toId, bal)
      .then((q) => setAmount(String(Math.floor(q.max * 1e6) / 1e6)))
      .catch((e: Error) => setError(e.message));
  }

  if (phase.name === "processing" || phase.name === "done" || phase.name === "refunded" || phase.name === "failed") {
    const done = phase.name === "done";
    return (
      <section className="glass-card rounded-3xl p-6 text-center" aria-live="polite">
        {phase.name === "processing" ? (
          <Loader2 className="mx-auto size-8 text-muted-foreground motion-safe:animate-spin" aria-hidden="true" />
        ) : done ? (
          <CheckCircle2 className="mx-auto size-8 text-success" aria-hidden="true" />
        ) : (
          <TriangleAlert className="mx-auto size-8 text-warning" aria-hidden="true" />
        )}
        <h2 className="mt-3 text-lg font-semibold tracking-tight">
          {phase.name === "processing"
            ? "Swapping…"
            : done
              ? "Swap complete"
              : phase.name === "refunded"
                ? "Swap refunded"
                : "Swap didn't go through"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          {phase.name === "processing"
            ? `About ${phase.amountOut.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${tokenLabel(phase.to)} is on its way to your ${engine === accountEngine ? "balance" : "wallet"}. Usually under a minute.`
            : done
              ? `${phase.amountOut.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${tokenLabel(phase.to)} is in your ${engine === accountEngine ? "balance" : "wallet"}.`
              : `Nothing was lost: the tokens went back to ${engine === accountEngine ? "your balance" : "your wallet"}.`}
        </p>
        {phase.name !== "processing" ? (
          <button
            type="button"
            onClick={() => setPhase({ name: "idle" })}
            className="focus-ring mt-6 min-h-12 w-full rounded-2xl bg-foreground font-medium text-background hover:bg-foreground/90"
          >
            {done ? "Done" : "Try again"}
          </button>
        ) : null}
      </section>
    );
  }

  const label = !from || !to
    ? "Loading…"
    : phase.name === "swapping"
      ? (engine.sending ?? "Swapping…")
      : !value
        ? "Enter an amount"
        : tooMuch
          ? `Not enough ${tokenLabel(from)}`
          : quoting || !quote
            ? "Getting the best price…"
            : `Swap ${tokenLabel(from)} for ${tokenLabel(to)}`;

  const tokenButton = (t: SwapToken | undefined, side: "from" | "to") => (
    <button
      type="button"
      onClick={() => setPicker(side)}
      disabled={!tokens}
      className="focus-ring inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1 text-sm font-medium hover:bg-panel"
      aria-label={`${side === "from" ? "Swap from" : "Swap to"}: ${t ? tokenLabel(t) : "choose token"}`}
    >
      {t ? <TokenAvatar token={t} size={28} /> : <span className="size-7 rounded-full bg-panel" />}
      {t ? tokenLabel(t) : "Select"}
      <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
    </button>
  );

  return (
    <section className="glass-card rounded-3xl p-4 sm:p-6">
      <div className="rounded-2xl border border-border bg-panel p-4">
        <div className="flex items-center justify-between">
          <label htmlFor={`${ids}-in`} className="text-sm text-muted-foreground">
            You swap
          </label>
          <button
            type="button"
            onClick={setMax}
            disabled={!held || held.amount <= 0}
            className="focus-ring min-h-8 rounded-full border border-border px-3 text-xs font-medium hover:bg-card disabled:opacity-40"
          >
            Max
          </button>
        </div>
        <div className="mt-1 flex items-center gap-3">
          <input
            id={`${ids}-in`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            onChange={(e) => { setError(null); setAmount(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 18)); }}
            className="min-w-0 flex-1 bg-transparent font-mono text-3xl font-semibold tabular-nums outline-none placeholder:text-muted-foreground/60 sm:text-4xl"
          />
          {tokenButton(from, "from")}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Balance {held ? held.amount.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "0"} {from ? tokenLabel(from) : ""}
          {quote?.amountInUsd ? ` · ${fmtUsd(quote.amountInUsd)}` : ""}
        </p>
      </div>

      <div className="relative z-10 -my-3 flex justify-center">
        <button
          type="button"
          onClick={() => {
            setFromId(toId);
            setToId(fromId);
            setAmount("");
          }}
          aria-label="Switch tokens"
          className="focus-ring flex size-10 items-center justify-center rounded-full border border-border bg-panel hover:bg-card"
        >
          <ArrowUpDown className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">You get</p>
        <div className="mt-1 flex items-center gap-3">
          <p
            className={cn(
              "min-w-0 flex-1 truncate font-mono text-3xl font-semibold tabular-nums sm:text-4xl",
              !quote && "text-muted-foreground/60",
            )}
            aria-live="polite"
          >
            {quote ? `≈ ${quote.amountOut.toLocaleString("en-US", { maximumFractionDigits: 6 })}` : "0"}
          </p>
          {tokenButton(to, "to")}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {engine.destination}
          {quote?.amountOutUsd ? ` · ${fmtUsd(quote.amountOutUsd)}` : ""}
        </p>
      </div>

      {quote && from && to ? (
        <dl className="mt-4 space-y-1.5 px-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Rate</dt>
            <dd className="font-mono">
              1 {tokenLabel(from)} ≈ {(quote.amountOut / quote.amountIn).toLocaleString("en-US", { maximumFractionDigits: 6 })} {tokenLabel(to)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Minimum you get</dt>
            <dd className="font-mono">
              {quote.minOut.toLocaleString("en-US", { maximumFractionDigits: 6 })} {tokenLabel(to)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Route</dt>
            <dd>NEAR Intents</dd>
          </div>
        </dl>
      ) : null}

      {shownError ? (
        <p role="alert" className="mt-4 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">
          {shownError}
        </p>
      ) : null}

      <button
        type="button"
        onClick={swap}
        disabled={!quote || quoting || tooMuch || phase.name === "swapping" || !value}
        className="focus-ring mt-4 min-h-14 w-full rounded-2xl bg-foreground text-base font-medium text-background transition-colors duration-100 hover:bg-foreground/90 disabled:bg-foreground/15 disabled:text-muted-foreground"
      >
        {label}
      </button>

      {tokens ? (
        <TokenPicker
          open={picker !== null}
          tokens={tokens}
          holdings={holdings}
          exclude={picker === "from" ? toId : fromId}
          onPick={(t) => {
            if (picker === "from") setFromId(t.id);
            else setToId(t.id);
            setAmount("");
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </section>
  );
}
