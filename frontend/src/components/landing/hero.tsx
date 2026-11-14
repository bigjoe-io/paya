import { ArrowDown, Check, ChevronDown } from "lucide-react";
import { OpenAppButton } from "@/components/landing/open-app";
import { NearIcon } from "@/components/landing/icons";
import { COUNTRIES } from "@/components/landing/countries";
import { ElectricLines, STONE_TEXTURE } from "@/components/landing/fx";

export function Hero() {
  return (
    <section className="container-page pt-14 pb-6 md:pt-20">
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl lg:text-6xl">
          NEAR to your bank. And back.
        </h1>
        <p className="mt-4 max-w-md text-lg text-muted-foreground text-pretty">
          Sign in with your email or connect your NEAR wallet. Buy NEAR with a bank transfer, cash it out to your bank, swap any token on NEAR, and bridge to other chains.
        </p>
        <OpenAppButton className="mt-8" />
        <p className="mt-4 text-sm text-muted-foreground">
          <span aria-hidden="true">{COUNTRIES.map((c) => c.flag).join(" ")}</span>
          <span className="sr-only">Live in Nigeria; {COUNTRIES.filter((c) => c.country !== "Nigeria").map((c) => c.country).join(", ")} coming next</span>
        </p>
      </div>

      {/* Product shot: a phone running the swap screen, on a stone backdrop (Fuse-style). */}
      <div
        className="relative mt-12 overflow-hidden rounded-4xl md:mt-16"
        style={{
          backgroundColor: "#8f8a84",
          backgroundImage: `radial-gradient(120% 90% at 20% 10%, rgba(255,255,255,0.35), transparent 55%), radial-gradient(80% 80% at 90% 100%, rgba(0,0,0,0.35), transparent 60%), ${STONE_TEXTURE}`,
        }}
      >
        <ElectricLines className="mix-blend-screen" />
        <div className="relative flex min-h-[30rem] items-center justify-center py-12 md:min-h-[38rem]">
          <div className="relative">
            <Phone />
            <PaidToast />
          </div>
        </div>
      </div>
    </section>
  );
}

function Phone() {
  return (
    <div
      role="img"
      aria-label="The Paya app on a phone: 25 NEAR swapped to ₦126,040, paid to a GTBank account"
      className="paya-float relative w-[17rem] rounded-[2.75rem] bg-neutral-950 p-2.5 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.08)_inset] md:w-[19rem]"
    >
      <div className="relative overflow-hidden rounded-[2.2rem] bg-[#fafafa] px-4 pt-10 pb-5">
        <div className="absolute top-2.5 left-1/2 h-6 w-24 -translate-x-1/2 rounded-full bg-neutral-950" />

        <p className="text-center text-[10px] text-neutral-500">Total balance</p>
        <p className="text-center text-xl font-semibold tracking-tight">$3,214.80</p>

        <div className="mt-3 grid grid-cols-3 rounded-xl bg-neutral-200/70 p-0.5 text-[10px] font-medium">
          <span className="py-1.5 text-center text-neutral-400">Buy</span>
          <span className="rounded-[10px] bg-white py-1.5 text-center shadow-sm">Sell</span>
          <span className="py-1.5 text-center text-neutral-400">Swap</span>
        </div>

        <div className="mt-2.5 rounded-2xl border border-neutral-200 bg-white p-3">
          <p className="text-[10px] text-neutral-500">You pay</p>
          <div className="mt-0.5 flex items-center justify-between">
            <span className="font-mono text-2xl font-semibold tabular-nums">25</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-100 py-0.5 pr-2 pl-0.5 text-[10px] font-medium">
              <span className="flex size-4 items-center justify-center rounded-full bg-neutral-950 text-white">
                <NearIcon className="size-2.5" />
              </span>
              NEAR
            </span>
          </div>
        </div>
        <div className="relative z-10 -my-1.5 flex justify-center">
          <span className="flex size-6 items-center justify-center rounded-lg border border-neutral-200 bg-white">
            <ArrowDown className="size-3" />
          </span>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-neutral-500">You receive</p>
            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-medium text-blue-700">Adaeze · GTBank</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between">
            <span className="font-mono text-2xl font-semibold tabular-nums">₦126,040</span>
            <span className="inline-flex items-center gap-0.5 rounded-full border border-neutral-200 bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium">
              🇳🇬 NGN <ChevronDown className="size-2.5" />
            </span>
          </div>
        </div>
        <p className="mt-2 px-1 font-mono text-[9px] text-neutral-500">1 NEAR ≈ ₦5,041</p>
        <div className="mt-2.5 rounded-xl bg-neutral-950 py-2.5 text-center text-[11px] font-medium text-white">Swap to NGN</div>

      </div>
    </div>
  );
}

/** Notification floating off the phone's edge, like a push alert landing. */
function PaidToast() {
  return (
    <div
      aria-hidden="true"
      className="absolute -bottom-10 left-1/2 flex w-56 -translate-x-1/2 items-center gap-2.5 rounded-2xl bg-white/95 p-3 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.35)] ring-1 ring-black/5 backdrop-blur md:-right-40 md:bottom-12 md:left-auto md:w-60 md:translate-x-0"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
        <Check className="size-4" />
      </span>
      <span className="text-xs leading-tight">
        <span className="block font-semibold">Paid ₦126,040</span>
        <span className="text-neutral-500">GTBank •••• 4821 · just now</span>
      </span>
    </div>
  );
}
