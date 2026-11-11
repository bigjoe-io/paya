"use client";

import { useEffect, useState } from "react";
import { Landmark, Plus } from "lucide-react";
import { Topbar } from "@/components/app/topbar";
import { EmptyState, PageTitle } from "@/components/app/ui";
import { useSession } from "@/components/app/session-provider";
import { RecipientDialog } from "@/components/app/recipient-dialog";
import { SignInDialog } from "@/components/app/sign-in-dialog";
import { api, type Currency } from "@/lib/api";
import { maskAccount, useRecipients } from "@/lib/recipients";
import { cn } from "@/lib/utils";

export default function RecipientsPage() {
  const { signedIn, email, signOut } = useSession();
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [code, setCode] = useState("NGN");
  const [dialog, setDialog] = useState<"none" | "add" | "signin">("none");
  const { recipients, error, reload } = useRecipients(code, signedIn);
  const currency = currencies.find((c) => c.code === code);

  useEffect(() => {
    api.currencies().then(setCurrencies).catch(() => undefined);
  }, []);

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-3xl px-4 pb-12 lg:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <PageTitle>Recipients</PageTitle>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              Bank accounts saved to your payout profile{email ? ` (${email})` : ""}. Names are confirmed with the bank.
            </p>
          </div>
          {signedIn && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDialog("add")}
                disabled={!currency}
                className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-60"
              >
                <Plus className="size-4" aria-hidden="true" />
                Add account
              </button>
              <button
                type="button"
                onClick={signOut}
                className="focus-ring min-h-10 rounded-xl px-3 text-sm text-muted-foreground hover:text-foreground"
              >
                Sign out
              </button>
            </div>
          )}
        </div>

        {currencies.length > 0 && (
          <div role="group" aria-label="Country" className="mt-6 flex flex-wrap gap-1">
            {currencies.map((c) => (
              <button
                key={c.code}
                type="button"
                aria-pressed={c.code === code}
                onClick={() => setCode(c.code)}
                className={cn(
                  "focus-ring min-h-10 rounded-full px-3.5 text-sm transition-colors duration-100",
                  c.code === code ? "bg-foreground text-background" : "bg-card text-foreground/80 hover:text-foreground",
                )}
              >
                {c.flag} {c.country}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6">
          {!signedIn ? (
            <EmptyState
              title="Verify your email"
              body="Recipients are saved to your payout profile, so they follow you to any device."
              action={
                <button
                  type="button"
                  onClick={() => setDialog("signin")}
                  className="focus-ring min-h-11 rounded-xl bg-foreground px-5 text-sm font-medium text-background hover:bg-foreground/90"
                >
                  Verify email
                </button>
              }
            />
          ) : error ? (
            <p role="alert" className="rounded-2xl bg-warning-soft p-4 text-sm">
              {error}
            </p>
          ) : recipients === null ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading">
              {[0, 1].map((i) => (
                <div key={i} className="glass-card h-16 animate-pulse rounded-2xl" />
              ))}
            </div>
          ) : recipients.length === 0 ? (
            <EmptyState title={`No ${currency?.country ?? ""} accounts yet`} body="Add one and pick it on the Swap screen." />
          ) : (
            <ul className="glass-card divide-y divide-border rounded-2xl">
              {recipients.map((r) => (
                <li key={r.id} className="flex items-center gap-4 px-5 py-4">
                  <span className="flex size-10 items-center justify-center rounded-full bg-foreground/10">
                    <Landmark className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.accountName}</span>
                    <span className="block truncate font-mono text-sm text-muted-foreground tabular-nums">
                      {r.bankName} · {maskAccount(r.accountNumber)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {currency && (
          <RecipientDialog
            open={dialog === "add"}
            currency={currency}
            selectedId={null}
            onClose={() => setDialog("none")}
            onSelect={() => reload()}
          />
        )}
        <SignInDialog open={dialog === "signin"} onClose={() => setDialog("none")} />
      </main>
    </>
  );
}
