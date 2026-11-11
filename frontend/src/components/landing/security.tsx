import type { ReactNode } from "react";
import { BadgeCheck, KeyRound, Landmark, RotateCcw, ShieldCheck } from "lucide-react";
import { TabbedPanel, type Tab } from "@/components/landing/tabbed-panel";
import { ElectricLines, Glow, PerspectiveGrid } from "@/components/landing/fx";

/** Security, as it actually works today. */
const tabs: Tab[] = [
  {
    id: "bank",
    label: "Paid only to your bank",
    description:
      "Cash-outs go only to the bank account you verified. Sending NEAR anywhere else needs a fresh code from your email, every time.",
    panel: <IconPair a={<Landmark className="size-10" aria-hidden="true" />} b={<KeyRound className="size-9 text-white" aria-hidden="true" />} />,
  },
  {
    id: "names",
    label: "Verified bank accounts",
    description: "Every bank account is checked with the bank and shows the holder's real name before you can pay it.",
    panel: <IconPair a={<BadgeCheck className="size-10" aria-hidden="true" />} b={<span className="text-2xl font-semibold text-white">₦</span>} />,
  },
  {
    id: "refunds",
    label: "Refunds built in",
    description: "If an exchange can't complete, your NEAR is returned to your Paya address automatically, and purchases retry with another provider.",
    panel: <IconPair a={<RotateCcw className="size-10" aria-hidden="true" />} b={<span className="font-mono text-lg font-semibold text-white">NEAR</span>} />,
  },
];

export function Security() {
  return (
    <>
      <TabbedPanel id="security" heading="Security that stays out of your way" tabs={tabs} reverse />

      <section className="container-page grid gap-3 md:grid-cols-2">
        <article className="relative min-h-80 overflow-hidden rounded-4xl bg-inverse p-8 text-inverse-foreground md:p-10">
          <Glow className="-bottom-24 -left-10 size-72 opacity-40" />
          <PerspectiveGrid />
          <ElectricLines className="opacity-60" />
          <div className="relative flex h-full flex-col justify-between">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-inverse-foreground/10 ring-1 ring-inverse-foreground/15">
              <ShieldCheck className="size-7" aria-hidden="true" />
            </span>
            <div className="mt-16">
              <h3 className="text-2xl font-semibold tracking-tight">Verifiable on-chain</h3>
              <p className="mt-2 max-w-md text-inverse-muted text-pretty">
                Every transfer is on-chain, and each order shows its NEAR and Solana transaction IDs so anyone can verify it.
              </p>
            </div>
          </div>
        </article>

        <article className="min-h-80 rounded-4xl bg-card p-8 md:p-10">
          <span className="flex size-16 items-center justify-center rounded-full bg-accent-soft">
            <span className="flex size-11 items-center justify-center rounded-full bg-accent/15">
              <KeyRound className="size-5 text-accent" aria-hidden="true" />
            </span>
          </span>
          <h3 className="mt-16 text-2xl font-semibold tracking-tight">Your money. Your control.</h3>
          <p className="mt-2 max-w-md text-muted-foreground text-pretty">
            Your balance sits at your own NEAR address, visible on-chain any time. Turn auto cash-out off to hold, or send it to any wallet with an email code.
          </p>
        </article>
      </section>
    </>
  );
}

function IconPair({ a, b }: { a: ReactNode; b: ReactNode }) {
  return (
    <div className="relative flex w-full items-center justify-center self-stretch">
      <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px -translate-y-20 bg-border" />
      <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px translate-y-20 bg-border" />
      <div aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px -translate-x-36 bg-border" />
      <div aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px translate-x-36 bg-border" />
      <div className="relative flex items-center gap-5">
        <span className="flex size-20 items-center justify-center rounded-3xl bg-background shadow-sm">{a}</span>
        <span className="text-2xl text-muted-foreground" aria-hidden="true">
          +
        </span>
        <span className="flex size-20 items-center justify-center rounded-3xl bg-accent shadow-sm">{b}</span>
      </div>
    </div>
  );
}
