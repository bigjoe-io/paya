"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { useSession } from "@/components/app/session-provider";

export function SignIn() {
  const { login, loading, error } = useSession();
  const [email, setEmail] = useState("");
  const id = useId();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    await login(email.trim().toLowerCase()).catch(() => undefined);
  }

  return (
    <main className="app-bg flex min-h-dvh flex-col items-center justify-center px-4">
      <Link href="/" className="focus-ring mb-10 rounded-full" aria-label="Paya home">
        <Logo />
      </Link>
      <form onSubmit={onSubmit} className="glass w-full max-w-sm rounded-3xl p-6">
        <h1 className="text-xl font-semibold tracking-tight">Sign in to Paya</h1>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Your email is your account. We create a NEAR address for you — anything sent to it becomes naira in
          your bank.
        </p>
        <label htmlFor={id} className="mt-5 block text-sm font-medium">
          Email
        </label>
        <input
          id={id}
          type="email"
          name="email"
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
          disabled={loading}
          className="focus-ring mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-medium text-background transition-colors duration-100 hover:bg-foreground/90 disabled:opacity-60"
        >
          {loading ? "Setting up your address…" : "Continue"}
          {!loading && <ArrowRight className="size-4" aria-hidden="true" />}
        </button>
        <p className="mt-4 text-center text-xs text-muted-foreground">No seed phrase. No wallet to install.</p>
      </form>
    </main>
  );
}
