"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronUp,
  Clock,
  Coins,
  Home,
  MessageSquare,
  Search,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { useWallet } from "@/components/app/wallet-provider";
import { cn } from "@/lib/utils";

const main = [{ href: "/app", label: "Home", icon: Home }];
const markets = [
  { href: "/app/crypto", label: "Crypto", icon: Coins },
  { href: "/app/earn", label: "Earn", icon: TrendingUp },
];
const more = [
  { href: "/app/activity", label: "Activity", icon: Clock },
  { href: "/app/contacts", label: "Contacts", icon: Users },
];

export const allNav = [...main, ...markets, ...more];

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();
  const { accountId, connecting, connect, disconnect } = useWallet();

  return (
    <aside className="hidden w-72 shrink-0 flex-col bg-sidebar p-4 lg:flex">
      <Link href="/" className="focus-ring inline-flex rounded-full px-2 py-1" aria-label="Paya home">
        <Logo />
      </Link>

      <button
        type="button"
        className="focus-ring mt-6 flex min-h-11 w-full items-center gap-3 rounded-xl border border-border bg-panel px-3 text-sm text-muted-foreground transition-colors duration-100 hover:text-foreground"
      >
        <Search className="size-4" aria-hidden="true" />
        <span className="flex-1 text-left">Search markets</span>
        <kbd className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px]">⌘K</kbd>
      </button>

      <nav aria-label="App" className="mt-4 flex flex-1 flex-col gap-6">
        <NavGroup items={main} pathname={pathname} />
        <NavGroup title="Markets" items={markets} pathname={pathname} />
        <NavGroup items={more} pathname={pathname} />
      </nav>

      <a
        href="https://github.com/letsdap/paya/issues"
        className="focus-ring flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-foreground transition-colors duration-100 hover:bg-panel"
      >
        <MessageSquare className="size-4" aria-hidden="true" />
        Give feedback
      </a>

      {accountId ? (
        <button
          type="button"
          onClick={disconnect}
          className="focus-ring mt-2 flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border bg-panel px-3 text-left transition-colors duration-100 hover:bg-panel/70"
          aria-label={`Connected as ${accountId}. Disconnect wallet`}
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Wallet className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{accountId}</span>
            <span className="block text-xs text-muted-foreground">NEAR wallet</span>
          </span>
          <ChevronUp className="size-4 text-muted-foreground" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={connect}
          disabled={connecting}
          className="focus-ring mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-medium text-primary-foreground transition-colors duration-100 hover:bg-primary/85 disabled:opacity-60"
        >
          <Wallet className="size-4" aria-hidden="true" />
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
      )}
    </aside>
  );
}

function NavGroup({
  title,
  items,
  pathname,
}: {
  title?: string;
  items: typeof allNav;
  pathname: string;
}) {
  return (
    <div>
      {title && (
        <p className="mb-2 px-3 text-xs font-medium text-muted-foreground">{title}</p>
      )}
      <ul className="space-y-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-ring flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors duration-100",
                  active
                    ? "bg-panel font-medium text-foreground shadow-sm"
                    : "text-foreground/80 hover:bg-panel hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Bottom tab bar for phones; the sidebar is hidden below `lg`. */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="App"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-sidebar pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {allNav.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-ring flex min-h-14 flex-col items-center justify-center gap-1 text-[11px]",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
