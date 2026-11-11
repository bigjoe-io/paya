"use client";

import { useActionState } from "react";
import { createCode, type CreateResult } from "./actions";
import { CopyButton } from "@/components/copy";

export function CreateCode() {
  const [state, action, pending] = useActionState<CreateResult, FormData>(createCode, {});
  return (
    <div>
      <form action={action} className="grid gap-3 sm:grid-cols-[1fr_9rem_9rem_auto] sm:items-end">
        <label className="text-sm">
          <span className="font-medium">Who is it for</span>
          <input name="label" placeholder="e.g. Ada (beta tester)" maxLength={60} className="mt-1 min-h-10 w-full rounded-xl border border-neutral-300 px-3 outline-none focus-visible:ring-2 focus-visible:ring-blue-600" />
        </label>
        <label className="text-sm">
          <span className="font-medium">Max people</span>
          <input name="maxUses" type="number" min={1} placeholder="Unlimited" className="mt-1 min-h-10 w-full rounded-xl border border-neutral-300 px-3 outline-none focus-visible:ring-2 focus-visible:ring-blue-600" />
        </label>
        <label className="text-sm">
          <span className="font-medium">Expires in (days)</span>
          <input name="expiresDays" type="number" min={1} placeholder="Never" className="mt-1 min-h-10 w-full rounded-xl border border-neutral-300 px-3 outline-none focus-visible:ring-2 focus-visible:ring-blue-600" />
        </label>
        <button type="submit" disabled={pending} className="min-h-10 rounded-xl bg-neutral-950 px-4 text-sm font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60">
          {pending ? "Creating…" : "Create code"}
        </button>
      </form>
      <div aria-live="polite">
        {state.error && <p className="mt-3 text-sm text-red-700">{state.error}</p>}
        {state.code && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-sm text-green-900">
              Code for <strong>{state.label}</strong>. Copy it now: it won&apos;t be shown again.
            </p>
            <p className="mt-2 flex items-center gap-2 font-mono text-lg font-semibold tracking-wider">
              {state.code} <CopyButton value={state.code} label="code" />
            </p>
            <p className="mt-1 text-xs text-green-900">Testers enter it at usepaya.xyz/admin.</p>
          </div>
        )}
      </div>
    </div>
  );
}
