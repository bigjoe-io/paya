import { ArrowRight } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";

export function DocsLink() {
  return (
    <section className="container-page py-20 text-center md:py-28">
      <p className="mx-auto max-w-sm text-lg text-muted-foreground text-pretty">
        Read the docs to see how orders, rates and refunds work under the hood.
      </p>
      <a
        href="https://github.com/letsdap/paya"
        className="focus-ring mt-6 inline-flex size-11 items-center justify-center rounded-full border border-dashed border-foreground/50 transition-colors duration-100 hover:bg-card"
        aria-label="Open the Paya documentation"
      >
        <ArrowRight className="size-5" aria-hidden="true" />
      </a>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="container-page pb-24 md:pb-32">
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
          One click from NEAR to cash in your bank account.
        </p>
        <ButtonLink href="/app" className="mt-8">
          Open app
        </ButtonLink>
      </div>
    </section>
  );
}
