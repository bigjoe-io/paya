"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, HelpCircle, LogIn } from "lucide-react";
import { Logo } from "@/components/logo";
import { useAccount } from "@/components/app/account-provider";
import { useSession } from "@/components/app/session-provider";
import { SignInDialog } from "@/components/app/sign-in-dialog";

export function Topbar({ title, backHref }: { title?: string; backHref?: string }) {
  const { hidden, toggleHidden } = useAccount();
  const { signedIn, email } = useSession();
  const [signIn, setSignIn] = useState(false);

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
        {/* Phones have no sidebar, so the account button lives here. */}
        <div className="lg:hidden">
          {signedIn ? (
            <Link
              href="/app/account"
              aria-label={`Account (${email})`}
              className="focus-ring ml-1 flex size-10 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background uppercase"
            >
              {email?.[0] ?? "?"}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setSignIn(true)}
              className="focus-ring ml-1 inline-flex min-h-10 items-center gap-2 rounded-full bg-foreground px-4 text-sm font-medium text-background"
            >
              <LogIn className="size-4" aria-hidden="true" />
              Sign in
            </button>
          )}
        </div>
      </div>
      <SignInDialog open={signIn} onClose={() => setSignIn(false)} />
    </header>
  );
}
