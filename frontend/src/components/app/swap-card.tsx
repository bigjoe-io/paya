"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ArrowDown, ChevronDown, Info, Plus, RefreshCw, Wallet } from "lucide-react";
import { NearIcon } from "@/components/landing/icons";
import { useWallet } from "@/components/app/wallet-provider";
import { useSession } from "@/components/app/session-provider";
import { RecipientDialog } from "@/components/app/recipient-dialog";
import { SignInDialog } from "@/components/app/sign-in-dialog";
import { SwapProgress, useSwap } from "@/components/app/swap-progress";
import { api, ApiError, formatFiat, type Currency, type Quote, type Swap } from "@/lib/api";
import { maskAccount, type Recipient } from "@/lib/recipients";
import { cn } from "@/lib/utils";

/** NEAR kept back for gas and wNEAR storage registration. */
const GAS_RESERVE = 0.05;

type Phase = { name: "edit" } | { name: "placing" } | { name: "signing"; swap: Swap } | { name: "tracking"; swap: Swap };

export function SwapCard({ currencies, onCurrency }: { currencies: Currency[]; onCurrency?: (c: Currency) => void }) {
  const { accountId, balance, ready, connecting, connect, signAndSend, refreshBalance } = useWallet();
  const { signedIn } = useSession();
  const [amount, setAmount] = useState("");
  const [code, setCode] = useState("NGN");
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [rawQuote, setQuote] = useState<Quote | null>(null);
  const [rawQuoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteNonce, setQuoteNonce] = useState(0);
  const [phase, setPhase] = useState<Phase>({ name: "edit" });
  const [error, setError] = useState<string | null>(null);
  const [showFees, setShowFees] = useState(false);
  const [dialog, setDialog] = useState<"none" | "recipient" | "signin">("none");
  const [afterSignIn, setAfterSignIn] = useState<"recipient" | null>(null);
  const ids = useId();

  const currency = currencies.find((c) => c.code === code) ?? currencies[0];
  const near = Number(amount) || 0;
  const spendable = balance === null ? null : Math.max(0, balance - GAS_RESERVE);
  const overBalance = spendable !== null && near > spendable;
  // No amount → no quote (derived, so the effect never has to clear state).
  const quote = near && rawQuote?.nearIn === near && rawQuote.currency === currency?.code ? rawQuote : null;
  const quoteError = near ? rawQuoteError : null;

  // Live quote, debounced; refreshed every 30s while the user is looking at it.
  useEffect(() => {
    if (!near || !currency) return;
    let cancelled = false;
    const run = () => {
      setQuoting(true);
      api
        .quote(near, currency.code, accountId)
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
  }, [near, currency, accountId, signedIn, quoteNonce]);

  const tracked = useSwap(phase.name === "tracking" ? phase.swap.id : null, phase.name === "tracking" ? phase.swap : null);

  function pickRecipient() {
    if (!signedIn) {
      setAfterSignIn("recipient");
      setDialog("signin");
    } else setDialog("recipient");
  }

  async function onSwap() {
    if (!accountId || !recipient || !currency || !near) return;
    setError(null);
    setPhase({ name: "placing" });
    try {
      const { swap, transaction } = await api.createSwap({
        accountId,
        near,
        currency: currency.code,
        bankId: recipient.bankId,
        bankName: recipient.bankName,
        accountNumber: recipient.accountNumber,
        accountName: recipient.accountName,
      });
      if (!transaction) {
        // Orders are simulated on the relay: skip the wallet, walk the same steps.
        await api.recordDeposit(swap.id, "simulated");
        setPhase({ name: "tracking", swap });
        return;
      }
      setPhase({ name: "signing", swap });
      const hash = await signAndSend(transaction);
      const updated = await api.recordDeposit(swap.id, hash);
      setPhase({ name: "tracking", swap: updated });
      void refreshBalance();
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "SIGN_IN") setDialog("signin");
      setError(err.message);
      setPhase({ name: "edit" });
    }
  }

  const cta = useMemo(() => {
    if (!ready) return { label: "Loading wallets…", disabled: true };
    if (!accountId) return { label: connecting ? "Connecting…" : "Connect wallet", disabled: connecting, action: () => void connect() };
    if (!near) return { label: "Enter an amount", disabled: true };
    if (overBalance) return { label: "Not enough NEAR", disabled: true };
    if (!recipient) return { label: "Add a bank account", disabled: false, action: pickRecipient };
    if (quoting && !quote) return { label: "Getting the best rate…", disabled: true };
    if (!quote) return { label: "Rate unavailable", disabled: true };
    if (phase.name === "placing") return { label: "Locking the rate…", disabled: true };
    if (phase.name === "signing") return { label: "Confirm in your wallet…", disabled: true };
    return { label: `Swap to ${currency?.code}`, disabled: false, action: () => void onSwap() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, accountId, connecting, near, overBalance, recipient, quoting, quote, phase.name, currency?.code, signedIn]);

  if (phase.name === "tracking") {
    return (
      <div className="glass-card rounded-3xl p-6">
        <SwapProgress
          swap={tracked ?? phase.swap}
          currency={currency}
          onDone={() => {
            setPhase({ name: "edit" });
            setAmount("");
          }}
        />
      </div>
    );
  }

  const locked = phase.name !== "edit";

  return (
    <div className="glass-card rounded-3xl p-4 sm:p-6">
      {/* quick amounts + refresh */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {[
            { label: "Half", f: 0.5 },
            { label: "Max", f: 1 },
          ].map(({ label, f }) => (
            <button
              key={label}
              type="button"
              disabled={!spendable || locked}
              onClick={() => setAmount(String(Math.floor((spendable ?? 0) * f * 1e4) / 1e4))}
              className="focus-ring min-h-9 rounded-full border border-border bg-panel px-3.5 text-sm transition-colors duration-100 hover:bg-card disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setQuoteNonce((n) => n + 1)}
          disabled={!near || locked}
          aria-label="Refresh rate"
          className="focus-ring flex size-9 items-center justify-center rounded-full border border-border bg-panel text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("size-4", quoting && "motion-safe:animate-spin")} aria-hidden="true" />
        </button>
      </div>

      {/* pay */}
      <div className="mt-4 rounded-2xl border border-border bg-panel p-4">
        <label htmlFor={`${ids}-pay`} className="text-sm text-muted-foreground">
          You pay
        </label>
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
            className="min-w-0 flex-1 bg-transparent font-mono text-3xl font-semibold sm:text-4xl tabular-nums outline-none placeholder:text-muted-foreground/60 disabled:opacity-60"
          />
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card py-1.5 pr-3.5 pl-1.5">
            <span className="flex size-7 items-center justify-center rounded-full bg-foreground text-background">
              <NearIcon className="size-4" />
            </span>
            <span className="text-sm font-medium">NEAR</span>
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{quote ? `≈ $${(quote.usdcOut).toFixed(2)}` : " "}</span>
          {accountId && (
            <span className={cn("inline-flex items-center gap-1", overBalance && "text-warning")}>
              <Wallet className="size-3.5" aria-hidden="true" />
              <span className="font-mono tabular-nums">{balance === null ? "…" : balance.toFixed(4)}</span> NEAR
            </span>
          )}
        </div>
      </div>

      <div className="relative z-10 -my-3 flex justify-center">
        <span className="flex size-9 items-center justify-center rounded-xl border border-border bg-panel shadow-sm">
          <ArrowDown className="size-4" aria-hidden="true" />
        </span>
      </div>

      {/* receive */}
      <div className="rounded-2xl border border-border bg-panel p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">You receive</span>
          <button
            type="button"
            onClick={pickRecipient}
            disabled={locked}
            className="focus-ring inline-flex min-h-8 max-w-[60%] items-center gap-1.5 rounded-full bg-accent-soft px-3 text-xs font-medium text-accent hover:bg-accent-soft/70 disabled:opacity-60"
          >
            {recipient ? (
              <span className="truncate">
                {recipient.accountName.split(" ")[0]} · {recipient.bankName} {maskAccount(recipient.accountNumber)}
              </span>
            ) : (
              <>
                <Plus className="size-3.5" aria-hidden="true" />
                Add bank account
              </>
            )}
          </button>
        </div>
        <div className="mt-1 flex items-center gap-3">
          <p
            className={cn(
              "min-w-0 flex-1 truncate font-mono text-3xl font-semibold tabular-nums sm:text-4xl",
              !quote && "text-muted-foreground/60",
              quoting && quote && "opacity-60",
            )}
            aria-live="polite"
          >
            {quote && currency ? formatFiat(quote.fiatOut, currency) : `${currency?.symbol ?? ""}0`}
          </p>
          <label className="sr-only" htmlFor={`${ids}-cur`}>
            Currency
          </label>
          <span className="relative shrink-0">
            <select
              id={`${ids}-cur`}
              value={code}
              disabled={locked}
              onChange={(e) => {
                setCode(e.target.value);
                setRecipient(null); // a recipient belongs to one country
                const c = currencies.find((x) => x.code === e.target.value);
                if (c) onCurrency?.(c);
              }}
              className="focus-ring min-h-10 appearance-none rounded-full border border-border bg-card py-1.5 pr-10 pl-3 text-sm font-medium"
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code} disabled={c.comingSoon}>
                  {c.flag} {c.code}
                  {c.comingSoon ? " · soon" : ""}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
          </span>
        </div>
      </div>

      {currencies.some((c) => c.comingSoon) && (
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          {currencies
            .filter((c) => c.comingSoon)
            .map((c) => `${c.flag} ${c.code}`)
            .join(", ")}{" "}
          fiat payouts coming soon.
        </p>
      )}

      {/* rate + fees */}
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
            {quote.priceSource === "public" && (
              <p className="pt-1 text-muted-foreground">Indicative rate. Your final rate is locked when you swap.</p>
            )}
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

      {currency && (
        <RecipientDialog
          open={dialog === "recipient"}
          currency={currency}
          selectedId={recipient?.id ?? null}
          onClose={() => setDialog("none")}
          onSelect={setRecipient}
        />
      )}
      <SignInDialog
        open={dialog === "signin"}
        onClose={() => setDialog((d) => (d === "signin" ? "none" : d))}
        onSignedIn={() => {
          if (afterSignIn === "recipient") setDialog("recipient");
          setAfterSignIn(null);
        }}
      />
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
