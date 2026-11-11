"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { BadgeCheck, Landmark } from "lucide-react";
import { api, type Bank } from "@/lib/api";
import { useSession } from "@/components/app/session-provider";

/**
 * Where the naira goes. The number is checked (NUBAN) before saving and the
 * holder's name is confirmed with the bank (live rail) before any payout, so
 * money never goes to a mistyped number.
 */
export function BankForm({ compact = false }: { compact?: boolean }) {
  const { email, me, refresh } = useSession();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  // After a successful check: the holder's name (live) or "" (test mode: number checks out, name unknown).
  const [verified, setVerified] = useState<string | null>(null);
  const [busy, setBusy] = useState<"verify" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const id = useId();

  useEffect(() => {
    let cancelled = false;
    api
      .banks()
      .then((b) => {
        if (!cancelled) setBanks(b);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const saved = me?.bank ?? null;

  if (saved && !editing) {
    return (
      <section className="glass-card rounded-3xl p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Landmark className="size-4" aria-hidden="true" />
          Naira goes to
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-medium">{saved.accountName ?? saved.name}</p>
            <p className="font-mono text-sm text-muted-foreground tabular-nums">
              {saved.accountName ? `${saved.name} · ` : ""}
              {saved.accountNumber}
            </p>
          </div>
          {saved.verified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
              <BadgeCheck className="size-3.5" aria-hidden="true" />
              Verified
            </span>
          ) : (
            <span
              className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning"
              title="The account holder's name is confirmed with the bank before the first live payout."
            >
              Name check pending
            </span>
          )}
        </div>
        {!compact && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="focus-ring mt-4 min-h-9 rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Change bank account
          </button>
        )}
      </section>
    );
  }

  async function verify() {
    if (!email || !bankCode || !/^\d{10}$/.test(accountNumber)) return;
    setBusy("verify");
    setError(null);
    try {
      const r = await api.verifyBank({ email }, bankCode, accountNumber);
      setVerified(r.verified ? r.accountName : "");
    } catch (e) {
      setVerified(null);
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email) return;
    setBusy("save");
    setError(null);
    try {
      await api.saveBank({ email }, bankCode, accountNumber);
      await refresh();
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="glass-card rounded-3xl p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Landmark className="size-4" aria-hidden="true" />
        {saved ? "Change bank account" : "Where should the naira go?"}
      </div>
      {!saved && (
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Add the bank account once. Every NEAR deposit after that pays out here automatically.
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-bank`} className="block text-sm font-medium">
            Bank
          </label>
          <select
            id={`${id}-bank`}
            name="bank"
            required
            value={bankCode}
            onChange={(e) => {
              setBankCode(e.target.value);
              setVerified(null);
            }}
            className="focus-ring mt-1.5 min-h-11 w-full rounded-xl border border-border bg-panel px-3 text-base"
          >
            <option value="">Select a bank</option>
            {banks.map((b) => (
              <option key={b.bankcode} value={b.bankcode}>
                {b.bankname}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-number`} className="block text-sm font-medium">
            Account number
          </label>
          <input
            id={`${id}-number`}
            name="accountNumber"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            pattern="\d{10}"
            maxLength={10}
            required
            value={accountNumber}
            onChange={(e) => {
              setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10));
              setVerified(null);
            }}
            onBlur={verify}
            placeholder="10-digit account number"
            className="focus-ring mt-1.5 min-h-11 w-full rounded-xl border border-border bg-panel px-3 font-mono text-base tabular-nums placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="mt-3 min-h-6 text-sm" aria-live="polite">
        {busy === "verify" && <span className="text-muted-foreground">Checking the account name…</span>}
        {verified && (
          <span className="inline-flex items-center gap-1.5 text-success">
            <BadgeCheck className="size-4" aria-hidden="true" />
            {verified}
          </span>
        )}
        {verified === "" && (
          <span className="text-muted-foreground">
            Account number checks out. The holder&apos;s name is confirmed with the bank before the first payout.
          </span>
        )}
        {error && (
          <span role="alert" className="text-warning">
            {error}
          </span>
        )}
      </div>

      <div className="mt-2 flex gap-2">
        <button
          type="submit"
          disabled={verified === null || busy !== null}
          className="focus-ring inline-flex min-h-11 items-center justify-center rounded-xl bg-foreground px-5 text-sm font-medium text-background transition-colors duration-100 hover:bg-foreground/90 disabled:bg-foreground/20 disabled:text-muted-foreground"
        >
          {busy === "save" ? "Saving…" : "Save bank account"}
        </button>
        {saved && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="focus-ring min-h-11 rounded-xl px-4 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
