import type { ReactNode } from "react";
import { ArrowRight, BadgeCheck, ShieldCheck } from "lucide-react";
import { NearIcon } from "@/components/landing/icons";
import { ElectricLines, Glow, PerspectiveGrid } from "@/components/landing/fx";
import { cn } from "@/lib/utils";

/** "Paya isn't another exchange" + Fuse-style tile grid. */
export function Bento() {
  return (
    <section id="features" className="container-page scroll-mt-20 py-16 md:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">Paya isn&apos;t another exchange.</h2>
        <p className="mt-3 text-muted-foreground text-pretty">
          No P2P chats, no order books, no waiting on a trader. Your NEAR goes from your wallet to your bank account in a
          single transaction, and we never hold it.
        </p>
      </div>

      <div className="mt-10 grid gap-3 md:grid-cols-[1.25fr_1fr_1fr] md:grid-rows-[15rem_15rem]">
        <FlowTile />
        <Tile title={<>Cash out NEAR<br />in one click</>}>
          <span className="inline-flex items-center rounded-full bg-background p-1 pr-4 shadow-sm">
            <span className="flex size-9 items-center justify-center rounded-full bg-foreground text-background">
              <NearIcon className="size-4" />
            </span>
            <span className="-ml-2 flex size-9 items-center justify-center rounded-full bg-success text-sm font-semibold text-white ring-4 ring-background">
              ₦
            </span>
            <span className="ml-2.5 text-xs text-muted-foreground">1 signature</span>
          </span>
        </Tile>
        <Tile title={<>Real names,<br />checked with the bank</>}>
          <span className="inline-flex items-center gap-2 rounded-2xl bg-background px-3 py-2 shadow-sm">
            <BadgeCheck className="size-4 text-success" aria-hidden="true" />
            <span className="text-xs">
              <span className="block font-medium">ADAEZE OKAFOR</span>
              <span className="font-mono text-muted-foreground">GTBank •••• 4821</span>
            </span>
          </span>
        </Tile>
        <Tile title={<>Live rates,<br />every fee shown</>}>
          <span className="inline-flex items-center gap-2 rounded-full bg-background px-3 py-2 font-mono text-xs shadow-sm tabular-nums">
            1 NEAR ≈ ₦5,041
            <span className="rounded-full bg-success-soft px-1.5 py-0.5 text-[10px] text-success">live</span>
          </span>
        </Tile>
        <Tile title={<>Non-custodial<br />by design</>}>
          <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft">
            <ShieldCheck className="size-6 text-accent" aria-hidden="true" />
          </span>
        </Tile>
      </div>
    </section>
  );
}

function FlowTile() {
  const steps = [
    { label: "Your wallet", sub: "NEAR" },
    { label: "NEAR Intents", sub: "→ USDC" },
    { label: "Your bank", sub: "₦ · GH₵ · KSh" },
  ];
  return (
    <article
      className="relative overflow-hidden rounded-4xl p-7 text-white md:row-span-2"
      style={{ background: "var(--gradient-dark)" }}
    >
      <Glow className="-top-20 -right-10 size-64 opacity-60" />
      <PerspectiveGrid />
      <ElectricLines />
      <div className="relative flex h-full min-h-72 flex-col justify-between">
        <ol className="flex flex-col gap-2 sm:flex-row sm:items-center" aria-label="How money moves">
          {steps.map((s, i) => (
            <li key={s.label} className="flex min-w-0 flex-1 items-center gap-2">
              <span className="min-w-0 flex-1 rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/15 backdrop-blur-sm">
                <span className="block truncate text-xs font-medium">{s.label}</span>
                <span className="block truncate text-[11px] text-white/60">{s.sub}</span>
              </span>
              {i < steps.length - 1 && (
                <ArrowRight className="hidden size-3.5 shrink-0 text-white/50 sm:block" aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>
        <p className="mt-10 max-w-xs text-2xl font-medium text-pretty">
          From your wallet <span className="text-white/65">to your bank account in a single transaction</span>
        </p>
      </div>
    </article>
  );
}

function Tile({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <article className={cn("flex min-h-44 flex-col justify-between rounded-4xl bg-card p-6 md:min-h-56", className)}>
      <div>{children}</div>
      <h3 className="mt-8 text-lg font-medium tracking-tight text-pretty">{title}</h3>
    </article>
  );
}
