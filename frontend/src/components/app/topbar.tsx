"use client";

import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, HelpCircle, Wallet } from "lucide-react";
import { Logo } from "@/components/logo";
import { useWallet } from "@/components/app/wallet-provider";

export function Topbar({ title, backHref }: { title?: string; backHref?: string }) {
  const { hidden, toggleHidden, accountId, connect, connecting } = useWallet();

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
        <span className="hidden rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning sm:inline">
          Testnet
        </span>
        <button
          type="button"
          onClick={toggleHidden}
          aria-pressed={hidden}
          aria-label={hidden ? "Show balances" : "Hide balances"}
          className="focus-ring flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors duration-100 hover:bg-card hover:text-foreground"
        >
          {hidden ? (
            <EyeOff className="size-5" aria-hidden="true" />
          ) : (
            <Eye className="size-5" aria-hidden="true" />
          )}
        </button>
        <a
          href="https://github.com/letsdap/paya#readme"
          aria-label="Help"
          className="focus-ring flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors duration-100 hover:bg-card hover:text-foreground"
        >
          <HelpCircle className="size-5" aria-hidden="true" />
        </a>
        {!accountId && (
          <button
            type="button"
            onClick={connect}
            disabled={connecting}
            className="focus-ring ml-1 inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/85 disabled:opacity-60 lg:hidden"
          >
            <Wallet className="size-4" aria-hidden="true" />
            {connecting ? "Connecting…" : "Connect"}
          </button>
        )}
      </div>
    </header>
  );
}
