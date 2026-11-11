import Link from "next/link";
import { ArrowLeftRight, TrendingUp } from "lucide-react";
import { Topbar } from "@/components/app/topbar";
import { NearIcon } from "@/components/landing/icons";

export default function EarnPage() {
  return (
    <>
      <Topbar />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 pb-16 text-center">
        <div className="relative">
          <span className="flex size-20 items-center justify-center rounded-3xl bg-foreground text-background">
            <NearIcon className="size-9" />
          </span>
          <span className="absolute -right-2 -bottom-2 flex size-9 items-center justify-center rounded-full bg-accent text-white ring-4 ring-background">
            <TrendingUp className="size-4" aria-hidden="true" />
          </span>
        </div>

        <span className="mt-8 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium tracking-wide text-accent uppercase">
          Coming soon
        </span>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-balance md:text-4xl">Earn by staking NEAR</h1>
        <p className="mt-3 max-w-md text-muted-foreground text-pretty">
          You&apos;ll soon be able to stake your NEAR, earn rewards, and cash them out to your bank in one click.
        </p>

        <Link
          href="/app"
          className="focus-ring mt-8 inline-flex min-h-11 items-center gap-2 rounded-xl bg-foreground px-5 text-sm font-medium text-background transition-colors duration-100 hover:bg-foreground/90"
        >
          <ArrowLeftRight className="size-4" aria-hidden="true" />
          Swap NEAR to cash
        </Link>
      </main>
    </>
  );
}
