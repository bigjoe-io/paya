"use client";

import { useId, useState, type FormEvent } from "react";
import { BadgeCheck, ExternalLink, MessageSquare, Send } from "lucide-react";
import { Topbar } from "@/components/app/topbar";
import { Amount, EmptyState, PageTitle } from "@/components/app/ui";
import { useAccount } from "@/components/app/account-provider";
import { deviceId, useSession } from "@/components/app/session-provider";
import { AddressCard } from "@/components/app/address-card";
import { LinkBank } from "@/components/app/link-bank";
import { SignInDialog } from "@/components/app/sign-in-dialog";
import { api } from "@/lib/api";
import { maskAccount } from "@/lib/recipients";
import { cn } from "@/lib/utils";
import { SUPPORT_URL } from "@/lib/links";
import { usePersistentState } from "@/lib/persist";

export default function AccountPage() {
  const { signedIn, email, signOut } = useSession();
  const { me, loading, error, setMe } = useAccount();
  const [signIn, setSignIn] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-2xl px-4 pb-12 lg:px-6">
        <PageTitle>Account</PageTitle>

        {!signedIn ? (
          <div className="mt-6">
            <EmptyState
              title="Sign in to your account"
              body="Your email, your NEAR address and your bank, all in one place."
              action={
                <button
                  type="button"
                  onClick={() => setSignIn(true)}
                  className="focus-ring min-h-11 rounded-xl bg-foreground px-5 text-sm font-medium text-background hover:bg-foreground/90"
                >
                  Sign in with email
                </button>
              }
            />
          </div>
        ) : error && !me ? (
          <p role="alert" className="mt-6 rounded-2xl bg-warning-soft p-4 text-sm">
            {error}
          </p>
        ) : loading || !me ? (
          <div className="mt-6 space-y-3" aria-busy="true" aria-label="Loading">
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass-card h-28 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {/* identity */}
            <section className="glass-card rounded-2xl p-5">
              <h2 className="text-sm text-muted-foreground">Email</h2>
              <p className="mt-1 flex items-center gap-2 font-medium">
                {email}
                {me.verified ? (
                  <BadgeCheck className="size-4 text-success" aria-label="Verified" />
                ) : (
                  <button type="button" onClick={() => setSignIn(true)} className="focus-ring rounded text-xs font-medium text-warning underline">
                    Verify again
                  </button>
                )}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">Balance</p>
              <p className="mt-0.5 text-2xl font-semibold tracking-tight">
                <Amount>{`${me.balance.toFixed(4)} NEAR`}</Amount>
              </p>
            </section>

            <AddressCard address={me.address} note="This address is yours only. Send NEAR to it from any wallet or exchange." className="glass-card" />

            {/* payout bank */}
            <section className="glass-card rounded-2xl p-5">
              <h2 className="text-sm font-medium">Payout bank</h2>
              {me.bank ? (
                <>
                  <p className="mt-2 font-medium">{me.bank.accountName}</p>
                  <p className="font-mono text-sm text-muted-foreground tabular-nums">
                    {me.bank.bankName} · {maskAccount(me.bank.accountNumber)} · {me.bank.currency}
                  </p>
                  <details className="mt-4">
                    <summary className="focus-ring inline-flex min-h-10 cursor-pointer items-center rounded-lg text-sm font-medium">
                      Change bank account
                    </summary>
                    <div className="mt-3">
                      <LinkBank label="Choose new bank account" variant="quiet" />
                    </div>
                  </details>
                </>
              ) : (
                <>
                  <p className="mt-1 mb-4 text-sm text-muted-foreground">Where your cash-outs are paid. The name is confirmed with the bank.</p>
                  <LinkBank />
                </>
              )}
            </section>

            {/* auto cash-out */}
            {me.bank && (
              <section className="glass-card flex items-center justify-between gap-4 rounded-2xl p-5">
                <span>
                  <span id="auto-label" className="block text-sm font-medium">
                    Auto cash-out
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground text-pretty">
                    {me.autoCashout
                      ? `NEAR sent to your address (from ${me.autoMin} NEAR) is paid to your bank automatically.`
                      : "NEAR sent to your address stays in your balance."}
                  </span>
                  {autoError && (
                    <span role="alert" className="mt-1 block text-sm text-warning">
                      {autoError}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={me.autoCashout}
                  aria-labelledby="auto-label"
                  disabled={autoBusy}
                  onClick={async () => {
                    setAutoBusy(true);
                    setAutoError(null);
                    try {
                      setMe(await api.setAuto(!me.autoCashout));
                    } catch (e) {
                      setAutoError((e as Error).message);
                    } finally {
                      setAutoBusy(false);
                    }
                  }}
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
              </section>
            )}

            <SendNear max={Math.max(0, Math.floor((me.balance - 0.005) * 1e4) / 1e4)} />

            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring glass-card flex min-h-12 items-center justify-between gap-3 rounded-2xl px-5 text-sm font-medium"
            >
              <span className="inline-flex items-center gap-2">
                <MessageSquare className="size-4" aria-hidden="true" /> Help & feedback on Telegram
              </span>
              <ExternalLink className="size-4 text-muted-foreground" aria-hidden="true" />
            </a>

            <button
              type="button"
              onClick={signOut}
              className="focus-ring min-h-11 w-full rounded-xl text-sm text-muted-foreground hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        )}

        <SignInDialog open={signIn} onClose={() => setSignIn(false)} />
      </main>
    </>
  );
}

/** Send NEAR to another address. Every send needs a fresh code from the user's email. */
function SendNear({ max }: { max: number }) {
  const { email, startSignIn } = useSession();
  const { refresh } = useAccount();
  const ids = useId();
  const [to, setTo] = usePersistentState("send:to", "");
  const [amount, setAmount] = usePersistentState("send:amount", "");
  const [code, setCode] = useState("");
  const [step, setStep] = usePersistentState<"form" | "code" | "done">("send:step", "form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<string | null>(null);

  const near = Number(amount) || 0;
  const validTo = /^[0-9a-f]{64}$/.test(to.trim()) || /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(to.trim());

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    if (!email) return;
    setBusy(true);
    setError(null);
    try {
      await startSignIn(email);
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.withdraw({ to: to.trim().toLowerCase(), near, otp: code.trim(), deviceId: deviceId() });
      setTx(r.txHash);
      setStep("done");
      void refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="glass-card rounded-2xl p-5">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Send className="size-4" aria-hidden="true" /> Send NEAR
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Move NEAR to another wallet or exchange. We&apos;ll email you a code to confirm.</p>

      {step === "done" ? (
        <div className="mt-4 rounded-xl bg-success-soft p-3 text-sm">
          Sent {near} NEAR to <span className="font-mono break-all">{to}</span>.{" "}
          {tx && (
            <a className="font-medium underline" href={`https://nearblocks.io/txns/${tx}`} target="_blank" rel="noreferrer">
              View transaction
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              setStep("form");
              setTo("");
              setAmount("");
              setCode("");
            }}
            className="focus-ring mt-2 block rounded font-medium underline"
          >
            Send more
          </button>
        </div>
      ) : step === "form" ? (
        <form onSubmit={sendCode} className="mt-4 space-y-3">
          <div>
            <label htmlFor={`${ids}-to`} className="block text-sm font-medium">
              To
            </label>
            <input
              id={`${ids}-to`}
              required
              autoComplete="off"
              spellCheck={false}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name.near or 64-character address"
              className="focus-ring mt-1.5 min-h-11 w-full rounded-xl border border-border bg-panel px-3 font-mono text-sm placeholder:font-sans placeholder:text-muted-foreground"
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor={`${ids}-amt`} className="block text-sm font-medium">
                Amount
              </label>
              <button type="button" onClick={() => setAmount(String(max))} className="focus-ring rounded text-xs text-muted-foreground hover:text-foreground">
                Max {max} NEAR
              </button>
            </div>
            <input
              id={`${ids}-amt`}
              required
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, "");
                if (v.split(".").length <= 2) setAmount(v);
              }}
              placeholder="0"
              className="focus-ring mt-1.5 min-h-11 w-full rounded-xl border border-border bg-panel px-3 font-mono text-base tabular-nums"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !validTo || !near || near > max}
            className="focus-ring min-h-11 w-full rounded-xl bg-foreground text-sm font-medium text-background disabled:bg-foreground/15 disabled:text-muted-foreground"
          >
            {busy ? "Sending code…" : near > max ? "Not enough NEAR" : "Continue"}
          </button>
        </form>
      ) : (
        <form onSubmit={confirm} className="mt-4 space-y-3">
          <p className="rounded-xl bg-card p-3 text-sm">
            Send <strong className="font-mono">{near} NEAR</strong> to <span className="font-mono break-all">{to}</span>
          </p>
          <label htmlFor={`${ids}-code`} className="block text-sm font-medium">
            Code sent to {email}
          </label>
          <input
            id={`${ids}-code`}
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
            className="focus-ring min-h-11 w-full rounded-xl border border-border bg-panel px-3 font-mono text-base tracking-widest tabular-nums"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || code.length < 4}
              className="focus-ring min-h-11 flex-1 rounded-xl bg-foreground text-sm font-medium text-background disabled:bg-foreground/15 disabled:text-muted-foreground"
            >
              {busy ? "Sending…" : "Confirm and send"}
            </button>
            <button type="button" onClick={() => setStep("form")} className="focus-ring min-h-11 rounded-xl px-4 text-sm text-muted-foreground hover:text-foreground">
              Back
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-warning">
          {error}
        </p>
      )}
    </section>
  );
}
