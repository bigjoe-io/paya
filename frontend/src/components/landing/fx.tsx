import { cn } from "@/lib/utils";

/**
 * Decorative depth for dark surfaces. All of it is aria-hidden, pointer-
 * events-none, and stops animating under prefers-reduced-motion (globals.css).
 */

/** Curves with glowing pulses travelling along them — money moving between rails. */
export function ElectricLines({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  const paths = [
    "M-20 300 C 160 300, 220 120, 420 140 S 700 60, 840 90",
    "M-20 340 C 200 330, 300 220, 460 230 S 700 180, 840 200",
    "M-20 250 C 120 240, 260 40, 440 70 S 680 20, 840 10",
    "M-20 380 C 220 380, 340 300, 520 310 S 720 280, 840 300",
  ];
  const base = tone === "dark" ? "rgba(255,255,255,0.08)" : "rgba(10,10,10,0.07)";
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 800 400"
      preserveAspectRatio="none"
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
    >
      <defs>
        <linearGradient id="paya-pulse" x1="0" x2="1">
          <stop offset="0" stopColor="#3b82f6" stopOpacity="0" />
          <stop offset="0.6" stopColor="#60a5fa" />
          <stop offset="1" stopColor="#e0f2fe" />
        </linearGradient>
        <filter id="paya-glow" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {paths.map((d, i) => (
        <g key={d}>
          <path d={d} fill="none" stroke={base} strokeWidth="1.25" />
          <path
            d={d}
            fill="none"
            stroke="url(#paya-pulse)"
            strokeWidth="2"
            strokeLinecap="round"
            pathLength={1000}
            strokeDasharray="90 910"
            filter="url(#paya-glow)"
            className="paya-pulse"
            style={{ animationDuration: `${5 + i * 1.3}s`, animationDelay: `${i * -1.7}s` }}
          />
        </g>
      ))}
    </svg>
  );
}

/** A receding floor grid that gives a flat card some 3D depth. */
export function PerspectiveGrid({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  const line = tone === "dark" ? "rgba(255,255,255,0.07)" : "rgba(10,10,10,0.06)";
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-3/5 overflow-hidden", className)}>
      <div
        className="absolute inset-x-[-50%] bottom-0 h-[200%] origin-bottom"
        style={{
          transform: "perspective(500px) rotateX(62deg)",
          backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
          maskImage: "linear-gradient(to top, black 10%, transparent 80%)",
          WebkitMaskImage: "linear-gradient(to top, black 10%, transparent 80%)",
        }}
      />
    </div>
  );
}

/** Soft colored light behind content. */
export function Glow({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute rounded-full bg-accent/40 blur-3xl", className)}
    />
  );
}

/** Stone/gravel texture (SVG turbulence), used behind the hero phone. */
export const STONE_TEXTURE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.45  0 0 0 0 0.43  0 0 0 0 0.41  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";
