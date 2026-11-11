import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/landing/nav";
import { Footer } from "@/components/landing/footer";
import { Cover } from "@/components/blog/cover";
import { Carousel } from "@/components/blog/carousel";
import { getAllPosts, SITE_URL } from "@/blog/registry";

export const metadata: Metadata = {
  title: "Blog — Buying and cashing out NEAR in Africa",
  description:
    "Guides and news from Paya: how to buy NEAR with naira, cash out NEAR to your Nigerian bank account, and move money between crypto and your bank.",
  alternates: { canonical: "/blog" },
  openGraph: { url: "/blog", type: "website" },
};

export default function BlogIndex() {
  const posts = getAllPosts();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Paya Blog",
    url: `${SITE_URL}/blog`,
    blogPost: posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: `${SITE_URL}/blog/${p.slug}`,
      datePublished: p.date,
    })),
  };

  return (
    <>
      <Nav />
      <main className="flex-1">
        <header className="mx-auto max-w-[1600px] px-4 sm:px-6">
          <div className="rounded-b-[32px] bg-card px-6 pt-14 pb-16 text-center sm:pt-16 sm:pb-20">
            <h1 className="text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Blog</h1>
            <p className="mt-4 text-lg text-muted-foreground text-pretty">
              Stay up to date with the latest news and guides from Paya
            </p>
          </div>
        </header>

        <section aria-labelledby="featured" className="py-16 sm:py-20">
          <h2 id="featured" className="mb-10 text-center text-xl font-medium text-muted-foreground">
            Featured
          </h2>
          <Carousel label="Featured articles">
            {posts.map((p) => (
              <article
                key={p.slug}
                data-card
                className="w-[86vw] max-w-[560px] shrink-0 snap-center sm:w-[520px]"
              >
                <Link href={`/blog/${p.slug}`} className="group focus-ring block rounded-[22px]">
                  <div className="transition-transform duration-300 ease-out group-hover:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
                    <Cover kind={p.cover} text={p.coverText} />
                  </div>
                  <p className="mt-6 text-sm text-muted-foreground">{p.category}</p>
                  <h3 className="mt-3 text-2xl font-medium tracking-[-0.02em] text-balance">{p.title}</h3>
                  <p className="mt-2 line-clamp-2 text-[15px] leading-6 text-muted-foreground">{p.summary}</p>
                </Link>
              </article>
            ))}
          </Carousel>
        </section>
      </main>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
