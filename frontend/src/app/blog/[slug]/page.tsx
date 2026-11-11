import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Nav } from "@/components/landing/nav";
import { Footer } from "@/components/landing/footer";
import { Cover } from "@/components/blog/cover";
import { Markdown } from "@/docs/markdown";
import { faqs, formatDate, getAllPosts, getPost, SITE_URL } from "@/blog/registry";

export const generateStaticParams = () => getAllPosts().map((p) => ({ slug: p.slug }));

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const p = getPost((await params).slug);
  if (!p) return {};
  return {
    title: p.title,
    description: p.summary,
    keywords: p.keywords,
    alternates: { canonical: `/blog/${p.slug}` },
    openGraph: {
      type: "article",
      url: `/blog/${p.slug}`,
      title: p.title,
      description: p.summary,
      publishedTime: p.date,
      section: p.category,
    },
    twitter: { card: "summary_large_image", title: p.title, description: p.summary },
  };
}

export default async function BlogPost({ params }: PageProps<"/blog/[slug]">) {
  const p = getPost((await params).slug);
  if (!p) notFound();
  const more = getAllPosts().filter((x) => x.slug !== p.slug);

  const url = `${SITE_URL}/blog/${p.slug}`;
  const faq = faqs(p.body);
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: p.title,
      description: p.summary,
      datePublished: p.date,
      dateModified: p.date,
      keywords: p.keywords.join(", "),
      mainEntityOfPage: url,
      url,
      image: `${url}/opengraph-image`,
      author: { "@type": "Organization", name: "Paya", url: SITE_URL },
      publisher: { "@type": "Organization", name: "Paya", url: SITE_URL, logo: `${SITE_URL}/logo.svg` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Paya", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
        { "@type": "ListItem", position: 3, name: p.title, item: url },
      ],
    },
    ...(faq.length
      ? [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
          },
        ]
      : []),
  ];

  return (
    <>
      <Nav />
      <main className="flex-1">
        <article>
          <header className="mx-auto max-w-[760px] px-4 pt-12 sm:px-6 sm:pt-20">
            <Link
              href="/blog"
              className="focus-ring -ml-2 inline-flex min-h-10 items-center gap-2 rounded-full px-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden="true" /> Blog
            </Link>
            <p className="mt-8 text-xl text-muted-foreground">{p.category}</p>
            <h1 className="mt-4 text-[clamp(40px,6vw,72px)] leading-[1.05] font-medium tracking-[-0.035em] text-balance">
              {p.title}
            </h1>
            <p className="mt-6 text-sm text-muted-foreground">
              <time dateTime={p.date}>{formatDate(p.date)}</time> · Paya
            </p>
          </header>

          <div className="mx-auto mt-12 max-w-[1080px] px-4 sm:mt-16 sm:px-6">
            <Cover kind={p.cover} text={p.coverText} size="hero" />
          </div>

          <div className="mx-auto max-w-[680px] px-4 pt-14 pb-8 text-[17px] sm:px-6 sm:pt-20 [&_p]:text-[18px] [&_p]:leading-8 [&_li]:text-[18px] [&_li]:leading-8">
            <p className="text-[22px]! leading-9! text-foreground/80 text-pretty">{p.summary}</p>
            <div className="mt-10">
              <Markdown source={p.body} />
            </div>

            <div className="mt-16 rounded-3xl bg-card p-8 text-center sm:p-10">
              <h2 className="text-2xl font-semibold tracking-tight">Move money both ways with Paya</h2>
              <p className="mt-3 text-muted-foreground">Buy NEAR with a bank transfer, or cash NEAR out to your bank.</p>
              <a
                href="/"
                className="focus-ring mt-6 inline-flex min-h-12 items-center rounded-full bg-foreground px-7 font-medium text-background hover:opacity-90"
              >
                Get started
              </a>
            </div>
          </div>
        </article>

        {more.length ? (
          <aside aria-labelledby="more" className="mx-auto max-w-[1080px] px-4 py-16 sm:px-6">
            <h2 id="more" className="mb-8 text-xl font-medium text-muted-foreground">
              More from the blog
            </h2>
            <div className="grid gap-10 sm:grid-cols-2">
              {more.map((m) => (
                <Link key={m.slug} href={`/blog/${m.slug}`} className="group focus-ring block rounded-[22px]">
                  <Cover kind={m.cover} text={m.coverText} />
                  <p className="mt-5 text-sm text-muted-foreground">{m.category}</p>
                  <h3 className="mt-2 text-xl font-medium tracking-[-0.02em] group-hover:underline">{m.title}</h3>
                </Link>
              ))}
            </div>
          </aside>
        ) : null}
      </main>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
