"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { ArrowDown, Info, Landmark, RefreshCw } from "lucide-react";
import { NearIcon } from "@/components/landing/icons";
import { useAccount } from "@/components/app/account-provider";
import { AddressCard } from "@/components/app/address-card";
import { SignInDialog } from "@/components/app/sign-in-dialog";
import { SwapProgress, useSwap } from "@/components/app/swap-progress";
import { api, ApiError, formatFiat, type Currency, type Me, type Quote, type Swap } from "@/lib/api";
import { maskAccount } from "@/lib/recipients";
import { cn } from "@/lib/utils";
import { usePersistentState } from "@/lib/persist";

/** Show an order again after a reload: anything still running, or finished in the last 30 minutes and not dismissed. */
const RESUME_MS = 30 * 60_000;


type Phase = { name: "edit" } | { name: "sending" } | { name: "tracking"; swap: Swap };

/**
 * Sell: NEAR in the user's Paya address → their linked bank.
 * Sending NEAR to the address cashes it out automatically (when auto is on);
 * the form below cashes out any balance on demand.
 */
export function SwapCard({ me, currencies }: { me: Me; currencies: Currency[] }) {
  const { setMe, refresh } = useAccount();
  const bank = me.bank!;
  const currency = currencies.find((c) => c.code === bank.currency) ?? currencies[0];
  const [amount, setAmount] = usePersistentState("sell:amount", "");
  const [dismissed, setDismissed] = usePersistentState("sell:dismissed", "");
  const [rawQuote, setQuote] = useState<Quote | null>(null);
  const [rawQuoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [phase, setPhase] = useState<Phase>({ name: "edit" });
  const [error, setError] = useState<string | null>(null);
  const [showFees, setShowFees] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const [togglingAuto, setTogglingAuto] = useState(false);
  const ids = useId();

  const near = Number(amount) || 0;
  // Checked before anything is quoted or sent: the button only enables for an amount that will go through.
  const [minNear, setMinNear] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .cashoutLimits()
        .then((l) => {
          if (!cancelled) setMinNear(l.minNear);
        })
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 120_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);
  const maxNear = Math.floor(me.spendable * 1e4) / 1e4;
  const overBalance = near > maxNear;
  const underMin = minNear !== null && near > 0 && near < minNear;
  const cantCashOut = minNear !== null && maxNear < minNear;
  const inRange = near > 0 && !overBalance && !underMin;
  const quote = near && rawQuote?.nearIn === near && rawQuote.currency === bank.currency ? rawQuote : null;
  const quoteError = near ? rawQuoteError : null;

  useEffect(() => {
    if (!inRange) return;
    let cancelled = false;
    const run = () => {
      setQuoting(true);
      api
        .quote(near, bank.currency)
        .then((q) => {
          if (!cancelled) {
            setQuote(q);
            setQuoteError(null);
          }
        })
        .catch((e: Error) => {
          if (!cancelled) {
            setQuote(null);
            setQuoteError(e.message);
          }
        })
        .finally(() => {
          if (!cancelled) setQuoting(false);
        });
    };
    const t = setTimeout(run, 400);
    const every = setInterval(run, 30_000);
    return () => {
      cancelled = true;
      clearTimeout(t);
      clearInterval(every);
    };
  }, [near, inRange, bank.currency, nonce]);

  // After a reload (or an automatic cash-out), show the latest cash-out's progress.
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      api
        .activity()
        .then(({ cashouts }) => {
          const s = cashouts[0];
          if (cancelled || !s || s.id === dismissed) return;
          const running = s.status === "awaiting_deposit" || s.status === "swapping" || s.status === "paying";
          if (running || Date.now() - Date.parse(s.updatedAt) < RESUME_MS)
            setPhase((p) => (p.name === "edit" ? { name: "tracking", swap: s } : p));
        })
        .catch(() => undefined);
    void check();
    const t = setInterval(check, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [dismissed]);

  const tracked = useSwap(phase.name === "tracking" ? phase.swap.id : null, phase.name === "tracking" ? phase.swap : null);

  async function onCashOut() {
    setError(null);
    setPhase({ name: "sending" });
    try {
      const swap = await api.cashOut(near);
      setPhase({ name: "tracking", swap });
      void refresh();
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "SIGN_IN") setSignIn(true);
      setError(err.message);
      setPhase({ name: "edit" });
    }
  }

  async function toggleAuto() {
    setTogglingAuto(true);
    setError(null);
    try {
      setMe(await api.setAuto(!me.autoCashout));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTogglingAuto(false);
    }
  }

  const cta = useMemo(() => {
    if (!me.verified) return { label: "Verify email to cash out", disabled: false, action: () => setSignIn(true) };
    if (cantCashOut) return { label: `You need at least ${minNear} NEAR to cash out`, disabled: true };
    if (!near) return { label: "Enter an amount", disabled: true };
    if (overBalance) return { label: `Max is ${maxNear} NEAR`, disabled: true };
    if (underMin) return { label: `Minimum is ${minNear} NEAR`, disabled: true };
    if (minNear === null) return { label: "Checking limits…", disabled: true };
    if (quoting && !quote) return { label: "Getting the best rate…", disabled: true };
    if (!quote) return { label: "Rate unavailable", disabled: true };
    if (phase.name === "sending") return { label: "Sending…", disabled: true };
    return { label: `Cash out to ${bank.currency}`, disabled: false, action: () => void onCashOut() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.verified, near, overBalance, underMin, cantCashOut, minNear, maxNear, quoting, quote, phase.name, bank.currency]);

  if (phase.name === "tracking") {
    return (
      <div className="glass-card rounded-3xl p-6">
        <SwapProgress
          swap={tracked ?? phase.swap}
          currency={currency}
          onDone={() => {
            setDismissed(phase.swap.id);
            setPhase({ name: "edit" });
            setAmount("");
          }}
        />
      </div>
    );
  }

  const locked = phase.name !== "edit";
  const bankLine = `${bank.bankName} ${maskAccount(bank.accountNumber)}`;

  return (
    <div className="glass-card rounded-3xl p-4 sm:p-6">
      <AddressCard
        address={me.address}
        note={
          me.autoCashout
            ? `Send NEAR here from any wallet or exchange. It's cashed out to ${bankLine} automatically (from ${me.autoMin} NEAR).`
            : "Send NEAR here from any wallet or exchange. It stays in your balance until you cash out."
        }
      />

      {/* auto cash-out switch */}
      <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-border bg-panel px-4 py-3">
        <span className="min-w-0">
          <span id={`${ids}-auto`} className="block text-sm font-medium">
            Auto cash-out
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {me.autoPausedUntil
              ? "Paused after a failed attempt; retrying soon"
              : me.autoCashout
                ? `Incoming NEAR → ${bankLine}`
                : "Off: NEAR stays in your balance"}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={me.autoCashout}
          aria-labelledby={`${ids}-auto`}
          disabled={togglingAuto}
          onClick={() => void toggleAuto()}
          className={cn(
            "focus-ring relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-150 disabled:opacity-60",
            me.autoCashout ? "bg-foreground" : "bg-foreground/20",
          )}
        >
          <span
            className={cn(
              "inline-block size-5 rounded-full bg-background shadow transition-transform duration-150 motion-reduce:transition-none",
              me.autoCashout ? "translate-x-6" : "translate-x-1",
            )}
          />
        </button>
      </div>

      {/* manual cash-out */}
      <div className="mt-5 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Cash out now</h2>
        <div className="flex items-center gap-2">
          {[
            { label: "Half", f: 0.5 },
            { label: "Max", f: 1 },
          ].map(({ label, f }) => (
            <button
              key={label}
              type="button"
              disabled={!me.spendable || locked}
              onClick={() => setAmount(String(Math.floor(me.spendable * f * 1e4) / 1e4))}
              className="focus-ring min-h-9 rounded-full border border-border bg-panel px-3.5 text-sm transition-colors duration-100 hover:bg-card disabled:opacity-50"
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setNonce((n) => n + 1)}
            disabled={!near || locked}
            aria-label="Refresh rate"
            className="focus-ring flex size-9 items-center justify-center rounded-full border border-border bg-panel text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("size-4", quoting && "motion-safe:animate-spin")} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-border bg-panel p-4">
        <div className="flex items-center justify-between">
          <label htmlFor={`${ids}-pay`} className="text-sm text-muted-foreground">
            You sell
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">Max {maxNear} NEAR</span>
        </div>
        <div className="mt-1 flex items-center gap-3">
          <input
            id={`${ids}-pay`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            disabled={locked}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, "");
              if (v.split(".").length <= 2) setAmount(v);
            }}
            aria-invalid={overBalance || undefined}
            className="min-w-0 flex-1 bg-transparent font-mono text-3xl font-semibold tabular-nums outline-none placeholder:text-muted-foreground/60 disabled:opacity-60 sm:text-4xl"
          />
          <span className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-medium">
            <NearIcon className="size-4" /> NEAR
          </span>
        </div>
        <p className={cn("mt-2 text-xs tabular-nums", overBalance || underMin ? "text-warning" : "text-muted-foreground")}>
          {minNear === null
            ? "Checking limits…"
            : cantCashOut
              ? `You need at least ${minNear} NEAR to cash out. ${me.reserve} NEAR always stays for network fees.`
              : `Min ${minNear} · Max ${maxNear} NEAR · ${me.reserve} NEAR stays for network fees`}
        </p>
      </div>

      <div className="relative z-10 -my-3 flex justify-center" aria-hidden="true">
        <span className="flex size-10 items-center justify-center rounded-full border border-border bg-panel">
          <ArrowDown className="size-4" />
        </span>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">You receive</p>
        <div className="mt-1 flex items-center gap-3">
          <p
            className={cn(
              "min-w-0 flex-1 truncate font-mono text-3xl font-semibold tabular-nums sm:text-4xl",
              !quote && "text-muted-foreground/60",
              quoting && quote && "opacity-60",
            )}
            aria-live="polite"
          >
            {quote ? formatFiat(quote.fiatOut, currency) : `${currency?.symbol ?? ""}0`}
          </p>
          <span className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-border bg-panel px-3 text-sm font-medium">
            {currency?.flag} {bank.currency}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <Landmark className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {bank.accountName} · {bankLine}
            </span>
          </span>
          <Link href="/app/account" className="focus-ring shrink-0 rounded font-medium underline-offset-2 hover:underline">
            Change
          </Link>
        </div>
      </div>

      <div className="mt-3 min-h-6 px-1 text-sm">
        {quote && currency ? (
          <button
            type="button"
            onClick={() => setShowFees((v) => !v)}
            aria-expanded={showFees}
            className="focus-ring inline-flex items-center gap-1.5 rounded text-muted-foreground hover:text-foreground"
          >
            <span className="font-mono tabular-nums">1 NEAR ≈ {formatFiat(quote.fiatPerNear, currency)}</span>
            <Info className="size-3.5" aria-hidden="true" />
          </button>
        ) : quoteError ? (
          <span className="text-warning">{quoteError}</span>
        ) : null}
        {showFees && quote && currency && (
          <dl className="mt-2 space-y-1 rounded-xl bg-card p-3 text-xs">
            <Row label="Swapped to" value={`${quote.usdcOut.toFixed(2)} USDC`} />
            <Row label={`Paya fee (${quote.feePercent}%)`} value={`${quote.feeUsdc.toFixed(2)} USDC`} />
            <Row label="Rate" value={`1 USDC ≈ ${formatFiat(quote.rate, currency)}`} />
            <Row label="Arrives in" value={`~${Math.ceil(quote.etaSeconds / 60)} min`} />
            {quote.priceSource === "public" && <p className="pt-1 text-muted-foreground">Indicative rate. Your final rate is locked when you cash out.</p>}
          </dl>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-warning-soft px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={cta.action}
        disabled={cta.disabled}
        className="focus-ring mt-4 min-h-14 w-full rounded-2xl bg-foreground text-base font-medium text-background transition-colors duration-100 hover:bg-foreground/90 disabled:bg-foreground/15 disabled:text-muted-foreground"
      >
        {cta.label}
      </button>

      <SignInDialog open={signIn} onClose={() => setSignIn(false)} onSignedIn={() => void refresh()} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}
