import { ArrowRight, Landmark, Lock, Percent } from "lucide-react";
import { TabbedPanel, type Tab } from "@/components/landing/tabbed-panel";
import { CoinIcon, NearIcon } from "@/components/landing/icons";

const tabs: Tab[] = [
  {
    id: "off-ramp",
    label: "Off-ramp",
    description:
      "Pick a bank, enter the account number, confirm the name, and send. Naira arrives before you close the tab.",
    panel: <OffRampPanel />,
  },
  {
    id: "bridge",
    label: "Bridge",
    description:
      "Move NEAR to Solana in the same flow. One confirmation, one fee shown up front, no third-party bridge UI.",
    panel: <BridgePanel />,
  },
  {
    id: "stake",
    label: "Stake",
    description:
      "Stake NEAR with a validator of your choice and cash out rewards whenever you want — straight to your bank.",
    panel: <StakePanel />,
  },
];

export function EverydayMoney() {
  return (
    <TabbedPanel
      id="how-it-works"
      heading={
        <>
          Use NEAR
          {" "}<br className="hidden md:block" />
          as everyday money
        </>
      }
      tabs={tabs}
    />
  );
}

/* Panels: static mock UI, built to be replaced by product screenshots later. */

function OffRampPanel() {
  return (
    <div className="w-full max-w-md">
      <div className="rounded-3xl bg-background p-5 shadow-sm">
        <p className="text-xs text-muted-foreground">Send to</p>
        <div className="mt-2 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-card">
            <Landmark className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">Adaeze Okafor</p>
            <p className="truncate font-mono text-sm text-muted-foreground tabular-nums">
              GTBank · 0123 4821
            </p>
          </div>
          <span className="ml-auto rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
            Verified
          </span>
        </div>
        <div className="mt-5 flex items-baseline justify-between border-t border-border pt-4">
          <span className="text-sm text-muted-foreground">Receives</span>
          <span className="font-mono text-3xl font-medium tabular-nums">
            ₦98,450
          </span>
        </div>
      </div>
      <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Lock className="size-4" aria-hidden="true" />
        Funds stay in escrow until the bank confirms.
      </p>
    </div>
  );
}

function BridgePanel() {
  return (
    <div className="flex items-center gap-4 md:gap-6">
      <span className="flex size-16 items-center justify-center rounded-full bg-foreground text-background md:size-20">
        <NearIcon className="size-8" />
      </span>
      <ArrowRight className="size-6 text-muted-foreground" aria-hidden="true" />
      <div className="flex">
        <CoinIcon label="SOL" className="size-16 ring-4 ring-card md:size-20" />
        <CoinIcon
          label="USDC"
          className="-ml-4 size-16 ring-4 ring-card md:size-20"
        />
      </div>
    </div>
  );
}

function StakePanel() {
  return (
    <div className="w-full max-w-md rounded-3xl bg-background p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Staked</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
          <Percent className="size-3.5" aria-hidden="true" />
          8.9% APY
        </span>
      </div>
      <p className="mt-2 font-mono text-3xl font-medium tabular-nums">
        1,240.00 <span className="text-base text-muted-foreground">NEAR</span>
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
        <div>
          <p className="text-muted-foreground">Rewards</p>
          <p className="font-mono font-medium text-success tabular-nums">
            +12.4 NEAR
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">In naira</p>
          <p className="font-mono font-medium tabular-nums">₦48,831</p>
        </div>
      </div>
    </div>
  );
}
