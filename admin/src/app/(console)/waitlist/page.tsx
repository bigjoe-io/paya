import { Download } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { relay, RelayError } from "@/lib/relay";
import { Card, RelayDown, when } from "@/components/ui";

export default async function WaitlistPage() {
  await requireAdmin();
  let list: Awaited<ReturnType<typeof relay.waitlist>>;
  try {
    list = await relay.waitlist();
  } catch (e) {
    return <RelayDown message={e instanceof RelayError ? e.message : "Unexpected error"} />;
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Waitlist</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {list.length} {list.length === 1 ? "person" : "people"} signed up on usepaya.xyz. Newest first.
          </p>
        </div>
        <a
          href="/waitlist/export"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-neutral-950 px-4 text-sm font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <Download className="size-4" aria-hidden="true" /> Download CSV
        </a>
      </div>
      <Card className="overflow-x-auto p-0">
        {list.length === 0 ? (
          <p className="p-8 text-center text-sm text-neutral-500">No sign-ups yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 text-xs text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">From</th>
                <th className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {list.map((w) => (
                <tr key={w.id}>
                  <td className="px-4 py-3 font-medium">{w.email}</td>
                  <td className="px-4 py-3 text-neutral-500">{w.source ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-neutral-500">{when(w.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
