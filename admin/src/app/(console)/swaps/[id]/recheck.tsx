"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { recheck, type RecheckResult } from "./actions";

const MEANING: Record<string, string> = {
  PENDING_DEPOSIT: "Intents is still waiting for the user's NEAR. The wallet transaction may not have landed.",
  KNOWN_DEPOSIT_TX: "Intents has seen the deposit transaction and is confirming it.",
  PROCESSING: "Swap in progress.",
  SUCCESS: "Swap done: the USDC was delivered to PAJ's Solana address.",
  INCOMPLETE_DEPOSIT: "Less NEAR arrived than the quote required. Intents refunds it to the user.",
  REFUNDED: "Intents refunded the NEAR to the user's wallet.",
  FAILED: "Intents marked the swap failed.",
};

export function Recheck({ id }: { id: string }) {
  const [res, setRes] = useState<RecheckResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setRes(await recheck(id)))}
        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium outline-none hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60"
      >
        <RefreshCw className={`size-4 ${pending ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" />
        {pending ? "Checking…" : "Re-check with NEAR Intents"}
      </button>
      <div aria-live="polite" className="mt-2 text-sm">
        {res?.error && <p className="text-red-700">{res.error}</p>}
        {res && !res.error && (
          <p className="text-neutral-700">
            {res.swap ? (
              <>
                <span className="font-mono font-medium">{res.swap}</span> — {MEANING[res.swap] ?? "Unknown status."}
              </>
            ) : (
              res.note
            )}
            {res.checkedAt && (
              <span className="text-neutral-500"> (checked {new Date(res.checkedAt).toLocaleTimeString("en-GB")})</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
