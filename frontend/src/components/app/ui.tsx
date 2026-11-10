"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NearIcon, TokenIcon } from "@/components/landing/icons";
import { useWallet } from "@/components/app/session-provider";
import type { TokenSymbol } from "@/lib/mock";
import { cn } from "@/lib/utils";

/** Pill tabs that navigate (keeps tab state in the URL). */
export function Segmented({
  items,
  className,
}: {
  items: { href: string; label: string }[];
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Sections" className={cn("flex flex-wrap gap-2", className)}>
      {items.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-ring inline-flex min-h-10 items-center rounded-full px-4 text-sm transition-colors duration-100",
              active
                ? "bg-foreground text-background"
                : "bg-card text-foreground/80 hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Filter chips with local state (not routed). */
export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label="Filter" className="flex flex-wrap gap-1">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          aria-pressed={opt === value}
          className={cn(
            "focus-ring min-h-10 rounded-full px-3.5 text-sm transition-colors duration-100",
            opt === value ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card", className)}>{children}</div>
  );
}

/** Placeholder dots for a value that is hidden or not available yet. */
export function Dots({
  count = 6,
  className,
  label = "Not available",
}: {
  count?: number;
  className?: string;
  label?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-label={label}>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="size-1.5 rounded-full bg-foreground/70" aria-hidden="true" />
      ))}
    </span>
  );
}

/** A money/number that respects the "hide balances" toggle. */
export function Amount({
  children,
  className,
  dots = 6,
}: {
  children: ReactNode;
  className?: string;
  dots?: number;
}) {
  const { hidden } = useWallet();
  if (hidden) return <Dots count={dots} className={className} label="Hidden" />;
  return <span className={cn("font-mono tabular-nums", className)}>{children}</span>;
}

export function AssetIcon({
  symbol,
  className,
}: {
  symbol: TokenSymbol;
  className?: string;
}) {
  if (symbol === "NEAR") {
    return (
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background",
          className,
        )}
      >
        <NearIcon className="size-5" />
      </span>
    );
  }
  return (
    <TokenIcon
      symbol={symbol === "USDC" ? "usdc" : "sol"}
      className={cn("size-10 shrink-0", className)}
    />
  );
}

export function Change({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span className={cn("font-mono tabular-nums", up ? "text-success" : "text-foreground/80")}>
      {up ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
      <p className="text-base font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground text-pretty">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>;
}
