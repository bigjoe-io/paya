import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { relay, RelayError, type AdminBuy, type AdminSwap } from "@/lib/relay";
import { Card, money, RelayDown, SimBadge, STATUS_LABEL, StatusBadge, when, yoctoToNear } from "@/components/ui";

const STATUSES = Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[];

export default async function TransactionsPage({ searchParams }: PageProps<"/">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const mode = typeof sp.mode === "string" ? sp.mode : "";

  // A support ID goes straight to its order.
  if (/^swp_[0-9a-f]+$/.test(q.trim())) redirect(`/swaps/${q.trim()}`);
  if (/^buy_[0-9a-f]+$/.test(q.trim())) redirect(`/buys/${q.trim()}`);

  let stats, list: AdminSwap[], buyMatches: AdminBuy[], treasury: Awaited<ReturnType<typeof relay.treasury>> | null;
  try {
    [stats, list, buyMatches, treasury] = await Promise.all([
      relay.stats(),
      relay.swaps({ q, status, mode }),
      q ? relay.buys(q) : Promise.resolve([]),
      relay.treasury().catch(() => null),
    ]);
  } catch (e) {
    return <RelayDown message={e instanceof RelayError ? e.message : "Unexpected error"} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Every cash-out on the platform.{" "}
            {stats.liveOrders ? (
              <span className="font-medium text-green-700">Live orders ON — real money is moving.</span>
            ) : (
              <span className="font-medium text-amber-700">Live orders OFF — swaps are simulated.</span>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Stat label="Paid (live)" value={String(stats.paid)} />
        <Stat label="In flight" value={String(stats.inFlight)} />
        <Stat label="Failed / refunded" value={`${stats.failed} / ${stats.refunded}`} />
        <Stat label="Success rate" value={stats.successRate === null ? "—" : `${Math.round(stats.successRate * 100)}%`} />
        <Stat label="Volume" value={`${money(stats.nearVolume, 2)} NEAR`} sub={`$${money(stats.usdcVolume)} USDC`} />
        <Stat label="Fees earned" value={`$${money(stats.feesUsdc)}`} sub={`${stats.uniqueWallets} wallets`} />
      </div>
      {Object.keys(stats.fiatByCurrency).length > 0 && (
        <p className="text-sm text-neutral-600">
          Paid out:{" "}
          {Object.entries(stats.fiatByCurrency)
            .map(([c, v]) => `${money(v, 0)} ${c}`)
            .join(" · ")}
        </p>
      )}

      {/* filters: plain GET form, so every view is a shareable URL */}
      {treasury && (
        <Card className={treasury.lowSol ? "border-red-300 bg-red-50 p-4" : "p-4"}>
          <p className="text-xs text-neutral-500">Paya Solana wallet (USDC in transit, SOL for fees)</p>
          <p className="mt-1 font-mono text-xs break-all">{treasury.solanaAddress}</p>
          <p className="mt-2 text-sm tabular-nums">
            {treasury.sol ?? "—"} SOL · {treasury.usdc ?? "—"} USDC
            {treasury.lowSol && <span className="ml-2 font-medium text-red-700">Low on SOL: top up ~0.02 SOL or orders will pause</span>}
          </p>
        </Card>
      )}

      <form className="flex flex-wrap gap-2" role="search">
        <label className="relative min-w-72 flex-1">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Support ID (swp_… / buy_…), NEAR or Solana tx, email, address, account number…"
            className="min-h-10 w-full rounded-xl border border-neutral-300 bg-white pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          />
        </label>
        <select name="status" defaultValue={status} aria-label="Status" className="min-h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select name="mode" defaultValue={mode} aria-label="Mode" className="min-h-10 rounded-xl border border-neutral-300 bg-white px-3 text-sm">
          <option value="">Live + simulated</option>
          <option value="live">Live only</option>
          <option value="simulated">Simulated only</option>
        </select>
        <button type="submit" className="min-h-10 rounded-xl bg-neutral-950 px-4 text-sm font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
          Search
        </button>
        {(q || status || mode) && (
          <Link href="/" className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm text-neutral-600 hover:text-neutral-950">
            Clear
          </Link>
        )}
      </form>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="border-b border-neutral-200 text-left text-xs text-neutral-500">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Created</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">Wallet</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">NEAR</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Payout</th>
              <th scope="col" className="px-4 py-3 font-medium">Recipient</th>
              <th scope="col" className="px-4 py-3 font-medium">Swap</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-14 text-center text-neutral-500">
                  {q || status || mode ? "Nothing matches these filters." : "No transactions yet."}
                </td>
              </tr>
            ) : (
              list.map((s) => (
                <tr key={s.id} className="relative border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                  <td className="px-4 py-3 whitespace-nowrap text-neutral-600 tabular-nums">{when(s.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <StatusBadge status={s.status} />
                      {s.demo ? <SimBadge /> : null}
                    </span>
                  </td>
                  <td className="max-w-48 truncate px-4 py-3 font-mono text-xs" title={s.account_id}>
                    {s.account_id}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{yoctoToNear(s.amount_in).toFixed(4)}</td>
                  <td className="px-4 py-3 text-right font-mono whitespace-nowrap tabular-nums">
                    {money(s.fiat_amount, 0)} {s.currency}
                  </td>
                  <td className="max-w-56 truncate px-4 py-3" title={`${s.account_name} · ${s.bank_name}`}>
                    {s.account_name} <span className="text-neutral-500">· {s.bank_name}</span>
                  </td>
                  <td className="px-4 py-3">
                    {/* the whole row is clickable through this link's ::after */}
                    <Link
                      href={`/swaps/${s.id}`}
                      className="font-mono text-xs text-blue-700 outline-none after:absolute after:inset-0 hover:underline focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      {s.id}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-neutral-500">Showing up to 200 newest. Narrow with search for older ones.</p>
      {q && buyMatches.length > 0 && (
        <Card className="p-0">
          <h2 className="border-b border-neutral-200 px-4 py-3 text-sm font-medium">Purchases matching “{q}”</h2>
          <ul className="divide-y divide-neutral-100">
            {buyMatches.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <Link href={`/buys/${b.id}`} className="font-mono text-blue-700 hover:underline">
                  {b.id}
                </Link>
                <span className="tabular-nums">
                  {b.fiat_amount.toLocaleString("en-US")} {b.currency}
                </span>
                <span>{b.status}</span>
                <span className="text-neutral-500">{when(b.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-500 tabular-nums">{sub}</p>}
    </Card>
  );
}
