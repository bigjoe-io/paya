import { cn } from "@/lib/utils";

/**
 * Paya mark "Convert": a whole circle becoming a half circle — one thing
 * turning into another, in one move. Flat, single colour (currentColor), so it
 * works black on light and white on dark. Static copies: public/logo.svg and
 * the app icon at src/app/icon.svg.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      fill="currentColor"
      className={cn("size-8", className)}
    >
      <circle cx="32" cy="50" r="30" />
      <path d="M68 20a30 30 0 0 1 0 60z" />
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
