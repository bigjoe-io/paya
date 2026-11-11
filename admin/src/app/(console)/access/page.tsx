import { requireAdmin } from "@/lib/session";
import { relay, RelayError, type AccessCode } from "@/lib/relay";
import { Card, RelayDown, when } from "@/components/ui";
import { CreateCode } from "./create";
import { revokeCode } from "./actions";

function state(c: AccessCode) {
  if (c.revoked) return { label: "Switched off", cls: "bg-neutral-100 text-neutral-600" };
  if (c.expires_at && Date.parse(c.expires_at) < Date.now()) return { label: "Expired", cls: "bg-neutral-100 text-neutral-600" };
  if (c.max_uses !== null && c.uses >= c.max_uses) return { label: "Used up", cls: "bg-amber-50 text-amber-800" };
  return { label: "Active", cls: "bg-green-50 text-green-700" };
}

export default async function AccessPage() {
  await requireAdmin();
  let data: Awaited<ReturnType<typeof relay.accessCodes>>;
  try {
    data = await relay.accessCodes();
  } catch (e) {
    return <RelayDown message={e instanceof RelayError ? e.message : "Unexpected error"} />;
  }
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tester access</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Codes that unlock the app at <span className="font-mono">usepaya.xyz/admin</span> for 30 days on a device. Switching a code off locks out everyone who used it.
        </p>
      </div>
      {!data.enabled && (
        <Card className="border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Private testing is <strong>off</strong> on the relay: the app is open to everyone. Set <span className="font-mono">ACCESS_SECRET</span> on Render (and on the website) to switch it on.
        </Card>
      )}
      <Card>
        <h2 className="text-sm font-semibold">New code</h2>
        <div className="mt-3">
          <CreateCode />
        </div>
      </Card>
      <Card className="overflow-x-auto p-0">
        {data.codes.length === 0 ? (
          <p className="p-8 text-center text-sm text-neutral-500">No codes yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 text-xs text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">For</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Used</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {data.codes.map((c) => {
                const s = state(c);
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium">{c.label}</td>
                    <td className="px-4 py-3 font-mono text-xs text-neutral-500">PAYA-••••-{c.last4}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {c.uses}
                      {c.max_uses !== null ? ` / ${c.max_uses}` : ""}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-neutral-500">{c.expires_at ? when(c.expires_at) : "Never"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!c.revoked && (
                        <form action={revokeCode.bind(null, c.id)}>
                          <button type="submit" className="rounded-lg px-2 py-1 text-xs font-medium text-red-700 outline-none hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-blue-600">
                            Switch off
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
