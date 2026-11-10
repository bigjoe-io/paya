import { cn } from "@/lib/utils";

/**
 * Paya mark: a coin leaving a rounded square — "money out, in one move".
 * Placeholder until the final logo lands in /design.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("size-8", className)}
      fill="none"
    >
      <rect x="2" y="2" width="28" height="28" rx="9" fill="currentColor" />
      <path
        d="M10 22 L22 10 M14 10 H22 V18"
        stroke="var(--background)"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-xl font-semibold tracking-tight">Paya</span>
    </span>
  );
}
