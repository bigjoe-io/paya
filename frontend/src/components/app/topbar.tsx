"use client";

import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, HelpCircle } from "lucide-react";
import { Logo } from "@/components/logo";
import { useSession } from "@/components/app/session-provider";

export function Topbar({ title, backHref }: { title?: string; backHref?: string }) {
  const { hidden, toggleHidden, me } = useSession();

  return (
    <header className="flex h-14 items-center justify-between gap-3 px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {backHref ? (
          <Link
            href={backHref}
            className="focus-ring -ml-2 flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <Link href="/" className="focus-ring rounded-full lg:hidden" aria-label="Paya home">
            <Logo />
          </Link>
        )}
        {title && <h1 className="truncate text-base font-medium">{title}</h1>}
      </div>

      <div className="flex items-center gap-1">
        {me?.network === "testnet" && (
          <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">Testnet</span>
        )}
        <button
          type="button"
          onClick={toggleHidden}
          aria-pressed={hidden}
          aria-label={hidden ? "Show balances" : "Hide balances"}
          className="focus-ring flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors duration-100 hover:bg-panel/70 hover:text-foreground"
        >
          {hidden ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
        </button>
        <a
          href="https://github.com/letsdap/paya#readme"
          aria-label="Help"
          className="focus-ring flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors duration-100 hover:bg-panel/70 hover:text-foreground"
        >
          <HelpCircle className="size-5" aria-hidden="true" />
        </a>
      </div>
    </header>
  );
}
