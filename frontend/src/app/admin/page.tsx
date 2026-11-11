"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Logo } from "@/components/logo";
import { ACCESS_COOKIE, api } from "@/lib/api";

/** Tester access: a code from the Paya team unlocks the app on this device for 30 days. */
export default function TesterAccessPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.redeemAccess(code.trim());
      const maxAge = Math.max(0, Math.floor((Date.parse(r.expiresAt) - Date.now()) / 1000));
      document.cookie = `${ACCESS_COOKIE}=${encodeURIComponent(r.token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      router.replace("/app");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-border bg-panel p-7 shadow-sm">
        <Logo />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Tester access</h1>
        <p className="mt-1.5 text-sm text-muted-foreground text-pretty">Enter the access code you were given to try Paya.</p>
        <label htmlFor={`${ids}-c`} className="mt-6 block text-sm font-medium">
          Access code
        </label>
        <div className="relative mt-1.5">
          <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            id={`${ids}-c`}
            required
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="PAYA-XXXX-XXXX"
            className="focus-ring min-h-11 w-full rounded-xl border border-border bg-panel pr-3 pl-9 font-mono text-base tracking-wider placeholder:font-sans placeholder:tracking-normal placeholder:text-muted-foreground"
          />
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-warning">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || code.trim().length < 4}
          className="focus-ring mt-5 min-h-11 w-full rounded-xl bg-foreground text-sm font-medium text-background hover:bg-foreground/90 disabled:bg-foreground/15 disabled:text-muted-foreground"
        >
          {busy ? "Checking…" : "Open Paya"}
        </button>
        <p className="mt-4 text-center text-xs text-muted-foreground">No code? Join the waitlist on the home page.</p>
      </form>
    </main>
  );
}
