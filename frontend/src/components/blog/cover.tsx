import type { CoverKind } from "@/blog/registry";

/**
 * Article cover in the Fuse style: soft grey gradient, an oversized faded headline,
 * and a small "object" composition — glossy coins and the Paya mark — on top.
 * Pure CSS so it stays sharp at any size and needs no image files.
 */
export function Cover({ kind, text, size = "card" }: { kind: CoverKind; text: string; size?: "card" | "hero" }) {
  const hero = size === "hero";
  return (
    <div
      className={`relative isolate overflow-hidden bg-gradient-to-b from-[#ededed] to-[#cfcfcf] ${
        hero ? "aspect-[16/9] rounded-[28px] sm:aspect-[16/8.5]" : "aspect-[16/9] rounded-[20px]"
      } ring-1 ring-black/5`}
      aria-hidden="true"
    >
      {/* Oversized faded headline */}
      <p
        className={`absolute inset-x-[6%] bottom-[7%] font-bold leading-[0.88] tracking-[-0.05em] text-white/75 text-balance ${
          hero ? "text-[clamp(44px,8.6vw,124px)]" : "text-[clamp(30px,5.2vw,64px)]"
        }`}
      >
        {text}
      </p>

      {/* Paya mark, top left */}
      <svg viewBox="0 0 100 100" className={`absolute top-[7%] left-[5%] ${hero ? "size-10" : "size-6"}`}>
        <circle cx="32" cy="50" r="30" fill="#1a1a1a" />
        <path d="M68 20a30 30 0 0 1 0 60z" fill="#1a1a1a" />
      </svg>

      {kind === "buy" ? (
        <div className="absolute top-[8%] right-[7%] h-[62%] w-[46%]">
          <Bubble className="top-[2%] left-[2%] h-[34%]" />
          <Coin glyph="₦" className="top-[30%] left-[8%] h-[46%] -rotate-12" />
          <Coin glyph="near" className="top-[6%] right-[6%] h-[62%] rotate-6" dark />
          <Bubble className="right-[0%] bottom-[0%] h-[26%]" />
        </div>
      ) : (
        <div className="absolute top-[8%] right-[7%] h-[62%] w-[50%]">
          <Bubble className="top-[0%] right-[2%] h-[30%]" />
          <Coin glyph="near" className="top-[22%] left-[2%] h-[52%] -rotate-6" dark />
          <MarkTile className="top-[6%] left-[32%] h-[66%]" />
          <Coin glyph="₦" className="top-[34%] right-[0%] h-[46%] rotate-12" />
        </div>
      )}
    </div>
  );
}

function Coin({ glyph, className, dark }: { glyph: "₦" | "near"; className: string; dark?: boolean }) {
  return (
    <div
      className={`absolute aspect-square rounded-full ${className}`}
      style={{
        background: dark
          ? "radial-gradient(circle at 32% 28%, #6b6b6b 0%, #2b2b2b 45%, #0d0d0d 100%)"
          : "radial-gradient(circle at 32% 28%, #ffffff 0%, #d9d9d9 45%, #9c9c9c 100%)",
        boxShadow: "0 18px 40px rgba(0,0,0,0.22), inset 0 -6px 14px rgba(0,0,0,0.25), inset 0 6px 12px rgba(255,255,255,0.35)",
      }}
    >
      <div
        className="absolute inset-[13%] grid place-items-center rounded-full"
        style={{
          background: dark
            ? "radial-gradient(circle at 60% 70%, #3a3a3a, #161616)"
            : "radial-gradient(circle at 60% 70%, #e6e6e6, #b5b5b5)",
          boxShadow: "inset 0 3px 8px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.4)",
        }}
      >
        {glyph === "near" ? (
          <svg viewBox="0 0 24 24" className="h-[48%] w-[48%]" fill={dark ? "#e9e9e9" : "#3a3a3a"}>
            <path d="M17.6 3.9 14 9.2c-.2.4.2.8.6.5L18.2 6.6c.1-.1.3 0 .3.1v9.6c0 .2-.2.2-.3.1L7.4 3.5C7 3 6.5 2.7 5.9 2.7h-.4C4.7 2.7 4 3.4 4 4.3v15.4c0 .9.7 1.6 1.5 1.6.6 0 1.1-.3 1.4-.8L10.5 15c.2-.4-.2-.8-.6-.5l-3.6 3.1c-.1.1-.3 0-.3-.1V7.9c0-.2.2-.2.3-.1l10.8 12.9c.3.4.9.6 1.4.6h.4c.9 0 1.5-.7 1.5-1.6V4.3c0-.9-.7-1.6-1.5-1.6-.6 0-1.1.3-1.3.8z" />
          </svg>
        ) : (
          <span className="leading-none font-bold text-[#3a3a3a]" style={{ fontSize: "clamp(14px, 3.6vw, 56px)" }}>
            ₦
          </span>
        )}
      </div>
    </div>
  );
}

function Bubble({ className }: { className: string }) {
  return (
    <div
      className={`absolute aspect-square rounded-full ${className}`}
      style={{
        background: "radial-gradient(circle at 30% 28%, #ffffff 0%, #ececec 40%, #c4c4c4 100%)",
        boxShadow: "0 14px 30px rgba(0,0,0,0.12)",
      }}
    />
  );
}

function MarkTile({ className }: { className: string }) {
  return (
    <div
      className={`absolute grid aspect-square place-items-center rounded-[22%] ${className}`}
      style={{
        background: "linear-gradient(160deg, #ffffff, #e4e4e4)",
        boxShadow: "0 24px 50px rgba(0,0,0,0.2), inset 0 1px 0 #fff",
      }}
    >
      <svg viewBox="0 0 100 100" className="h-[56%] w-[56%] drop-shadow-[0_6px_8px_rgba(0,0,0,0.35)]">
        <defs>
          <radialGradient id="ink" cx="30%" cy="28%" r="80%">
            <stop offset="0" stopColor="#5a5a5a" />
            <stop offset="0.45" stopColor="#151515" />
            <stop offset="1" stopColor="#000" />
          </radialGradient>
        </defs>
        <circle cx="32" cy="50" r="30" fill="url(#ink)" />
        <path d="M68 20a30 30 0 0 1 0 60z" fill="url(#ink)" />
      </svg>
    </div>
  );
}
