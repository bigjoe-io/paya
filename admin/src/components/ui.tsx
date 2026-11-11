import type { ReactNode } from "react";
import type { SwapStatus } from "@/lib/relay";

export const STATUS_LABEL: Record<SwapStatus, string> = {
  awaiting_deposit: "Sending",
  swapping: "Swapping",
  paying: "Paying out",
  paid: "Paid",
  refunded: "Refunded",
  expired: "Expired",
  failed: "Failed",
};

const tone: Record<SwapStatus, string> = {
  awaiting_deposit: "bg-neutral-100 text-neutral-700",
  swapping: "bg-blue-50 text-blue-700",
  paying: "bg-blue-50 text-blue-700",
  paid: "bg-green-50 text-green-700",
  refunded: "bg-amber-50 text-amber-800",
  expired: "bg-neutral-100 text-neutral-600",
  failed: "bg-red-50 text-red-700",
};

export function StatusBadge({ status }: { status: SwapStatus }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function SimBadge() {
  return <span className="inline-flex rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">simulated</span>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-neutral-200 bg-white ${className}`}>{children}</section>;
}

export const yoctoToNear = (y: string) => Number(BigInt(y) / BigInt("1000000000000000000")) / 1e6;
export const money = (n: number, max = 2) => n.toLocaleString("en-US", { maximumFractionDigits: max });
export const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const short = (s: string, n = 6) => (s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);

/** Public block explorers for each identifier type. */
export const explorer = {
  nearTx: (h: string) => `https://nearblocks.io/txns/${h}`,
  nearAccount: (a: string) => `https://nearblocks.io/address/${a}`,
  solanaAccount: (a: string) => `https://solscan.io/account/${a}`,
  solanaTx: (s: string) => `https://solscan.io/tx/${s}`,
};

export function RelayDown({ message }: { message: string }) {
  return (
    <Card className="p-6">
      <h1 className="text-lg font-semibold">Can&apos;t load data from the relay</h1>
      <p className="mt-2 text-sm text-neutral-600">{message}</p>
    </Card>
  );
}
