"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { BadgeCheck, Check, Plus, X } from "lucide-react";
import { api, type Bank, type Currency } from "@/lib/api";
import { maskAccount, useRecipients, type Recipient } from "@/lib/recipients";
import { cn } from "@/lib/utils";

/**
 * Pick or add a payout recipient for one currency. Bank list, the account
 * holder's real name and the saved list all come from the payout network.
 */
export function RecipientDialog({
  open,
  currency,
  selectedId,
  onClose,
  onSelect,
}: {
  open: boolean;
  currency: Currency;
  selectedId: string | null;
  onClose: () => void;
  onSelect: (r: Recipient) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { banks, recipients, error, reload } = useRecipients(currency.code, open);
  const [adding, setAdding] = useState(false);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const loading = recipients === null && !error;
  const showForm = adding || (recipients !== null && recipients.length === 0);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => {
        setAdding(false);
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto w-[min(100%-2rem,30rem)] rounded-3xl border border-border bg-panel p-0 text-foreground shadow-xl backdrop:bg-foreground/20 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              {showForm ? "Add a bank account" : "Pay out to"}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {currency.flag} {currency.country} · {currency.code}
            </p>
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className="focus-ring -m-2 flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-5 rounded-xl bg-warning-soft p-3 text-sm">
            {error}
          </p>
        )}
        {loading && (
          <div className="mt-5 space-y-2" aria-busy="true" aria-label="Loading">
            <div className="h-14 animate-pulse rounded-2xl bg-card" />
            <div className="h-14 animate-pulse rounded-2xl bg-card" />
          </div>
        )}

        {!loading && !error && showForm && banks && (
          <AccountForm
            banks={banks}
            onCancel={recipients?.length ? () => setAdding(false) : undefined}
            onSaved={(r) => {
              reload();
              setAdding(false);
              onSelect(r);
              ref.current?.close();
            }}
          />
        )}

        {!loading && !error && !showForm && recipients && (
          <>
            <ul className="mt-5 space-y-2">
              {recipients.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(r);
                      ref.current?.close();
                    }}
                    className={cn(
                      "focus-ring flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 text-left transition-colors duration-100",
                      r.id === selectedId ? "border-foreground bg-card" : "border-border hover:bg-card",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.accountName}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground tabular-nums">
                        {r.bankName} · {maskAccount(r.accountNumber)}
                      </span>
                    </span>
                    {r.id === selectedId && <Check className="size-4" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="focus-ring mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm font-medium hover:bg-card"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add a bank account
            </button>
          </>
        )}
      </div>
    </dialog>
  );
}

function AccountForm({
  banks,
  onSaved,
  onCancel,
}: {
  banks: Bank[];
  onSaved: (r: Recipient) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const [bankId, setBankId] = useState("");
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<
    { state: "idle" } | { state: "checking" } | { state: "ok"; name: string } | { state: "error"; message: string }
  >({ state: "idle" });

  const bank = banks.find((b) => b.id === bankId);

  async function resolve() {
    if (!bankId || account.length < 10) return;
    setCheck({ state: "checking" });
    try {
      const r = await api.resolveAccount(bankId, account);
      setCheck({ state: "ok", name: r.accountName });
    } catch (e) {
      setCheck({ state: "error", message: (e as Error).message });
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (check.state !== "ok" || !bank) return;
    setBusy(true);
    try {
      const saved = await api.saveAccount(bank.id, account);
      onSaved({
        id: saved.id,
        bankId: bank.id,
        bankName: bank.name,
        accountNumber: saved.accountNumber,
        accountName: saved.accountName ?? check.name,
      });
    } catch (err) {
      setCheck({ state: "error", message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-4">
      <div>
        <label htmlFor={`${id}-bank`} className="block text-sm font-medium">
          Bank
        </label>
        <select
          id={`${id}-bank`}
          required
          value={bankId}
          onChange={(e) => {
            setBankId(e.target.value);
            setCheck({ state: "idle" });
          }}
          className="focus-ring mt-1.5 min-h-11 w-full rounded-xl border border-border bg-panel px-3 text-base"
        >
          <option value="">{banks.length ? "Choose a bank" : "No banks available"}</option>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${id}-acct`} className="block text-sm font-medium">
          Account number
        </label>
        <input
          id={`${id}-acct`}
          required
          inputMode="numeric"
          autoComplete="off"
          value={account}
          onChange={(e) => {
            setAccount(e.target.value.replace(/\D/g, "").slice(0, 20));
            setCheck({ state: "idle" });
          }}
          onBlur={() => void resolve()}
          placeholder="10-digit account number"
          className="focus-ring mt-1.5 min-h-11 w-full rounded-xl border border-border bg-panel px-3 font-mono text-base tabular-nums placeholder:font-sans placeholder:text-muted-foreground"
        />
        <div className="mt-2 min-h-5 text-sm" aria-live="polite">
          {check.state === "checking" && <span className="text-muted-foreground">Checking with the bank…</span>}
          {check.state === "ok" && (
            <span className="inline-flex items-center gap-1.5 text-success">
              <BadgeCheck className="size-4" aria-hidden="true" />
              {check.name}
            </span>
          )}
          {check.state === "error" && (
            <span role="alert" className="text-warning">
              {check.message}
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={check.state !== "ok" || busy}
          className="focus-ring inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-foreground px-5 text-sm font-medium text-background transition-colors duration-100 hover:bg-foreground/90 disabled:bg-foreground/20 disabled:text-muted-foreground"
        >
          {busy ? "Saving…" : "Save and use"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="focus-ring min-h-11 rounded-xl px-4 text-sm text-muted-foreground hover:text-foreground">
            Back
          </button>
        )}
      </div>
    </form>
  );
}
