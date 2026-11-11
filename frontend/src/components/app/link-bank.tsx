"use client";

import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import { useAccount } from "@/components/app/account-provider";
import { RecipientDialog } from "@/components/app/recipient-dialog";
import { SignInDialog } from "@/components/app/sign-in-dialog";
import { api, ApiError, type Currency } from "@/lib/api";
import { cn } from "@/lib/utils";
import { usePersistentState } from "@/lib/persist";

/**
 * Pick a country, then a bank account (searchable bank list + name check),
 * and make it the account's payout bank.
 */
export function LinkBank({ label = "Link bank account", variant = "primary" }: { label?: string; variant?: "primary" | "quiet" }) {
  const { me, setMe } = useAccount();
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [code, setCode] = usePersistentState<string | null>("bank:country", null);
  const [dialog, setDialog] = useState<"none" | "pick" | "signin">("none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .currencies()
      .then((c) => setCurrencies(c.filter((x) => !x.comingSoon)))
      .catch(() => undefined);
  }, []);

  const chosen = code ?? me?.bank?.currency ?? "NGN";
  const currency = currencies.find((c) => c.code === chosen);

  function open() {
    setError(null);
    setDialog(me?.verified === false ? "signin" : "pick");
  }

  return (
    <div>
      {currencies.length > 0 && (
        <div role="group" aria-label="Country" className="flex flex-wrap gap-1">
          {currencies.map((c) => (
            <button
              key={c.code}
              type="button"
              aria-pressed={c.code === chosen}
              onClick={() => setCode(c.code)}
              className={cn(
                "focus-ring min-h-10 rounded-full px-3.5 text-sm transition-colors duration-100",
                c.code === chosen ? "bg-foreground text-background" : "bg-card text-foreground/80 hover:text-foreground",
              )}
            >
              {c.flag} {c.country}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={open}
        disabled={!currency || saving}
        className={cn(
          "focus-ring mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium disabled:opacity-60",
          variant === "primary" ? "w-full bg-foreground text-background hover:bg-foreground/90" : "border border-border bg-panel hover:bg-card",
        )}
      >
        <Landmark className="size-4" aria-hidden="true" />
        {saving ? "Linking…" : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 rounded-xl bg-warning-soft px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {currency && (
        <RecipientDialog
          open={dialog === "pick"}
          currency={currency}
          selectedId={null}
          onClose={() => setDialog((d) => (d === "pick" ? "none" : d))}
          onSelect={async (r) => {
            setSaving(true);
            setError(null);
            try {
              setMe(await api.setBank({ currency: currency.code, bankId: r.bankId, accountNumber: r.accountNumber }));
            } catch (e) {
              const err = e as ApiError;
              if (err.code === "SIGN_IN") setDialog("signin");
              setError(err.message);
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
      <SignInDialog open={dialog === "signin"} onClose={() => setDialog((d) => (d === "signin" ? "none" : d))} onSignedIn={() => setDialog("pick")} />
    </div>
  );
}
