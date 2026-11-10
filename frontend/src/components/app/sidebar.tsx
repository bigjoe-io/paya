"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, Coins, Home, Landmark, LogOut, MessageSquare, TrendingUp } from "lucide-react";
import { Logo } from "@/components/logo";
import { useSession } from "@/components/app/session-provider";
import { cn } from "@/lib/utils";

const main = [{ href: "/app", label: "Home", icon: Home }];
const markets = [
  { href: "/app/crypto", label: "Crypto", icon: Coins },
  { href: "/app/earn", label: "Earn", icon: TrendingUp },
];
const more = [
  { href: "/app/activity", label: "Activity", icon: Clock },
  { href: "/app/contacts", label: "Bank account", icon: Landmark },
];

export const allNav = [...main, ...markets, ...more];

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();
  const { email, me, logout } = useSession();

  return (
    <aside className="hidden w-72 shrink-0 flex-col p-4 lg:flex">
      <Link href="/" className="focus-ring inline-flex rounded-full px-2 py-1" aria-label="Paya home">
        <Logo />
      </Link>

      <nav aria-label="App" className="mt-8 flex flex-1 flex-col gap-6">
        <NavGroup items={main} pathname={pathname} />
        <NavGroup title="Markets" items={markets} pathname={pathname} />
        <NavGroup items={more} pathname={pathname} />
      </nav>

      <a
        href="https://github.com/letsdap/paya/issues"
        className="focus-ring flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-foreground transition-colors duration-100 hover:bg-panel/70"
      >
        <MessageSquare className="size-4" aria-hidden="true" />
        Give feedback
      </a>

      <div className="glass-card mt-2 rounded-2xl p-3">
        <p className="truncate text-sm font-medium">{email}</p>
        <p className="truncate font-mono text-xs text-muted-foreground tabular-nums">
          {me?.depositAccount ?? "creating your address…"}
        </p>
        <button
          type="button"
          onClick={logout}
          className="focus-ring mt-2 inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground transition-colors duration-100 hover:text-foreground"
        >
          <LogOut className="size-3.5" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

function NavGroup({ title, items, pathname }: { title?: string; items: typeof allNav; pathname: string }) {
  return (
    <div>
      {title && <p className="mb-2 px-3 text-xs font-medium text-muted-foreground">{title}</p>}
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
                  active ? "glass-card font-medium text-foreground" : "text-foreground/80 hover:bg-panel/70 hover:text-foreground",
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
      className="glass fixed inset-x-0 bottom-0 z-40 border-t border-border pb-[env(safe-area-inset-bottom)] lg:hidden"
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
