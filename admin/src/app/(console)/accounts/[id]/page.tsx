import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { relay, RelayError, type AdminUserDetail } from "@/lib/relay";
import { Card, explorer, RelayDown, StatusBadge, when } from "@/components/ui";

export default async function AccountPage({ params }: PageProps<"/accounts/[id]">) {
  await requireAdmin();
  const { id } = await params;
  let u: AdminUserDetail;
  try {
    u = await relay.user(id);
  } catch (e) {
    if (e instanceof RelayError && /404/.test(e.message)) notFound();
    return <RelayDown message={e instanceof RelayError ? e.message : "Unexpected error"} />;
  }

  return (
    <div className="space-y-5">
      <Link href="/accounts" className="text-sm text-neutral-500 hover:text-neutral-950">
        ← Accounts
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{u.email}</h1>
        <p className="mt-1 font-mono text-xs text-neutral-500">{u.id} · key index {u.key_index}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="text-sm font-medium text-neutral-500">NEAR address</h2>
          <a href={explorer.nearAccount(u.address)} target="_blank" rel="noreferrer" className="mt-1 block font-mono text-sm break-all text-blue-700 hover:underline">
            {u.address}
          </a>
          <p className="mt-3 text-sm">
            {u.onchain
              ? u.onchain.exists
                ? `${u.onchain.near} NEAR${u.onchain.wnear ? ` + ${u.onchain.wnear} wNEAR` : ""} on-chain`
                : "Not on-chain yet (never received NEAR)"
              : "Couldn't read the chain"}
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            Auto cash-out {u.auto_cashout ? "on" : "off"}
            {u.auto_paused_until ? ` · last paused until ${when(u.auto_paused_until)}` : ""}
            {" · "}payout session {u.has_paj_session ? "valid" : "expired"}
          </p>
        </Card>
        <Card>
          <h2 className="text-sm font-medium text-neutral-500">Payout bank</h2>
          {u.bank_name ? (
            <>
              <p className="mt-1 font-medium">{u.account_name}</p>
              <p className="font-mono text-sm">
                {u.bank_name} · {u.account_number} · {u.currency}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-neutral-400">Not linked</p>
          )}
        </Card>
      </div>

      <Card className="p-0">
        <h2 className="border-b border-neutral-200 px-4 py-3 text-sm font-medium">Cash-outs</h2>
        {u.cashouts.length === 0 ? (
          <p className="p-4 text-sm text-neutral-500">None</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {u.cashouts.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <Link href={`/swaps/${s.id}`} className="font-mono text-blue-700 hover:underline">
                  {s.id}
                </Link>
                <span className="tabular-nums">
                  {s.fiat_amount.toLocaleString("en-US")} {s.currency}
                </span>
                <StatusBadge status={s.status} />
                <span className="text-neutral-500">{when(s.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-0">
        <h2 className="border-b border-neutral-200 px-4 py-3 text-sm font-medium">Purchases</h2>
        {u.buys.length === 0 ? (
          <p className="p-4 text-sm text-neutral-500">None</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {u.buys.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="font-mono">{b.id}</span>
                <span className="tabular-nums">
                  {b.fiat_amount.toLocaleString("en-US")} {b.currency}
                </span>
                <span>{b.status}</span>
                <span className="text-neutral-500">{when(b.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-medium">Account timeline</h2>
        <ol className="mt-3 space-y-2 text-sm">
          {(u.events ?? []).slice().reverse().map((e, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-40 shrink-0 text-neutral-500">{when(e.at)}</span>
              <span className="font-medium">{e.type.replace(/_/g, " ")}</span>
              {e.detail && <span className="min-w-0 truncate font-mono text-xs text-neutral-500">{JSON.stringify(e.detail)}</span>}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
