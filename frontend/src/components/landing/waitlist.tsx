"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/** "Join waitlist" button + modal. Emails are stored on Paya's own server (no email service). */
export function WaitlistButton({ className, children = "Join waitlist", source }: { className?: string; children?: ReactNode; source?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("busy");
    setError(null);
    try {
      await api.joinWaitlist(email.trim(), source);
      setState("done");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-medium text-primary-foreground transition-colors duration-100 hover:bg-primary/85",
          className,
        )}
      >
        {children}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={`${ids}-t`}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
        className="m-auto w-[min(100%-2rem,26rem)] rounded-3xl border border-border bg-panel p-0 text-left text-foreground shadow-xl backdrop:bg-foreground/25 backdrop:backdrop-blur-sm"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <Logo />
            <button
              type="button"
              aria-label="Close"
              onClick={() => ref.current?.close()}
              className="focus-ring -m-2 flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          {state === "done" ? (
            <div className="py-6 text-center" role="status">
              <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden="true" />
              <h2 className="mt-4 text-xl font-semibold tracking-tight">You&apos;re on the list</h2>
              <p className="mt-2 text-sm text-muted-foreground text-pretty">
                We&apos;ll email <span className="font-medium text-foreground">{email.trim()}</span> as soon as Paya opens.
              </p>
              <button
                type="button"
                onClick={() => ref.current?.close()}
                className="focus-ring mt-6 min-h-11 w-full rounded-xl bg-foreground text-sm font-medium text-background hover:bg-foreground/90"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-5">
              <h2 id={`${ids}-t`} className="text-xl font-semibold tracking-tight">
                Join the waitlist
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground text-pretty">
                Paya is in private testing. Leave your email and we&apos;ll let you in as soon as it opens.
              </p>
              <label htmlFor={`${ids}-e`} className="mt-5 block text-sm font-medium">
                Email
              </label>
              <input
                id={`${ids}-e`}
                type="email"
                required
                autoComplete="email"
                inputMode="email"
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
                disabled={state === "busy"}
                className="focus-ring mt-4 min-h-11 w-full rounded-xl bg-foreground text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-60"
              >
                {state === "busy" ? "Joining…" : "Join waitlist"}
              </button>
              <p className="mt-3 text-center text-xs text-muted-foreground">We&apos;ll only use your email to tell you when Paya opens.</p>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
