import { ArrowRight, Banknote, Download, Rocket, ShieldCheck } from "lucide-react";
import { DOCS_GROUPS, getAllDocs } from "@/docs/registry";
import { DocLink } from "@/components/docs/docs-chrome";

const CARDS = [
  { slug: "quickstart", title: "Quickstart", text: "From sign-up to money in your bank, in five steps.", icon: Rocket },
  { slug: "cash-out", title: "Cash out", text: "Turn NEAR into naira, cedis, shillings or rand.", icon: Banknote },
  { slug: "buying-near", title: "Buy NEAR", text: "Pay by bank transfer; NEAR lands in your balance.", icon: Download },
  { slug: "security", title: "Security", text: "How your account and money are protected.", icon: ShieldCheck },
];

export default function DocsHome() {
  const pages = getAllDocs();
  return (
    <div className="max-w-3xl py-10 lg:py-12">
      <p className="text-sm font-medium text-muted-foreground">Overview</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Paya docs</h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground/75 text-pretty">
        Paya turns NEAR into money in your bank account, and bank transfers into NEAR. Live in Nigeria, with more countries coming soon.
        Everything you need to use it, in plain language.
      </p>

      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        {CARDS.map((c) => (
          <DocLink
            key={c.slug}
            slug={c.slug}
            className="focus-ring group flex flex-col rounded-3xl border border-border bg-panel p-6 transition-colors duration-100 hover:border-foreground/25"
          >
            <c.icon className="size-5 text-muted-foreground" aria-hidden="true" />
            <span className="mt-8 text-lg font-medium">{c.title}</span>
            <span className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{c.text}</span>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium">
              Read <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
            </span>
          </DocLink>
        ))}
      </div>

      <div className="mt-14 grid gap-10 sm:grid-cols-2">
        {DOCS_GROUPS.map((g) => (
          <section key={g} aria-labelledby={`g-${g}`}>
            <h2 id={`g-${g}`} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {g}
            </h2>
            <ul className="mt-4 space-y-3">
              {pages
                .filter((p) => p.group === g)
                .map((p) => (
                  <li key={p.slug}>
                    <DocLink slug={p.slug} className="focus-ring rounded font-medium hover:underline">
                      {p.title}
                    </DocLink>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{p.summary}</p>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
