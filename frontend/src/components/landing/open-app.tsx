import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Primary call to action: straight into the app (sign in with email or connect a wallet). */
export function OpenAppButton({ className, children = "Open app" }: { className?: string; children?: ReactNode }) {
  return (
    <Link
      href="/app"
      className={cn(
        "focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-medium text-primary-foreground transition-colors duration-100 hover:bg-primary/85",
        className,
      )}
    >
      {children}
    </Link>
  );
}
