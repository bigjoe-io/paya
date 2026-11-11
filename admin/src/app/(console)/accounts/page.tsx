import Link from "next/link";
import { Search } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { relay, RelayError, type AdminUser } from "@/lib/relay";
import { Card, RelayDown, when } from "@/components/ui";

export default async function AccountsPage({ searchParams }: PageProps<"/accounts">) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  let list: AdminUser[];
  try {
    list = await relay.users(q);
  } catch (e) {
    return <RelayDown message={e instanceof RelayError ? e.message : "Unexpected error"} />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="mt-1 text-sm text-neutral-500">Every user: email, their NEAR address and linked bank. Newest first.</p>
      </div>

      <form className="flex gap-2" role="search">
        <label className="relative flex-1">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Email, NEAR address, account number, name…"
            className="min-h-10 w-full rounded-xl border border-neutral-300 bg-white pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          />
        </label>
        <button type="submit" className="min-h-10 rounded-xl bg-neutral-950 px-4 text-sm font-medium text-white">
          Search
        </button>
        {q && (
          <Link href="/accounts" className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm text-neutral-600 hover:text-neutral-950">
            Clear
          </Link>
        )}
      </form>

      <Card className="overflow-x-auto p-0">
        {list.length === 0 ? (
          <p className="p-8 text-center text-sm text-neutral-500">{q ? "No account matches." : "No accounts yet."}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 text-xs text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">NEAR address</th>
                <th className="px-4 py-3 font-medium">Bank</th>
                <th className="px-4 py-3 font-medium">Auto</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {list.map((u) => (
                <tr key={u.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <Link href={`/accounts/${u.id}`} className="font-medium text-blue-700 hover:underline">
                      {u.email}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{u.address.slice(0, 10)}…{u.address.slice(-6)}</td>
                  <td className="px-4 py-3">
                    {u.bank_name ? (
                      <>
                        {u.account_name}
                        <span className="block font-mono text-xs text-neutral-500">
                          {u.bank_name} · {u.account_number} · {u.currency}
                        </span>
                      </>
                    ) : (
                      <span className="text-neutral-400">Not linked</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{u.auto_cashout ? "On" : "Off"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-neutral-500">{when(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
