import { BadgeCheck, Check, Landmark, Mail } from "lucide-react";
import { TabbedPanel, type Tab } from "@/components/landing/tabbed-panel";
import { NearIcon } from "@/components/landing/icons";
import { ElectricLines } from "@/components/landing/fx";

/** How it works: the three things a user actually does, side by side with a preview. */
const tabs: Tab[] = [
  {
    id: "signup",
    label: "Sign up with your email",
    description: "No wallet to connect. Your account and your own NEAR address are created the moment you verify your email.",
    panel: <AccountPanel />,
  },
  {
    id: "recipient",
    label: "Link your bank account",
    description: "Search for your bank and type the account number. We confirm the holder's real name with the bank.",
    panel: <RecipientPanel />,
  },
  {
    id: "swap",
    label: "Send NEAR, get paid",
    description: "Send NEAR to your address from any wallet or exchange. It's paid to your bank automatically, usually in about two minutes.",
    panel: <PaidPanel />,
  },
];

export function EverydayMoney() {
  return <TabbedPanel id="how-it-works" heading="Use NEAR as everyday money" tabs={tabs} />;
}

function AccountPanel() {
  return (
    <div className="w-full max-w-xs space-y-3">
      <div className="flex items-center gap-3 rounded-2xl bg-background p-4 shadow-sm">
        <span className="flex size-10 items-center justify-center rounded-full bg-foreground text-background">
          <NearIcon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Your NEAR address</span>
          <span className="block truncate font-mono text-xs text-muted-foreground">3f9a1c…8e21c7</span>
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
