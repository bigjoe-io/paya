import { cn } from "@/lib/utils";

/** Simplified NEAR-style "N" mark, drawn in-house so no brand asset is bundled. */
export function NearIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("size-5", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 18V6l12 12V6" />
    </svg>
  );
}

/** Generic coin glyph used for "any token" illustrations. */
export function CoinIcon({
  className,
  label,
}: {
  className?: string;
  label: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-12 items-center justify-center rounded-full bg-background font-mono text-sm font-medium text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}
