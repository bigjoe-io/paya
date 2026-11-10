import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Paya mark: a glossy liquid "P" with a droplet. Source of truth is
 * public/logo.svg (also used as the app icon via src/app/icon.svg).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/logo.svg"
      alt=""
      width={32}
      height={32}
      unoptimized
      priority
      className={cn("size-8", className)}
    />
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
