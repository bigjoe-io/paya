import { Nav } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import { Intro } from "@/components/landing/intro";
import { FeatureCards } from "@/components/landing/feature-cards";
import { EverydayMoney } from "@/components/landing/everyday-money";
import { Highlights } from "@/components/landing/highlights";
import { Security } from "@/components/landing/security";
import { DocsLink, FinalCta } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Hero />
        <Intro />
        <FeatureCards />
        <EverydayMoney />
        <Highlights />
        <Security />
        <DocsLink />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
