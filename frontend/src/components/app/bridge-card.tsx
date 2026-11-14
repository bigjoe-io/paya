"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { ArrowDown, Check, CheckCircle2, ChevronDown, Copy, Loader2, TriangleAlert } from "lucide-react";
import { api, type BridgeChain, type BridgeQuote, type DepositInstructions, type Holding, type SwapToken, type WalletTx } from "@/lib/api";
import { TokenAvatar, TokenPicker, fmtUsd, tokenLabel } from "@/components/app/tokens";
import { deviceId, useSession } from "@/components/app/session-provider";
import { cn } from "@/lib/utils";

/** Who signs: the user's Paya account (email code) or a connected wallet. */
export type BridgeMode = { kind: "account" } | { kind: "wallet"; account: string; signAndSendAll: (txs: WalletTx[]) => Promise<string[]> };

type Phase =
  | { name: "form" }
  | { name: "code" }
  | { name: "deposit"; d: DepositInstructions }
  | { name: "tracking"; depositAddress: string; text: string }
  | { name: "done"; text: string }
  | { name: "refunded" | "failed" };

const field = "focus-ring min-h-11 w-full rounded-xl border border-border bg-panel px-3 text-sm outline-none";

export function BridgeCard({ mode, holdings, onChanged }: { mode: BridgeMode; holdings: Holding[]; onChanged: () => void }) {
  const ids = useId();
  const { email, startSignIn } = useSession();
  const account = mode.kind === "wallet" ? mode.account : undefined;
  const [dir, setDir] = useState<"out" | "in">("out");
  const [chains, setChains] = useState<BridgeChain[] | null>(null);
  const [tokens, setTokens] = useState<SwapToken[] | null>(null);
  const [nearId, setNearId] = useState("near");
  const [chainId, setChainId] = useState("sol");
  const [assetId, setAssetId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: "form" });
  const [copied, setCopied] = useState(false);
  const [quoted, setQuoted] = useState<{ key: string; q: BridgeQuote | null; error: string | null } | null>(null);

  useEffect(() => {
    api.bridgeChains().then(setChains, (e: Error) => setError(e.message));
    api.swapTokens().then(setTokens, () => {});
  }, []);

  const chain = chains?.find((c) => c.id === chainId);
  const ct = chain?.tokens.find((t) => t.assetId === assetId) ?? chain?.tokens.find((t) => t.symbol.startsWith("USDC")) ?? chain?.tokens[0];
  const nearToken = tokens?.find((t) => t.id === nearId);
  const value = Number(amount);
  const held = holdings.find((h) => h.id === nearId);

  // Live quote (debounced). Out needs the destination address first; In doesn't.
  const key = `${dir}|${nearId}|${ct?.assetId}|${value}|${dir === "out" ? address.trim() : ""}|${account ?? ""}`;
  const ready = Boolean(value > 0 && ct && nearToken && (dir === "in" || address.trim().length >= 20));
  useEffect(() => {
    if (!ready || !ct) return;
    let cancelled = false;
    const t = setTimeout(() => {
      const p =
        dir === "out"
          ? api.bridgeOutQuote({ from: nearId, toAsset: ct.assetId, amount: value, recipient: address.trim() }, account)
          : api.bridgeInQuote({ fromAsset: ct.assetId, to: nearId, amount: value }, account);
      p.then((q) => !cancelled && setQuoted({ key, q, error: null })).catch((e: Error) => !cancelled && setQuoted({ key, q: null, error: e.message }));
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [key, ready, ct, dir, nearId, value, address, account]);
  const current = quoted?.key === key ? quoted : null;
  const quote = ready ? (current?.q ?? null) : null;
  const quoting = ready && !current;
  const shownError = error ?? (ready ? (current?.error ?? null) : null);
  const tooMuch = dir === "out" && quote?.max != null && value > quote.max + 1e-12;

  // Follow a bridge until it settles.
  useEffect(() => {
    if (phase.name !== "tracking" && phase.name !== "deposit") return;
    const dep = phase.name === "tracking" ? phase.depositAddress : phase.d.depositAddress;
    let stop = false;
    const tick = async () => {
      try {
        const s = await api.walletSwapStatus(dep);
        if (stop) return;
        if (s.status === "done") {
          setPhase({ name: "done", text: phase.name === "tracking" ? phase.text : `${phase.d.amountOut.toFixed(4)} arrived.` });
          onChanged();
          return;
        }
        if (s.status === "refunded" || s.status === "failed") {
          setPhase({ name: s.status });
          onChanged();
          return;
        }
        if (phase.name === "deposit" && s.raw !== "PENDING_DEPOSIT" && s.raw !== "INCOMPLETE_DEPOSIT") {
          setPhase({ name: "tracking", depositAddress: dep, text: `Deposit received. Your ${tokenLabel(nearToken ?? { id: nearId, symbol: "" })} is on its way.` });
          return;
        }
      } catch {}
      if (!stop) setTimeout(tick, 6000);
    };
    const t = setTimeout(tick, 5000);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [phase, onChanged, nearToken, nearId]);

  const reset = () => {
    setPhase({ name: "form" });
    setAmount("");
    setCode("");
    setError(null);
  };

  async function review(e: FormEvent) {
    e.preventDefault();
    if (!ct || !quote) return;
    setBusy(true);
    setError(null);
    try {
      if (dir === "in") {
        const d = await api.bridgeIn({ fromAsset: ct.assetId, to: nearId, amount: value, refundAddress: address.trim() }, account);
        if (d.registration && mode.kind === "wallet") await mode.signAndSendAll([d.registration]);
        setPhase({ name: "deposit", d });
      } else if (mode.kind === "wallet") {
        const r = await api.walletBridgeOut({ account: mode.account, from: nearId, toAsset: ct.assetId, amount: value, recipient: address.trim() });
        const hashes = await mode.signAndSendAll(r.transactions);
        await api.walletSubmit(r.depositAddress, hashes[hashes.length - 1]);
        setPhase({ name: "tracking", depositAddress: r.depositAddress, text: `${r.amountOut.toFixed(4)} ${ct.symbol} is on its way to ${chain?.name}.` });
        onChanged();
      } else {
        if (!email) throw new Error("Sign in first.");
        await startSignIn(email);
        setPhase({ name: "code" });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode(e: FormEvent) {
    e.preventDefault();
    if (!ct) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.bridgeOut({ from: nearId, toAsset: ct.assetId, amount: value, recipient: address.trim(), otp: code.trim(), deviceId: deviceId() });
      setPhase({ name: "tracking", depositAddress: r.depositAddress, text: `${r.amountOut.toFixed(4)} ${ct.symbol} is on its way to ${chain?.name}.` });
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /* ---------- result screens ---------- */

  if (phase.name === "deposit") {
    const d = phase.d;
    return (
      <section className="glass-card rounded-3xl p-5 sm:p-6" aria-live="polite">
        <h2 className="text-lg font-semibold tracking-tight">Send exactly {d.amount} {d.symbol}</h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          From your {d.chain} wallet, send <strong className="text-foreground">{d.amount} {d.symbol} on {d.chain}</strong> to this address. About{" "}
          {d.amountOut.toLocaleString("en-US", { maximumFractionDigits: 4 })} {tokenLabel(nearToken ?? { id: nearId, symbol: "" })} will arrive in{" "}
          {account ? "your wallet" : "your Paya balance"}.
        </p>
        <div className="mt-4 rounded-2xl border border-border bg-panel p-4">
          <p className="text-xs text-muted-foreground">{d.chain} deposit address</p>
          <p className="mt-1 font-mono text-sm break-all">{d.depositAddress}</p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(d.depositAddress).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="focus-ring mt-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-foreground px-4 text-sm font-medium text-background"
          >
            {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            {copied ? "Copied" : "Copy address"}
          </button>
          {d.depositMemo ? <p className="mt-3 text-sm">Memo: <span className="font-mono">{d.depositMemo}</span> (required)</p> : null}
        </div>
        <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
          <li>• Only send {d.symbol} on {d.chain}. Other tokens or chains can be lost.</li>
          <li>• Send the exact amount. A different amount is refunded to your {d.chain} address.</li>
          {d.deadline ? <li>• Send before {new Date(d.deadline).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</li> : null}
        </ul>
        <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" /> Waiting for your deposit…
        </p>
        <button type="button" onClick={reset} className="focus-ring mt-5 min-h-11 w-full rounded-2xl border border-border text-sm font-medium hover:bg-card">
          Start over
        </button>
      </section>
    );
  }

  if (phase.name === "tracking" || phase.name === "done" || phase.name === "refunded" || phase.name === "failed") {
    const done = phase.name === "done";
    return (
      <section className="glass-card rounded-3xl p-6 text-center" aria-live="polite">
        {phase.name === "tracking" ? (
          <Loader2 className="mx-auto size-8 text-muted-foreground motion-safe:animate-spin" aria-hidden="true" />
        ) : done ? (
          <CheckCircle2 className="mx-auto size-8 text-success" aria-hidden="true" />
        ) : (
          <TriangleAlert className="mx-auto size-8 text-warning" aria-hidden="true" />
        )}
        <h2 className="mt-3 text-lg font-semibold tracking-tight">
          {phase.name === "tracking" ? "Bridging…" : done ? "Bridge complete" : phase.name === "refunded" ? "Bridge refunded" : "Bridge didn't go through"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          {phase.name === "tracking" || done ? phase.text : "Nothing was lost: the funds went back to where they came from."}
        </p>
        {phase.name !== "tracking" ? (
          <button type="button" onClick={reset} className="focus-ring mt-6 min-h-12 w-full rounded-2xl bg-foreground font-medium text-background">
            {done ? "Done" : "Try again"}
          </button>
        ) : null}
      </section>
    );
  }

  /* ---------- form ---------- */

  const nearSide = (
    <div className={cn("rounded-2xl border border-border p-4", dir === "out" ? "bg-panel" : "bg-card")}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{dir === "out" ? "You send (on NEAR)" : "You get (on NEAR)"}</p>
        {dir === "out" ? (
          <button
            type="button"
            disabled={!held || held.amount <= 0 || quote?.max == null}
            onClick={() => quote?.max != null && setAmount(String(Math.floor(quote.max * 1e6) / 1e6))}
            className="focus-ring min-h-8 rounded-full border border-border px-3 text-xs font-medium hover:bg-card disabled:opacity-40"
          >
            Max
          </button>
        ) : null}
      </div>
      <div className="mt-1 flex items-center gap-3">
        {dir === "out" ? (
          <input
            id={`${ids}-amt`}
            aria-label="Amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            onChange={(e) => {
              setError(null);
              setAmount(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 18));
            }}
            className="min-w-0 flex-1 bg-transparent font-mono text-3xl font-semibold tabular-nums outline-none placeholder:text-muted-foreground/60"
          />
        ) : (
          <p className={cn("min-w-0 flex-1 truncate font-mono text-3xl font-semibold tabular-nums", !quote && "text-muted-foreground/60")}>
            {quote ? `≈ ${quote.amountOut.toLocaleString("en-US", { maximumFractionDigits: 6 })}` : "0"}
          </p>
        )}
        <button
          type="button"
          onClick={() => setPicker(true)}
          disabled={!tokens}
          className="focus-ring inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1 text-sm font-medium"
          aria-label={`Token on NEAR: ${nearToken ? tokenLabel(nearToken) : "choose"}`}
        >
          {nearToken ? <TokenAvatar token={nearToken} size={28} /> : <span className="size-7 rounded-full bg-panel" />}
          {nearToken ? tokenLabel(nearToken) : "Select"}
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
        </button>
      </div>
      {dir === "out" ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Balance {held ? held.amount.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "0"} {nearToken ? tokenLabel(nearToken) : ""}
          {quote?.amountInUsd ? ` · ${fmtUsd(quote.amountInUsd)}` : ""}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">{account ? "Arrives in your wallet" : "Arrives in your Paya balance"}</p>
      )}
    </div>
  );

  const otherSide = (
    <div className={cn("rounded-2xl border border-border p-4", dir === "in" ? "bg-panel" : "bg-card")}>
      <p className="text-sm text-muted-foreground">{dir === "out" ? "They get" : "You send"}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="sr-only">Chain</span>
          <select
            value={chainId}
            onChange={(e) => {
              setChainId(e.target.value);
              setAssetId(null);
            }}
            className={field}
          >
            {(chains ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Token</span>
          <select value={ct?.assetId ?? ""} onChange={(e) => setAssetId(e.target.value)} className={field}>
            {(chain?.tokens ?? []).map((t) => (
              <option key={t.assetId} value={t.assetId}>
                {t.symbol}
              </option>
            ))}
          </select>
        </label>
      </div>
      {dir === "out" ? (
        <p className={cn("mt-3 font-mono text-3xl font-semibold tabular-nums", !quote && "text-muted-foreground/60")} aria-live="polite">
          {quote ? `≈ ${quote.amountOut.toLocaleString("en-US", { maximumFractionDigits: 6 })}` : "0"}
          <span className="ml-2 text-base font-medium text-muted-foreground">{ct?.symbol}</span>
        </p>
      ) : (
        <input
          aria-label="Amount you send"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={amount}
          onChange={(e) => {
            setError(null);
            setAmount(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 18));
          }}
          className="mt-3 w-full bg-transparent font-mono text-3xl font-semibold tabular-nums outline-none placeholder:text-muted-foreground/60"
        />
      )}
      <label className="mt-3 block">
        <span className="text-xs text-muted-foreground">
          {dir === "out" ? `Recipient address on ${chain?.name ?? "that chain"}` : `Your ${chain?.name ?? ""} address (for refunds)`}
        </span>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value.trim())}
          placeholder={chainId === "btc" ? "bc1…" : chainId === "sol" ? "Solana address" : chainId === "tron" ? "T…" : "0x…"}
          autoComplete="off"
          spellCheck={false}
          className={cn(field, "mt-1 font-mono")}
        />
      </label>
    </div>
  );

  const label = !chains
    ? "Loading…"
    : busy
      ? mode.kind === "wallet" && dir === "out"
        ? "Approve in your wallet…"
        : "Working…"
      : !value
        ? "Enter an amount"
        : address.trim().length < 20
          ? dir === "out"
            ? "Enter the recipient address"
            : "Enter your refund address"
          : tooMuch
            ? `Not enough ${nearToken ? tokenLabel(nearToken) : ""}`
            : quoting || !quote
              ? "Getting the best price…"
              : dir === "out"
                ? mode.kind === "account"
                  ? "Continue"
                  : `Bridge to ${chain?.name}`
                : "Get deposit address";

  if (phase.name === "code") {
    return (
      <form onSubmit={confirmCode} className="glass-card rounded-3xl p-5 sm:p-6">
        <h2 className="text-lg font-semibold tracking-tight">Confirm with your email</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Send {value} {nearToken ? tokenLabel(nearToken) : ""} → about {quote?.amountOut.toFixed(4)} {ct?.symbol} on {chain?.name} to{" "}
          <span className="font-mono break-all">{address}</span>. We sent a code to {email}.
        </p>
        <label className="mt-4 block">
          <span className="text-sm text-muted-foreground">Code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
            inputMode="numeric"
            autoComplete="one-time-code"
            className={cn(field, "mt-1 font-mono text-lg tracking-widest")}
          />
        </label>
        {error ? (
          <p role="alert" className="mt-4 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy || code.length < 4} className="focus-ring mt-4 min-h-14 w-full rounded-2xl bg-foreground font-medium text-background disabled:bg-foreground/15 disabled:text-muted-foreground">
          {busy ? "Sending…" : "Confirm and bridge"}
        </button>
        <button type="button" onClick={() => setPhase({ name: "form" })} className="focus-ring mt-2 min-h-11 w-full rounded-2xl text-sm text-muted-foreground hover:text-foreground">
          Back
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={review} className="glass-card rounded-3xl p-4 sm:p-6">
      <div role="tablist" aria-label="Direction" className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-card p-1 text-sm font-medium">
        {(["out", "in"] as const).map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={dir === d}
            onClick={() => {
              setDir(d);
              setAddress("");
              setAmount("");
              setError(null);
            }}
            className={cn("focus-ring min-h-10 rounded-lg", dir === d ? "bg-panel shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {d === "out" ? "Send to another chain" : "Receive from another chain"}
          </button>
        ))}
      </div>

      {dir === "out" ? nearSide : otherSide}
      <div className="relative z-10 -my-3 flex justify-center" aria-hidden="true">
        <span className="flex size-10 items-center justify-center rounded-full border border-border bg-panel">
          <ArrowDown className="size-4" />
        </span>
      </div>
      {dir === "out" ? otherSide : nearSide}

      {quote ? (
        <dl className="mt-4 space-y-1.5 px-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Minimum received</dt>
            <dd className="font-mono">
              {quote.minOut.toLocaleString("en-US", { maximumFractionDigits: 6 })} {dir === "out" ? ct?.symbol : nearToken ? tokenLabel(nearToken) : ""}
            </dd>
          </div>
          {quote.etaSeconds ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Time</dt>
              <dd>about {Math.max(1, Math.round(quote.etaSeconds / 60))} min</dd>
            </div>
          ) : null}
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
        type="submit"
        disabled={!quote || quoting || tooMuch || busy || !value || address.trim().length < 20}
        className="focus-ring mt-4 min-h-14 w-full rounded-2xl bg-foreground text-base font-medium text-background transition-colors duration-100 hover:bg-foreground/90 disabled:bg-foreground/15 disabled:text-muted-foreground"
      >
        {label}
      </button>

      {tokens ? (
        <TokenPicker open={picker} tokens={tokens} holdings={holdings} onPick={(t) => setNearId(t.id)} onClose={() => setPicker(false)} />
      ) : null}
    </form>
  );
}
