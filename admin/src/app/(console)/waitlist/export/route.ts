import { isAdmin } from "@/lib/session";
import { relay } from "@/lib/relay";

/** CSV of the waitlist, for the signed-in admin only. */
export async function GET() {
  if (!(await isAdmin())) return new Response("Not found", { status: 404 });
  const list = await relay.waitlist();
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = ["email,source,joined_at", ...list.map((w) => [w.email, w.source ?? "", w.created_at].map(esc).join(","))].join("\n");
  return new Response(csv + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="paya-waitlist-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
