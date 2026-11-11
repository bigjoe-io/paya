import Link from "next/link";
import { Search } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { relay, RelayError, type AuditEntry } from "@/lib/relay";
import { Card, RelayDown, when } from "@/components/ui";

const LABEL: Record<string, string> = {
  sign_in_code_sent: "Sign-in code sent",
  signed_in: "Signed in",
  sign_in_failed: "Sign-in failed",
  bank_account_saved: "Bank account saved",
  kyc_submitted: "KYC submitted",
  swap_created: "Swap created",
  swap_rejected: "Swap rejected",
  account_created: "Account created",
  bank_linked: "Bank linked",
  bank_changed: "Bank changed",
  auto_cashout_on: "Auto cash-out on",
  auto_cashout_off: "Auto cash-out off",
  auto_cashout_failed: "Auto cash-out failed",
  cashout_sent: "Cash-out sent",
  cashout_rejected: "Cash-out rejected",
  withdraw_sent: "NEAR sent out",
  withdraw_rejected: "Send rejected",
  withdraw_code_failed: "Send code failed",
  buy_created: "Buy created",
  buy_rejected: "Buy rejected",
};

const tone = (t: string) =>
  t.endsWith("failed") || t.endsWith("rejected") ? "bg-red-50 text-red-700" : t.startsWith("swap") ? "bg-blue-50 text-blue-700" : "bg-neutral-100 text-neutral-700";

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  let list: AuditEntry[];
  try {
    list = await relay.audit(q);
  } catch (e) {
    return <RelayDown message={e instanceof RelayError ? e.message : "Unexpected error"} />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Everything users did that isn&apos;t a swap record: sign-ins, saved bank accounts, refused orders. Newest first.
        </p>
      </div>

      <form className="flex gap-2" role="search">
        <label className="relative flex-1">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Email, wallet, swap id, error text…"
            className="min-h-10 w-full rounded-xl border border-neutral-300 bg-white pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          />
        </label>
        <button type="submit" className="min-h-10 rounded-xl bg-neutral-950 px-4 text-sm font-medium text-white">
          Search
        </button>
        {q && (
          <Link href="/audit" className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm text-neutral-600 hover:text-neutral-950">
            Clear
          </Link>
        )}
      </form>

      <Card>
        {list.length === 0 ? (
          <p className="px-5 py-14 text-center text-sm text-neutral-500">{q ? "Nothing matches." : "No activity yet."}</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {list.map((e, i) => {
              const swapId = typeof e.detail?.swapId === "string" ? e.detail.swapId : null;
              return (
                <li key={i} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 py-3 text-sm">
                  <span className="w-36 shrink-0 text-xs text-neutral-500 tabular-nums">{when(e.at)}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${tone(e.type)}`}>{LABEL[e.type] ?? e.type}</span>
                  <span className="min-w-0 flex-1">
                    {e.actor && <span className="font-medium">{e.actor}</span>}
                    {swapId && (
                      <Link href={`/swaps/${swapId}`} className="ml-2 font-mono text-xs text-blue-700 hover:underline">
                        {swapId}
                      </Link>
                    )}
                    {e.detail && (
                      <span className="mt-0.5 block truncate font-mono text-xs text-neutral-500" title={JSON.stringify(e.detail)}>
                        {Object.entries(e.detail)
                          .filter(([k]) => k !== "swapId")
                          .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
                          .join("  ")}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
