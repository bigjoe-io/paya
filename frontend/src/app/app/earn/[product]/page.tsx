import { notFound } from "next/navigation";
import { Topbar } from "@/components/app/topbar";
import { AssetIcon } from "@/components/app/ui";
import { GrowthChart } from "@/components/app/growth-chart";
import { StakePanel } from "@/components/app/stake-panel";
import { earnProducts, formatCompactUsd, growthSeries } from "@/lib/mock";

export function generateStaticParams() {
  return earnProducts.map((p) => ({ product: p.id }));
}

const PRINCIPAL = 1000;
const YEARS = 20;

export default async function EarnProductPage({ params }: PageProps<"/app/earn/[product]">) {
  const { product: id } = await params;
  const product = earnProducts.find((p) => p.id === id);
  if (!product) notFound();

  const series = growthSeries(PRINCIPAL, product.rate, YEARS);
  const final = series[series.length - 1].v;
  const gain = final - PRINCIPAL;

  return (
    <>
      <Topbar title="Earn" backHref="/app/earn" />
      <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-12 lg:grid-cols-[1fr_22rem] lg:px-6">
        <section>
          <div className="flex items-center gap-3">
            <AssetIcon symbol={product.asset} className="size-12" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{product.name}</h1>
              <p className="text-sm text-muted-foreground">{product.provider}</p>
            </div>
          </div>

          <p className="mt-8 text-3xl font-semibold tracking-tight">
            <span className="font-mono tabular-nums">
              {final.toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </span>{" "}
            {product.asset}
          </p>
          <p className="mt-1 text-sm">
            <span className="font-mono text-success tabular-nums">
              ▲ {gain.toLocaleString("en-US", { maximumFractionDigits: 2 })} {product.asset} (
              {((gain / PRINCIPAL) * 100).toFixed(0)}%)
            </span>
            <span className="ml-3 text-muted-foreground">in {YEARS} years</span>
          </p>

          <div className="mt-6">
            <GrowthChart series={series} years={YEARS} asset={product.asset} />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Hypothetical growth of {PRINCIPAL.toLocaleString()} {product.asset} at the current{" "}
            {product.rateLabel}.
          </p>

          <div className="mt-12 grid gap-10 md:grid-cols-2">
            <div>
              <h2 className="text-lg font-medium">Terms</h2>
              <dl className="mt-4 divide-y divide-border text-sm">
                <Term label="Current rate">
                  <span className="font-mono tabular-nums">
                    {product.rate.toFixed(2)}% {product.rateLabel}
                  </span>
                </Term>
                <Term label="TVL">
                  <span className="font-mono tabular-nums">{formatCompactUsd(product.tvlUsd)}</span>
                </Term>
                <Term label="Withdrawals">{product.withdrawals}</Term>
                <Term label="Fees">{product.fees}</Term>
                <Term label="Rewards">{product.rewards}</Term>
              </dl>
            </div>
            <div>
              <h2 className="text-lg font-medium">How it works</h2>
              <div className="mt-4 space-y-3 text-sm text-muted-foreground text-pretty">
                {product.how.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </div>
          </div>
        </section>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <StakePanel product={product} />
        </aside>
      </main>
    </>
  );
}

function Term({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
