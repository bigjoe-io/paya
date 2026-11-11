import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { logout } from "@/app/login/actions";

export default async function ConsoleLayout({ children }: LayoutProps<"/">) {
  await requireAdmin();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 lg:px-6">
          <Link href="/" className="flex items-center gap-2 rounded-md font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
            <svg viewBox="0 0 100 100" className="size-6" aria-hidden="true">
              <circle cx="32" cy="50" r="30" />
              <path d="M68 20a30 30 0 0 1 0 60z" />
            </svg>
            Paya Admin
          </Link>
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-red-700 uppercase">Internal</span>
          <nav aria-label="Console" className="flex gap-1 text-sm">
            <Link href="/" className="rounded-lg px-3 py-2 text-neutral-700 outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-600">
              Transactions
            </Link>
            <Link href="/accounts" className="rounded-lg px-3 py-2 text-neutral-700 outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-600">
              Accounts
            </Link>
            <Link href="/waitlist" className="rounded-lg px-3 py-2 text-neutral-700 outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-600">
              Waitlist
            </Link>
            <Link href="/access" className="rounded-lg px-3 py-2 text-neutral-700 outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-600">
              Tester access
            </Link>
            <Link href="/audit" className="rounded-lg px-3 py-2 text-neutral-700 outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-600">
              Audit log
            </Link>
          </nav>
          <form action={logout} className="ml-auto">
            <button
              type="submit"
              className="inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm text-neutral-600 outline-none hover:bg-neutral-100 hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-6">{children}</main>
    </div>
  );
}
