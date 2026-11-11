import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { relay, RelayError, type AdminBuy } from "@/lib/relay";
import { Card, explorer, RelayDown, short, when } from "@/components/ui";
import { CopyButton } from "@/components/copy";

/** One purchase: where the money went, hop by hop, with every id support may need. */
export default async function BuyPage({ params }: PageProps<"/buys/[id]">) {
  await requireAdmin();
  const { id } = await params;
  let b: AdminBuy;
  try {
    b = await relay.buy(id);
  } catch (e) {
    if (e instanceof RelayError && /404/.test(e.message)) notFound();
    return <RelayDown message={e instanceof RelayError ? e.message : "Unexpected error"} />;
  }
  const rows: [string, string | null | undefined, string | undefined][] = [
    ["Support ID", b.id, undefined],
    ["User's Paya address (NEAR)", b.account_id, explorer.nearAccount(b.account_id)],
    ["PAJ order id", b.paj_order_id, undefined],
    ["User paid into", `${b.pay_bank} ${b.pay_account_number}`, undefined],
    ["USDC from PAJ (Solana tx)", b.paj_tx, b.paj_tx ? explorer.solanaTx(b.paj_tx) : undefined],
    ["Intents deposit address (Solana)", b.deposit_address, b.deposit_address ? explorer.solanaAccount(b.deposit_address) : undefined],
    ["NEAR delivered / refund (NEAR tx)", b.out_tx, b.out_tx ? explorer.nearTx(b.out_tx) : undefined],
    ["NEAR Intents support ref", b.intents_ref, undefined],
  ];
  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-950">
        ← Transactions
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Purchase · {b.fiat_amount.toLocaleString("en-US")} {b.currency}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {b.status} · PAJ {b.payment_status ?? "—"} · Intents {b.swap_status ?? "—"} · created {when(b.created_at)}
          {b.demo ? " · simulated" : ""}
        </p>
      </div>
      <Card>
        <h2 className="text-sm font-semibold">Identifiers</h2>
        <dl className="mt-3 divide-y divide-neutral-100 text-sm">
          {rows.map(([k, v, href]) => (
            <div key={k} className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-neutral-500">{k}</dt>
              <dd className="flex min-w-0 items-center gap-1">
                {v ? (
                  <>
                    {href ? (
                      <a href={href} target="_blank" rel="noreferrer" title={v} className="truncate font-mono text-xs text-blue-700 hover:underline">
                        {short(v, 10)}
                      </a>
                    ) : (
                      <span className="truncate font-mono text-xs" title={v}>
                        {short(v, 10)}
                      </span>
                    )}
                    <CopyButton value={v} label={k} />
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card>
        <h2 className="text-sm font-semibold">Timeline</h2>
        <ol className="mt-3 space-y-2 text-sm">
          {(b.events ?? []).map((e, i) => (
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
