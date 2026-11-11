"use client";

import { useActionState } from "react";
import { Lock } from "lucide-react";
import { login, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-100 px-4">
      <form action={action} className="w-full max-w-sm rounded-3xl border border-neutral-200 bg-white p-7 shadow-sm">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-neutral-950 text-white">
          <Lock className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">Paya Admin</h1>
        <p className="mt-1 text-sm text-neutral-500">Internal. Authorised staff only.</p>

        <label htmlFor="password" className="mt-6 block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          className="mt-1.5 min-h-11 w-full rounded-xl border border-neutral-300 px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        />
        {state.error && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="mt-5 min-h-11 w-full rounded-xl bg-neutral-950 text-sm font-medium text-white outline-none hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {pending ? "Checking…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
