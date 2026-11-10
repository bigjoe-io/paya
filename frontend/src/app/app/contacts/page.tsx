"use client";

import Link from "next/link";
import { ArrowRight, Landmark, Plus } from "lucide-react";
import { Topbar } from "@/components/app/topbar";
import { Card, EmptyState, PageTitle } from "@/components/app/ui";
import { useWallet } from "@/components/app/wallet-provider";
import { contacts } from "@/lib/mock";

export default function ContactsPage() {
  const { accountId, connect, connecting } = useWallet();

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-4xl px-4 pb-12 lg:px-6">
        <div className="flex items-center justify-between gap-4">
          <PageTitle>Contacts</PageTitle>
          {accountId && (
            <button
              type="button"
              className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-medium text-background hover:bg-foreground/90"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add contact
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Bank accounts you&apos;ve paid before. Names are verified with the bank when you add them.
        </p>

        {!accountId ? (
          <div className="mt-6">
            <EmptyState
              title="No contacts yet"
              body="Connect your wallet. Every bank account you cash out to is saved here for next time."
              action={
                <button
                  type="button"
                  onClick={connect}
                  disabled={connecting}
                  className="focus-ring min-h-11 rounded-xl bg-foreground px-5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-60"
                >
                  {connecting ? "Connecting…" : "Connect wallet"}
                </button>
              }
            />
          </div>
        ) : (
          <Card className="mt-6 divide-y divide-border">
            {contacts.map((c) => (
              <Link
                key={c.id}
                href={`/app/cash-out?to=${c.id}`}
                className="focus-ring group flex items-center gap-4 px-5 py-4 transition-colors duration-100 first:rounded-t-2xl last:rounded-b-2xl hover:bg-foreground/[0.03]"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-foreground/10 text-sm font-medium">
                  {initials(c.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Landmark className="size-3.5" aria-hidden="true" />
                    {c.bank} <span className="font-mono tabular-nums">{c.accountMasked}</span>
                  </span>
                </span>
                <span className="hidden text-sm text-muted-foreground sm:block">
                  Last used{" "}
                  {new Date(c.lastUsed).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
                <ArrowRight
                  className="size-4 text-muted-foreground transition-transform duration-100 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </Card>
        )}
      </main>
    </>
  );
}

function initials(name: string) {
  return name
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
