import type { ReactNode } from "react";
import { KeyRound, Lock, ScanFace } from "lucide-react";
import { TabbedPanel, type Tab } from "@/components/landing/tabbed-panel";

const tabs: Tab[] = [
  {
    id: "escrow",
    label: "Escrow until your bank confirms",
    description:
      "Your NEAR sits in a smart contract, not with us. It is released only when the payout succeeds, and refunded automatically if it fails.",
    panel: <EscrowPanel />,
  },
  {
    id: "keys",
    label: "Limited keys, limited damage",
    description:
      "Paya's servers hold a function-call key that can only confirm or refund an order. It cannot move your funds anywhere else.",
    panel: <KeysPanel />,
  },
  {
    id: "login",
    label: "Login the way you already do",
    description:
      "Sign in with your NEAR wallet or with a passkey. No seed phrase to copy down, nothing to lose.",
    panel: <LoginPanel />,
  },
];

export function Security() {
  return (
    <>
      <TabbedPanel
        id="security"
        heading="Bank-grade security, enforced by code"
        tabs={tabs}
      />

      <section className="container-page grid gap-4 md:grid-cols-2">
        <article className="min-h-96 rounded-4xl bg-inverse p-8 text-inverse-foreground md:min-h-120 md:p-12">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-inverse-foreground/10">
            <Lock className="size-8" aria-hidden="true" />
          </span>
          <h3 className="mt-28 text-2xl font-semibold tracking-tight md:mt-40 md:text-3xl">
            NEAR&apos;s security standard
          </h3>
          <p className="mt-3 max-w-xl text-lg text-inverse-muted text-pretty">
            Paya runs on NEAR smart contracts, so every order, rate, and payout
            is recorded on-chain and verifiable by anyone.
          </p>
        </article>

        <article className="min-h-96 rounded-4xl bg-card p-8 md:min-h-120 md:p-12">
          <span className="flex size-20 items-center justify-center rounded-full bg-accent-soft">
            <span className="flex size-14 items-center justify-center rounded-full bg-accent/15">
              <KeyRound className="size-6 text-accent" aria-hidden="true" />
            </span>
          </span>
          <h3 className="mt-24 text-2xl font-semibold tracking-tight md:mt-36 md:text-3xl">
            Your money. Your control.
          </h3>
          <p className="mt-3 max-w-xl text-lg text-muted-foreground text-pretty">
            Paya never takes custody. Your ownership is enforced by NEAR&apos;s
            validator network — not by an exchange, and not by us.
          </p>
        </article>
      </section>
    </>
  );
}

/* Panels */

function GridPanel({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex w-full items-center justify-center self-stretch">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-1/2 h-px -translate-y-24 bg-border"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-1/2 h-px translate-y-24 bg-border"
      />
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 hidden w-px -translate-x-56 bg-border md:block"
      />
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 hidden w-px translate-x-56 bg-border md:block"
      />
      <div className="relative">{children}</div>
    </div>
  );
}

function EscrowPanel() {
  return (
    <GridPanel>
      <div className="flex items-center gap-6">
        <span className="flex size-24 items-center justify-center rounded-3xl bg-background shadow-sm">
          <Lock className="size-12" aria-hidden="true" />
        </span>
        <span className="text-3xl text-muted-foreground" aria-hidden="true">
          +
        </span>
        <span className="flex size-24 items-center justify-center rounded-3xl bg-accent font-mono text-2xl font-semibold text-white tabular-nums">
          ₦
        </span>
      </div>
    </GridPanel>
  );
}

function KeysPanel() {
  return (
    <GridPanel>
      <div className="flex items-center gap-6">
        <span className="flex size-24 items-center justify-center rounded-3xl bg-background shadow-sm">
          <KeyRound className="size-12" aria-hidden="true" />
        </span>
        <div className="rounded-2xl bg-background px-5 py-4 font-mono text-sm shadow-sm">
          <p className="text-muted-foreground">allowed methods</p>
          <p className="mt-1">confirm · refund</p>
        </div>
      </div>
    </GridPanel>
  );
}

function LoginPanel() {
  return (
    <GridPanel>
      <div className="flex items-center gap-6">
        <span className="flex size-24 items-center justify-center rounded-3xl bg-background shadow-sm">
          <ScanFace className="size-12" aria-hidden="true" />
        </span>
        <span className="text-3xl text-muted-foreground" aria-hidden="true">
          +
        </span>
        <span className="flex size-24 items-center justify-center rounded-3xl bg-accent text-2xl font-semibold text-white">
          2FA
        </span>
      </div>
    </GridPanel>
  );
}
