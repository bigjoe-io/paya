import { Nav } from "@/components/landing/nav";
import { Hero } from "@/components/landing/hero";
import { Bento } from "@/components/landing/bento";
import { Countries } from "@/components/landing/countries";
import { EverydayMoney } from "@/components/landing/everyday-money";
import { Security } from "@/components/landing/security";
import { FinalCta } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Paya",
    url: "https://www.usepaya.xyz",
    logo: "https://www.usepaya.xyz/logo.svg",
    sameAs: ["https://x.com/usepaya", "https://github.com/bigjoe-io/paya"],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Paya",
    url: "https://www.usepaya.xyz",
  },
  {
    "@context": "https://schema.org",
    "@type": "FinancialService",
    name: "Paya",
    url: "https://www.usepaya.xyz",
    description: "Buy NEAR with a bank transfer and cash NEAR out to your bank account in naira.",
    areaServed: { "@type": "Country", name: "Nigeria" },
  },
];

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
