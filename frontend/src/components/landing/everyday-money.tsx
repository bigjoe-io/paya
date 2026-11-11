import { BadgeCheck, Check, Landmark, Mail, Wallet } from "lucide-react";
import { TabbedPanel, type Tab } from "@/components/landing/tabbed-panel";
import { NearIcon } from "@/components/landing/icons";
import { ElectricLines } from "@/components/landing/fx";

/** How it works: the three things a user actually does, side by side with a preview. */
const tabs: Tab[] = [
  {
    id: "connect",
    label: "Connect your wallet",
    description: "HOT, Meteor, Nightly, MyNearWallet and more. Verify your email once so payouts run under your own profile.",
    panel: <ConnectPanel />,
  },
  {
    id: "recipient",
    label: "Add a bank account",
    description: "Pick your bank and type the account number. We show the holder's real name before you send a thing.",
    panel: <RecipientPanel />,
  },
  {
    id: "swap",
    label: "Swap and get paid",
    description: "Type an amount, see exactly what lands, confirm once in your wallet. Most cash-outs arrive in about two minutes.",
    panel: <PaidPanel />,
  },
];

export function EverydayMoney() {
  return <TabbedPanel id="how-it-works" heading="Use NEAR as everyday money" tabs={tabs} />;
}

function ConnectPanel() {
  return (
    <div className="w-full max-w-xs space-y-3">
      <div className="flex items-center gap-3 rounded-2xl bg-background p-4 shadow-sm">
        <span className="flex size-10 items-center justify-center rounded-full bg-foreground text-background">
          <Wallet className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Wallet connected</span>
          <span className="block truncate font-mono text-xs text-muted-foreground">adaeze.near</span>
        </span>
        <span className="size-2 rounded-full bg-success" aria-hidden="true" />
      </div>
      <div className="flex items-center gap-3 rounded-2xl bg-background p-4 shadow-sm">
        <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Mail className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Email verified</span>
          <span className="block truncate text-xs text-muted-foreground">adaeze@mail.com</span>
        </span>
        <Check className="size-4 text-success" aria-hidden="true" />
      </div>
    </div>
  );
}

function RecipientPanel() {
  return (
    <div className="w-full max-w-xs rounded-3xl bg-background p-5 shadow-sm">
      <p className="text-xs text-muted-foreground">Bank</p>
      <p className="mt-1 rounded-xl border border-border px-3 py-2 text-sm">Guaranty Trust Bank</p>
      <p className="mt-3 text-xs text-muted-foreground">Account number</p>
      <p className="mt-1 rounded-xl border border-border px-3 py-2 font-mono text-sm tabular-nums">0123454821</p>
      <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-success">
        <BadgeCheck className="size-4" aria-hidden="true" />
        ADAEZE OKAFOR
      </p>
    </div>
  );
}

function PaidPanel() {
  return (
    <div className="relative flex w-full items-center justify-center self-stretch">
      <ElectricLines tone="light" className="opacity-80" />
      <div className="relative flex items-center gap-4">
        <span className="flex size-16 items-center justify-center rounded-3xl bg-foreground text-background shadow-sm">
          <NearIcon className="size-8" />
        </span>
        <span className="font-mono text-sm text-muted-foreground">→</span>
        <span className="rounded-3xl bg-background p-4 shadow-sm">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <Landmark className="size-3.5" aria-hidden="true" />
            GTBank •••• 4821
          </span>
          <span className="mt-1 block font-mono text-2xl font-semibold text-success tabular-nums">₦126,040</span>
          <span className="mt-1 inline-flex items-center gap-1 text-xs text-success">
            <Check className="size-3.5" aria-hidden="true" />
            Paid in 1m 48s
          </span>
        </span>
      </div>
    </div>
  );
}
