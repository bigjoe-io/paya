import { Nav } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import { Bento } from "@/components/landing/bento";
import { Countries } from "@/components/landing/countries";
import { EverydayMoney } from "@/components/landing/everyday-money";
import { Security } from "@/components/landing/security";
import { FinalCta } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Hero />
        <Bento />
        <Countries />
        <EverydayMoney />
        <Security />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
