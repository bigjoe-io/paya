import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { docMarkdown, getAllDocs, getDoc, siblings } from "@/docs/registry";
import { Markdown, toc } from "@/docs/markdown";
import { CopyPageButton, DocLink, Toc } from "@/components/docs/docs-chrome";


export function generateStaticParams() {
  return getAllDocs().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/docs/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = getDoc(slug);
  return page ? { title: page.title, description: page.summary } : {};
}

/** The shell renders instantly; the page body (which depends on the URL) streams in. */
export default function DocPage({ params }: PageProps<"/docs/[slug]">) {
  return (
    <Suspense fallback={<DocSkeleton />}>
      <DocBody params={params} />
    </Suspense>
  );
}

function DocSkeleton() {
  return (
    <div className="max-w-3xl py-12" aria-busy="true" aria-label="Loading">
      <div className="h-4 w-24 animate-pulse rounded bg-card" />
      <div className="mt-4 h-10 w-2/3 animate-pulse rounded-xl bg-card" />
      <div className="mt-4 h-5 w-full animate-pulse rounded bg-card" />
      <div className="mt-10 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-4 w-full animate-pulse rounded bg-card" />
        ))}
      </div>
    </div>
  );
}

async function DocBody({ params }: { params: PageProps<"/docs/[slug]">["params"] }) {
  const { slug } = await params;
  const page = getDoc(slug);
  if (!page) notFound();

  const items = toc(page.body);
  const { prev, next } = siblings(slug);
  const titles = new Map(getAllDocs().map((p) => [p.slug, p.title]));

  return (
    <div className="flex gap-10">
      <article className="min-w-0 max-w-3xl flex-1 py-10 lg:py-12">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-muted-foreground">{page.group}</p>
          <CopyPageButton markdown={docMarkdown(page)} />
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{page.title}</h1>
        {page.summary && <p className="mt-3 text-lg leading-relaxed text-foreground/75 text-pretty">{page.summary}</p>}

        <div className="mt-10">
          <Markdown source={page.body} />
        </div>

        {page.tags.some((t) => titles.has(t)) && (
          <div className="mt-12">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Related</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {page.tags
                .filter((t) => titles.has(t))
                .map((t) => (
                  <DocLink key={t} slug={t} className="focus-ring inline-flex min-h-9 items-center rounded-full border border-border px-3.5 text-sm text-foreground/75 hover:text-foreground">
                    {titles.get(t)}
                  </DocLink>
                ))}
            </div>
          </div>
        )}

        <nav aria-label="Previous and next pages" className="mt-12 grid gap-3 border-t border-border pt-8 sm:grid-cols-2">
          {prev ? (
            <DocLink slug={prev.slug} className="focus-ring rounded-2xl border border-border p-5 hover:border-foreground/25">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <ArrowLeft className="size-3.5" aria-hidden="true" /> Previous
              </span>
              <span className="mt-1 block font-medium">{prev.title}</span>
            </DocLink>
          ) : (
            <span />
          )}
          {next && (
            <DocLink slug={next.slug} className="focus-ring rounded-2xl border border-border p-5 text-right hover:border-foreground/25">
              <span className="flex items-center justify-end gap-1.5 text-sm text-muted-foreground">
                Next <ArrowRight className="size-3.5" aria-hidden="true" />
              </span>
              <span className="mt-1 block font-medium">{next.title}</span>
            </DocLink>
          )}
        </nav>
      </article>
      <aside className="sticky top-16 hidden h-fit w-56 shrink-0 py-12 xl:block">
        <Toc items={items} />
      </aside>
    </div>
  );
}
