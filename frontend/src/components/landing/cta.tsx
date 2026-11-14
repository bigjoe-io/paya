import { LogoMark } from "@/components/logo";
import { OpenAppButton } from "@/components/landing/open-app";

export function FinalCta() {
  return (
    <section className="container-page pt-24 pb-24 md:pt-32 md:pb-32">
      <div className="mx-auto flex max-w-xl flex-col items-center text-center">
        <span className="flex size-24 items-center justify-center rounded-3xl bg-card">
          <LogoMark className="size-12" />
        </span>
        <h2 className="mt-8 text-4xl font-semibold tracking-tight text-balance md:text-5xl">
          Get started
          {" "}<br className="hidden md:block" />
          with Paya today.
        </h2>
        <p className="mt-4 text-lg text-muted-foreground text-pretty">
          Buy, sell and swap NEAR. Cash out to your bank in minutes.
        </p>
        <OpenAppButton className="mt-8" />
      </div>
    </section>
  );
}
