"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Mail, X } from "lucide-react";
import { useSession } from "@/components/app/session-provider";

/**
 * Email + one-time code (sent by the payout network). Creates the Paya
 * account on first sign-in; later, refreshes the payout session.
 */
export function SignInDialog({ open, onClose, onSignedIn }: { open: boolean; onClose: () => void; onSignedIn?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { startSignIn, verify, email: current } = useSession();
  const [step, setStep] = useState<"email" | "code">("email");
  const [typed, setTyped] = useState<string | null>(null);
  // Re-verifying an existing session: start from the account's email.
  const email = typed ?? current ?? "";
  const setEmail = setTyped;
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function onEmail(e: FormEvent) {
    e.preventDefault();
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

  async function onCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verify(email, code);
      ref.current?.close();
      onSignedIn?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      onClose={() => {
        setStep("email");
        setCode("");
        setError(null);
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto w-[min(100%-2rem,26rem)] rounded-3xl border border-border bg-panel p-0 text-foreground shadow-xl backdrop:bg-foreground/20 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-card">
            <Mail className="size-5" aria-hidden="true" />
          </span>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className="focus-ring -m-2 flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <h2 id={`${id}-title`} className="mt-4 text-lg font-semibold tracking-tight">
          {step === "email" ? "Sign in or create your account" : "Enter the code"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          {step === "email"
            ? "New here? Your account and your own NEAR address are created the moment you verify. We'll email you a one-time code."
            : `We sent a code to ${email}.`}
        </p>

        {step === "email" ? (
          <form onSubmit={onEmail} className="mt-5">
            <label htmlFor={`${id}-email`} className="block text-sm font-medium">
              Email
            </label>
            <input
              id={`${id}-email`}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="focus-ring mt-1.5 min-h-11 w-full rounded-xl border border-border bg-panel px-3 text-base placeholder:text-muted-foreground"
            />
            {error && (
              <p role="alert" className="mt-2 text-sm text-warning">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="focus-ring mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send code"}
              {!busy && <ArrowRight className="size-4" aria-hidden="true" />}
            </button>
          </form>
        ) : (
          <form onSubmit={onCode} className="mt-5">
            <label htmlFor={`${id}-code`} className="block text-sm font-medium">
              One-time code
            </label>
            <input
              id={`${id}-code`}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="focus-ring mt-1.5 min-h-12 w-full rounded-xl border border-border bg-panel px-3 text-center font-mono text-2xl tracking-[0.4em] tabular-nums"
            />
            {error && (
              <p role="alert" className="mt-2 text-sm text-warning">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || code.length < 4}
              className="focus-ring mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-foreground text-sm font-medium text-background hover:bg-foreground/90 disabled:bg-foreground/20 disabled:text-muted-foreground"
            >
              {busy ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              className="focus-ring mt-2 min-h-10 w-full rounded-xl text-sm text-muted-foreground hover:text-foreground"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </dialog>
  );
}
