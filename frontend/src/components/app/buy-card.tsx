"use client";

import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { ArrowDown, Check, ChevronDown, CheckCircle2, Clock, Copy, Info, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { NearIcon } from "@/components/landing/icons";
import { useWallet } from "@/components/app/wallet-provider";
import { useSession } from "@/components/app/session-provider";
import { SignInDialog } from "@/components/app/sign-in-dialog";
import { api, ApiError, formatFiat, yoctoToNear, type Buy, type BuyQuote, type Currency } from "@/lib/api";
import { unwrapTx, wnearBalance } from "@/lib/wnear";
import { cn } from "@/lib/utils";

/** Quick amounts per currency (roughly $3, $15, $35). */
const QUICK: Record<string, number[]> = {
  NGN: [5000, 20000, 50000],
  GHS: [50, 200, 500],
  KES: [500, 2000, 5000],
  TZS: [10000, 40000, 100000],
  ZAR: [50, 250, 600],
};
/** PAJ's KYC country codes. */
const ISO: Record<string, string> = { NGN: "NG", GHS: "GH", KES: "KE", TZS: "TZ", ZAR: "ZA" };
const needsKyc = (msg: string) => /kyc|bvn|\bnin\b|verify your identity|identity verification/i.test(msg);

/** Buy NEAR with a bank transfer. Paya never holds the money or the NEAR. */
export function BuyCard({ currencies }: { currencies: Currency[] }) {
  const { accountId, ready, connecting, connect } = useWallet();
  const { signedIn } = useSession();
  const [buyable, setBuyable] = useState<{ code: string; min: number }[] | null>(null);
  const [amount, setAmount] = useState("");
  const [code, setCode] = useState("NGN");
  const [rawQuote, setQuote] = useState<BuyQuote | null>(null);
  const [rawQuoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [order, setOrder] = useState<Buy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFees, setShowFees] = useState(false);
  const [dialog, setDialog] = useState<"none" | "signin" | "kyc">("none");
  const ids = useId();

  useEffect(() => {
    api.buyCurrencies().then(setBuyable).catch(() => undefined);
  }, []);

  const currency = currencies.find((c) => c.code === code) ?? currencies[0];
  const canBuy = (c: string) => !buyable || buyable.some((b) => b.code === c);
  const min = buyable?.find((b) => b.code === code)?.min ?? 0;
  const fiat = Number(amount) || 0;
  const quote = fiat && rawQuote?.fiat === fiat && rawQuote.currency === code ? rawQuote : null;
  const quoteError = fiat ? rawQuoteError : null;

  useEffect(() => {
    if (!fiat) return;
    let cancelled = false;
    const run = () => {
      setQuoting(true);
      api
        .buyQuote(fiat, code, accountId)
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
    const t = setTimeout(run, 450);
    const every = setInterval(run, 30_000);
    return () => {
      cancelled = true;
      clearTimeout(t);
      clearInterval(every);
    };
  }, [fiat, code, accountId, signedIn, nonce]);

  async function onBuy() {
    if (!accountId || !fiat) return;
    setError(null);
    setPlacing(true);
    try {
      setOrder(await api.createBuy({ accountId, fiat, currency: code }));
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "SIGN_IN") setDialog("signin");
      else if (needsKyc(err.message)) setDialog("kyc");
      setError(err.message);
    } finally {
      setPlacing(false);
    }
  }

  const cta = useMemo(() => {
    if (!ready) return { label: "Loading wallets…", disabled: true };
    if (!accountId) return { label: connecting ? "Connecting…" : "Connect wallet", disabled: connecting, action: () => void connect() };
    if (!fiat) return { label: "Enter an amount", disabled: true };
    if (quoting && !quote) return { label: "Getting the best rate…", disabled: true };
    if (!quote) return { label: "Rate unavailable", disabled: true };
    if (!signedIn) return { label: "Verify email to buy", disabled: false, action: () => setDialog("signin") };
    if (placing) return { label: "Locking the rate…", disabled: true };
    return { label: "Buy NEAR", disabled: false, action: () => void onBuy() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, accountId, connecting, fiat, quoting, quote, signedIn, placing]);

  if (order && currency) {
    return (
      <div className="glass-card rounded-3xl p-5 sm:p-6">
        <BuyOrder
          initial={order}
          currency={currency}
          onDone={() => {
            setOrder(null);
            setAmount("");
          }}
        />
      </div>
    );
  }

  const soon = currencies.filter((c) => !canBuy(c.code));

  return (
    <div className="glass-card rounded-3xl p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {(QUICK[code] ?? []).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setAmount(String(n))}
              className="focus-ring min-h-9 rounded-full border border-border bg-panel px-3.5 font-mono text-sm tabular-nums transition-colors duration-100 hover:bg-card"
            >
              {formatFiat(n, currency ?? "₦")}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          disabled={!fiat}
          aria-label="Refresh rate"
          className="focus-ring flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-panel text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("size-4", quoting && "motion-safe:animate-spin")} aria-hidden="true" />
        </button>
      </div>

      {/* pay (fiat) */}
      <div className="mt-4 rounded-2xl border border-border bg-panel p-4">
        <label htmlFor={`${ids}-pay`} className="text-sm text-muted-foreground">
          You pay
        </label>
        <div className="mt-1 flex items-center gap-3">
          <span className="font-mono text-3xl font-semibold text-muted-foreground sm:text-4xl" aria-hidden="true">
            {currency?.symbol}
          </span>
          <input
            id={`${ids}-pay`}
            inputMode="numeric"
            autoComplete="off"
            placeholder="0"
            value={amount ? Number(amount).toLocaleString("en-US") : ""}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 9))}
            className="min-w-0 flex-1 bg-transparent font-mono text-3xl font-semibold tabular-nums outline-none placeholder:text-muted-foreground/60 sm:text-4xl"
          />
          <label className="sr-only" htmlFor={`${ids}-cur`}>
            Currency
          </label>
          <span className="relative shrink-0">
            <select
              id={`${ids}-cur`}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setAmount("");
                setError(null);
              }}
              className="focus-ring min-h-10 appearance-none rounded-full border border-border bg-card py-1.5 pr-10 pl-3 text-sm font-medium"
            >
              {currencies.map((c) => (
                <option key={c.code} value={c.code} disabled={!canBuy(c.code)}>
                  {c.flag} {c.code}
                  {!canBuy(c.code) ? " · soon" : ""}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          By bank transfer from your own {currency?.country} account
          {min ? ` · min ${formatFiat(min, currency ?? code)}` : ""}
        </p>
      </div>

      <div className="relative z-10 -my-3 flex justify-center" aria-hidden="true">
        <span className="flex size-10 items-center justify-center rounded-full border border-border bg-panel">
          <ArrowDown className="size-4" />
        </span>
      </div>

      {/* receive (NEAR) */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">You get</p>
        <div className="mt-1 flex items-center gap-3">
          <p
            className={cn(
              "min-w-0 flex-1 truncate font-mono text-3xl font-semibold tabular-nums sm:text-4xl",
              !quote && "text-muted-foreground/60",
              quoting && quote && "opacity-60",
            )}
            aria-live="polite"
          >
            {quote ? `≈ ${quote.nearOut.toFixed(4)}` : "0"}
          </p>
          <span className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-border bg-panel px-3 text-sm font-medium">
            <NearIcon className="size-4" /> NEAR
          </span>
        </div>
        <p className="mt-2 truncate text-xs text-muted-foreground">
          {accountId ? `To ${accountId.length > 28 ? `${accountId.slice(0, 12)}…${accountId.slice(-8)}` : accountId}` : "To your connected wallet"}
        </p>
      </div>

      {soon.length > 0 && (
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          Buying with {soon.map((c) => `${c.flag} ${c.code}`).join(", ")} is coming soon.
        </p>
      )}

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
            <Row label="Converted to" value={`${quote.usdc.toFixed(2)} USDC`} />
            <Row label={`Paya fee (${quote.feePercent}%)`} value={`${quote.feeUsdc.toFixed(2)} USDC`} />
            <Row label="Rate" value={`1 USDC ≈ ${formatFiat(quote.rate, currency)}`} />
            <Row label="Minimum you get" value={`${quote.nearMin.toFixed(4)} NEAR`} />
            <Row label="Arrives" value={`~${Math.ceil(quote.etaSeconds / 60)} min after your transfer`} />
            {quote.priceSource === "public" && <p className="pt-1 text-muted-foreground">Indicative rate. Your rate is locked when you buy.</p>}
          </dl>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-warning-soft px-3 py-2 text-sm">
          {error}
          {needsKyc(error) && (
            <button type="button" onClick={() => setDialog("kyc")} className="focus-ring ml-1 rounded font-medium underline underline-offset-2">
              Verify identity
            </button>
          )}
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

      <SignInDialog open={dialog === "signin"} onClose={() => setDialog((d) => (d === "signin" ? "none" : d))} />
      <KycDialog
        open={dialog === "kyc"}
        country={ISO[code] ?? "NG"}
        onClose={() => setDialog("none")}
        onDone={() => setError(null)}
      />
    </div>
  );
}

/* ---------- the order: pay → converting → delivered ---------- */

const STEPS = [
  { key: "awaiting_payment", label: "Send the transfer" },
  { key: "converting", label: "Payment received, buying NEAR" },
  { key: "delivered", label: "NEAR in your wallet" },
] as const;

function BuyOrder({ initial, currency, onDone }: { initial: Buy; currency: Currency; onDone: () => void }) {
  const [buy, setBuy] = useState(initial);
  const [marking, setMarking] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const final = ["delivered", "refunded", "expired", "failed"].includes(buy.status);

  useEffect(() => {
    if (final) return;
    const t = setInterval(() => {
      api.buy(buy.id).then(setBuy).catch(() => undefined);
      setNow(Date.now());
    }, 4000);
    return () => clearInterval(t);
  }, [buy.id, final]);

  const stepIndex = STEPS.findIndex((s) => s.key === buy.status);
  const left = Math.max(0, Date.parse(buy.deadline) - now);
  const hours = Math.floor(left / 3_600_000);
  const mins = Math.floor((left % 3_600_000) / 60_000);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Buying</p>
          <p className="mt-0.5 font-mono text-2xl font-semibold tabular-nums">≈ {buy.nearExpected.toFixed(4)} NEAR</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            for <span className="font-mono tabular-nums">{formatFiat(buy.fiatAmount, currency)}</span>
            {buy.demo && <span className="ml-2 rounded-full bg-foreground/10 px-2 py-0.5 text-xs">Simulated</span>}
          </p>
        </div>
        {!final && buy.status === "awaiting_payment" && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-card px-2.5 py-1 text-xs text-muted-foreground tabular-nums">
            <Clock className="size-3.5" aria-hidden="true" />
            {hours > 0 ? `${hours}h ${mins}m` : `${mins}m`} left
          </span>
        )}
      </div>

      {buy.status === "awaiting_payment" && buy.payTo && (
        <section aria-label="Payment details" className="mt-5 rounded-2xl border border-border bg-panel p-4">
          <p className="text-sm font-medium">Transfer exactly this amount</p>
          <dl className="mt-3 divide-y divide-border text-sm">
            <CopyRow label="Amount" value={formatFiat(buy.fiatAmount, currency)} copy={String(buy.fiatAmount)} mono strong />
            <CopyRow label="Account number" value={buy.payTo.accountNumber} mono strong />
            <CopyRow label="Bank" value={buy.payTo.bank} />
            <CopyRow label="Account name" value={buy.payTo.accountName} />
          </dl>
          <p className="mt-3 flex gap-2 rounded-xl bg-card p-3 text-xs text-muted-foreground text-pretty">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Send from a bank account in your own name, in one transfer, before the timer runs out. This account is for this order only.
          </p>
        </section>
      )}

      {/* progress */}
      {buy.status !== "expired" && buy.status !== "failed" && buy.status !== "refunded" && (
        <ol className="mt-5 space-y-3">
          {STEPS.map((s, i) => {
            const done = i < stepIndex || buy.status === "delivered";
            const current = i === stepIndex && buy.status !== "delivered";
            return (
              <li key={s.key} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border",
                    done ? "border-foreground bg-foreground text-background" : current ? "border-foreground" : "border-border text-muted-foreground",
                  )}
                >
                  {done ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : current ? (
                    <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
                  ) : (
                    <span className="text-[10px]">{i + 1}</span>
                  )}
                </span>
                <span className={cn(!done && !current && "text-muted-foreground")}>{s.label}</span>
              </li>
            );
          })}
        </ol>
      )}

      {(buy.status === "expired" || buy.status === "failed" || buy.status === "refunded") && (
        <p role="alert" className="mt-5 flex gap-2 rounded-xl bg-warning-soft p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {buy.status === "expired"
              ? "This order expired. If you already sent money, contact support with the order ID below."
              : buy.error ?? "Something went wrong with this order."}
          </span>
        </p>
      )}

      {buy.status === "delivered" && (
        <>
          <p className="mt-5 flex items-center gap-2 rounded-xl bg-success-soft p-3 text-sm">
            <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
            {buy.demo ? "Simulated: no real NEAR was sent." : "Your NEAR has arrived."}
          </p>
          {!buy.demo && <UnwrapPrompt />}
        </>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {buy.status === "awaiting_payment" && (
          <button
            type="button"
            disabled={marking}
            onClick={async () => {
              setMarking(true);
              try {
                setBuy(await api.markBuySent(buy.id));
              } finally {
                setMarking(false);
              }
            }}
            className="focus-ring min-h-12 flex-1 rounded-2xl bg-foreground px-5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-60"
          >
            {marking ? "Saving…" : "I've sent the money"}
          </button>
        )}
        {(final || buy.status === "awaiting_payment") && (
          <button
            type="button"
            onClick={onDone}
            className={cn(
              "focus-ring min-h-12 rounded-2xl px-5 text-sm font-medium",
              final ? "flex-1 bg-foreground text-background hover:bg-foreground/90" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {final ? "Done" : "Cancel"}
          </button>
        )}
      </div>
      <p className="mt-3 text-center font-mono text-xs text-muted-foreground">Order {buy.id}</p>
    </div>
  );
}

/** If the NEAR arrived as wNEAR, offer to unwrap it. */
function UnwrapPrompt() {
  const { accountId, signAndSend, refreshBalance } = useWallet();
  const [yocto, setYocto] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "signing" | "done" | "error">("idle");

  const load = useCallback(() => {
    if (accountId) wnearBalance(accountId).then(setYocto).catch(() => undefined);
  }, [accountId]);
  useEffect(load, [load]);

  const amount = yocto ? yoctoToNear(yocto) : 0;
  if (!yocto || amount < 0.001 || state === "done") return null;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
      <span className="text-pretty">
        <span className="font-mono tabular-nums">{amount.toFixed(4)} wNEAR</span>{" "}
        <span className="text-muted-foreground">(wrapped NEAR, same value)</span>
      </span>
      <button
        type="button"
        disabled={state === "signing"}
        onClick={async () => {
          setState("signing");
          try {
            await signAndSend(unwrapTx(yocto));
            setState("done");
            void refreshBalance();
          } catch {
            setState("error");
          }
        }}
        className="focus-ring min-h-10 rounded-xl bg-foreground px-4 font-medium text-background hover:bg-foreground/90 disabled:opacity-60"
      >
        {state === "signing" ? "Confirm in wallet…" : state === "error" ? "Try again" : "Unwrap to NEAR"}
      </button>
    </div>
  );
}

/* ---------- KYC (PAJ asks for BVN or NIN before a first purchase) ---------- */

function KycDialog({ open, country, onClose, onDone }: { open: boolean; country: string; onClose: () => void; onDone: () => void }) {
  const [idType, setIdType] = useState<"BVN" | "NIN">("BVN");
  const [idNumber, setIdNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ids = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.submitKyc(idType, idNumber, country);
      setMsg({ ok: true, text: r.message || "Verified. You can buy now." });
      onDone();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby={`${ids}-t`} className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-border bg-panel p-6 shadow-xl">
        <h2 id={`${ids}-t`} className="text-lg font-semibold tracking-tight">
          Verify your identity
        </h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Required by our payment partner before your first purchase. Your number goes straight to them; Paya doesn&apos;t store it.
        </p>
        <div role="radiogroup" aria-label="ID type" className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-card p-1">
          {(["BVN", "NIN"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={idType === t}
              onClick={() => setIdType(t)}
              className={cn("focus-ring min-h-10 rounded-lg text-sm font-medium", idType === t ? "bg-panel shadow-sm" : "text-muted-foreground")}
            >
              {t}
            </button>
          ))}
        </div>
        <label htmlFor={`${ids}-n`} className="mt-4 block text-sm font-medium">
          {idType} number
        </label>
        <input
          id={`${ids}-n`}
          required
          inputMode="numeric"
          autoComplete="off"
          value={idNumber}
          onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
          placeholder="11 digits"
          className="focus-ring mt-1.5 min-h-11 w-full rounded-xl border border-border bg-panel px-3 font-mono text-base tabular-nums placeholder:font-sans placeholder:text-muted-foreground"
        />
        {msg && (
          <p role="alert" className={cn("mt-3 text-sm", msg.ok ? "text-success" : "text-warning")}>
            {msg.text}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          {msg?.ok ? (
            <button type="button" onClick={onClose} className="focus-ring min-h-11 flex-1 rounded-xl bg-foreground text-sm font-medium text-background">
              Continue
            </button>
          ) : (
            <>
              <button
                type="submit"
                disabled={busy || idNumber.length !== 11}
                className="focus-ring min-h-11 flex-1 rounded-xl bg-foreground text-sm font-medium text-background disabled:bg-foreground/15 disabled:text-muted-foreground"
              >
                {busy ? "Checking…" : "Verify"}
              </button>
              <button type="button" onClick={onClose} className="focus-ring min-h-11 rounded-xl px-4 text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

/* ---------- bits ---------- */

function CopyRow({ label, value, copy, mono, strong }: { label: string; value: string; copy?: string; mono?: boolean; strong?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1">
        <span className={cn("truncate", mono && "font-mono tabular-nums", strong && "text-base font-semibold")}>{value}</span>
        <button
          type="button"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={() => {
            void navigator.clipboard?.writeText(copy ?? value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="focus-ring -my-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-card hover:text-foreground"
        >
          {copied ? <Check className="size-4 text-success" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        </button>
      </dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-mono tabular-nums">{value}</dd>
    </div>
  );
}
