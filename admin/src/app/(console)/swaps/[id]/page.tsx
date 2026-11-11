import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/session";
import { relay, RelayError, type AdminSwap, type SwapEvent } from "@/lib/relay";
import { Card, explorer, money, RelayDown, short, SimBadge, StatusBadge, when, yoctoToNear } from "@/components/ui";
import { CopyButton } from "@/components/copy";
import { Recheck } from "./recheck";

export default async function SwapPage({ params }: PageProps<"/swaps/[id]">) {
  await requireAdmin();
  const { id } = await params;
  let s: AdminSwap;
  try {
    s = await relay.swap(id);
  } catch (e) {
    if (e instanceof RelayError && /404/.test(e.message)) notFound();
    return <RelayDown message={e instanceof RelayError ? e.message : "Unexpected error"} />;
  }

  const near = yoctoToNear(s.amount_in);

  return (
    <div className="space-y-5">
      <Link href="/" className="inline-flex items-center gap-1.5 rounded text-sm text-neutral-600 hover:text-neutral-950">
        <ArrowLeft className="size-4" aria-hidden="true" />
        All transactions
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-xl font-semibold">{s.id}</h1>
            <CopyButton value={s.id} label="swap id" />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-600">
            <StatusBadge status={s.status} />
            {s.demo ? <SimBadge /> : null}
            <span>Created {when(s.created_at)} · updated {when(s.updated_at)}</span>
          </p>
        </div>
        {!s.demo && <Recheck id={s.id} />}
      </div>

      {s.error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-medium">Last error:</span> {s.error}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Money</h2>
          <dl className="mt-3 divide-y divide-neutral-100 text-sm">
            <Row k="NEAR sent (max, incl. 1% buffer)" v={`${near.toFixed(6)} NEAR`} />
            <Row k="Min NEAR needed" v={s.min_amount_in ? `${yoctoToNear(s.min_amount_in).toFixed(6)} NEAR` : "—"} />
            <Row k="USDC to PAJ (exact)" v={`${s.amount_to_transfer} USDC`} />
            <Row k="USDC payout priced on" v={`${s.usdc_amount} USDC`} />
            <Row k="Paya fee" v={`${s.fee_usdc} USDC`} />
            <Row k="Rate" v={`${money(s.rate, 2)} ${s.currency}/USDC`} />
            <Row k="Recipient gets" v={<strong>{`${money(s.fiat_amount, 0)} ${s.currency}`}</strong>} />
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">People</h2>
          <dl className="mt-3 divide-y divide-neutral-100 text-sm">
            <Row k="User wallet" v={<Id value={s.account_id} href={explorer.nearAccount(s.account_id)} />} />
            <Row k="Recipient" v={s.account_name} />
            <Row k="Bank" v={`${s.bank_name} (${s.bank_id})`} />
            <Row k="Account number" v={<Id value={s.account_number} />} />
            <Row k="Currency" v={s.currency} />
          </dl>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Identifiers</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Everything a user, PAJ or NEAR Intents support might quote. Each links to its public explorer.
        </p>
        <dl className="mt-3 divide-y divide-neutral-100 text-sm">
          <Row k="NEAR tx (Paya address → Intents)" v={s.deposit_tx ? <Id value={s.deposit_tx} href={s.demo ? undefined : explorer.nearTx(s.deposit_tx)} /> : "—"} />
          <Row k="Intents deposit address (NEAR)" v={s.deposit_address ? <Id value={s.deposit_address} href={explorer.nearAccount(s.deposit_address)} /> : "—"} />
          <Row k="PAJ order id" v={s.paj_order_id ? <Id value={s.paj_order_id} /> : "—"} />
          <Row k="PAJ deposit address (Solana)" v={s.receive_address ? <Id value={s.receive_address} href={explorer.solanaAccount(s.receive_address)} /> : "—"} />
          <Row
            k="Payout reference / Solana signature"
            v={s.payment_reference ? <Id value={s.payment_reference} href={s.demo ? undefined : explorer.solanaTx(s.payment_reference)} /> : "—"}
          />
          <Row
            k={s.status === "refunded" ? "Refund tx (NEAR back to user)" : "Provider → Paya wallet (Solana tx)"}
            v={s.out_tx ? <Id value={s.out_tx} href={s.status === "refunded" ? explorer.nearTx(s.out_tx) : explorer.solanaTx(s.out_tx)} /> : "—"}
          />
          <Row k="Rail · provider" v={`${s.rail ?? "intents (legacy)"}${s.provider ? ` · ${s.provider}` : ""}`} />
          <Row k="Provider exchange id" v={s.exchange_id ? <Id value={s.exchange_id} /> : "—"} />
          <Row k="USDC received in Paya wallet" v={s.usdc_received ?? "—"} />
          <Row k="USDC to PAJ (Paya wallet tx)" v={s.payout_tx ? <Id value={s.payout_tx} href={explorer.solanaTx(s.payout_tx)} /> : "—"} />
          <Row k="NEAR Intents support ref (legacy)" v={s.intents_ref ? <Id value={s.intents_ref} /> : "—"} />
          <Row k="Intents status (last seen)" v={s.swap_status ?? "—"} />
          <Row k="PAJ status (last seen)" v={s.payout_status ?? "—"} />
        </dl>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Timeline</h2>
        {!s.events?.length ? (
          <p className="mt-3 text-sm text-neutral-500">No events recorded (created before the timeline existed).</p>
        ) : (
          <ol className="mt-4 space-y-4 border-l border-neutral-200 pl-5">
            {s.events.map((e, i) => (
              <li key={i} className="relative">
                <span className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full border-2 border-white bg-neutral-400 ring-1 ring-neutral-300" aria-hidden="true" />
                <p className="text-sm">
                  <span className="font-medium">{describe(e)}</span>
                  <span className="ml-2 text-xs text-neutral-500 tabular-nums">{when(e.at)}</span>
                </p>
                {e.detail && (
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-700">
                    {JSON.stringify(e.detail, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

function describe(e: SwapEvent) {
  const d = e.detail ?? {};
  switch (e.type) {
    case "created":
      return "Order created";
    case "wallet_sent":
      return "User's wallet sent NEAR";
    case "swap_status":
      return `NEAR Intents → ${String(d.status)}`;
    case "payout_status":
      return `PAJ → ${String(d.status)}`;
    case "status":
      return `Status ${String(d.from)} → ${String(d.to)}`;
    case "error":
      return "Error while tracking";
    default:
      return e.type;
  }
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
      <dt className="text-neutral-500">{k}</dt>
      <dd className="min-w-0 text-right">{v}</dd>
    </div>
  );
}

function Id({ value, href }: { value: string; href?: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" title={value} className="inline-flex min-w-0 items-center gap-1 rounded font-mono text-xs text-blue-700 hover:underline">
          <span className="truncate">{short(value, 10)}</span>
          <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
        </a>
      ) : (
        <span className="truncate font-mono text-xs" title={value}>
          {short(value, 10)}
        </span>
      )}
      <CopyButton value={value} label="value" />
    </span>
  );
}
