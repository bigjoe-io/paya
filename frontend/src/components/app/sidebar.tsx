"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowLeftRight, CircleUser, Clock, LogIn, LogOut, MessageSquare, TrendingUp, Wallet } from "lucide-react";
import { Logo } from "@/components/logo";
import { shortAddress, useAccount } from "@/components/app/account-provider";
import { useSession } from "@/components/app/session-provider";
import { SignInDialog } from "@/components/app/sign-in-dialog";
import { cn } from "@/lib/utils";
import { SUPPORT_URL } from "@/lib/links";

const main = [
  { href: "/app", label: "Swap", icon: ArrowLeftRight },
  { href: "/app/wallet", label: "Wallet", icon: Wallet },
];
const markets = [{ href: "/app/earn", label: "Earn", icon: TrendingUp, soon: true }];
const more = [
  { href: "/app/activity", label: "Activity", icon: Clock },
  { href: "/app/account", label: "Account", icon: CircleUser },
];

export const allNav = [...main, ...markets, ...more];

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}


export function Sidebar() {
  const pathname = usePathname();

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
        href={SUPPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="focus-ring flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-foreground transition-colors duration-100 hover:bg-panel/70"
      >
        <MessageSquare className="size-4" aria-hidden="true" />
        Give feedback
      </a>

      <AccountCard />
    </aside>
  );
}

function AccountCard() {
  const { signedIn, email, signOut } = useSession();
  const { me } = useAccount();
  const [open, setOpen] = useState(false);

  if (!signedIn) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="focus-ring mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-foreground text-sm font-medium text-background transition-colors duration-100 hover:bg-foreground/90"
        >
          <LogIn className="size-4" aria-hidden="true" />
          Sign in with email
        </button>
        <SignInDialog open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  return (
    <div className="glass-card mt-2 rounded-2xl p-3">
      <Link href="/app/account" className="focus-ring block rounded-lg">
        <p className="truncate text-sm font-medium" title={email ?? undefined}>
          {email}
        </p>
        <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground tabular-nums" title={me?.address}>
          {me ? shortAddress(me.address) : "…"}
        </p>
      </Link>
      <button
        type="button"
        onClick={signOut}
        className="focus-ring mt-2 inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground transition-colors duration-100 hover:text-foreground"
      >
        <LogOut className="size-3.5" aria-hidden="true" />
        Sign out
      </button>
    </div>
  );
}

type NavItem = { href: string; label: string; icon: typeof TrendingUp; soon?: boolean };

function NavGroup({ title, items, pathname }: { title?: string; items: NavItem[]; pathname: string }) {
  return (
    <div>
      {title && <p className="mb-2 px-3 text-xs font-medium text-muted-foreground">{title}</p>}
      <ul className="space-y-1">
        {items.map(({ href, label, icon: Icon, soon }) => {
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
                {soon && (
                  <span className="ml-auto rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
                    Soon
                  </span>
                )}
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
      <ul className="grid grid-cols-4">
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
