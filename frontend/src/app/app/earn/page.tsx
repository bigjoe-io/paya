"use client";

import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";
import { Topbar } from "@/components/app/topbar";
import { AssetIcon, Card, Chips, PageTitle } from "@/components/app/ui";
import { earnProducts, formatCompactUsd } from "@/lib/mock";

const filters = ["All products", "Staking", "Vaults"] as const;
type Filter = (typeof filters)[number];

export default function EarnPage() {
  const [filter, setFilter] = useState<Filter>("All products");
  const [query, setQuery] = useState("");

  const rows = earnProducts.filter((p) => {
    const kindOk =
      filter === "All products" ||
      (filter === "Staking" && p.kind === "Staking") ||
      (filter === "Vaults" && p.kind === "Vault");
    const q = query.trim().toLowerCase();
    const queryOk = !q || p.name.toLowerCase().includes(q) || p.asset.toLowerCase().includes(q);
    return kindOk && queryOk;
  });

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-6xl px-4 pb-12 lg:px-6">
        <PageTitle>Earn</PageTitle>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative sm:w-64">
            <span className="sr-only">Search name or asset</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or asset"
              autoComplete="off"
              className="focus-ring min-h-10 w-full rounded-xl border border-border bg-card pr-3 pl-9 text-sm placeholder:text-muted-foreground"
            />
          </label>
          <Chips options={[...filters]} value={filter} onChange={setFilter} />
        </div>

        <Card className="mt-5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-normal">Product</th>
                <th scope="col" className="px-5 py-3 text-right font-normal">Rate</th>
                <th scope="col" className="hidden px-5 py-3 text-right font-normal md:table-cell">TVL</th>
                <th scope="col" className="hidden px-5 py-3 text-right font-normal md:table-cell">Withdrawals</th>
                <th scope="col" className="hidden px-5 py-3 text-right font-normal lg:table-cell">Min. deposit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="relative border-t border-border transition-colors duration-100 hover:bg-foreground/[0.03]">
                  <td className="px-5 py-4">
                    <Link
                      href={`/app/earn/${p.id}`}
                      className="focus-ring flex items-center gap-3 rounded-md after:absolute after:inset-0"
                    >
                      <AssetIcon symbol={p.asset} />
                      <span>
                        <span className="block font-medium">{p.name}</span>
                        <span className="block text-muted-foreground">{p.kind}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-right font-mono tabular-nums">
                    {p.rate.toFixed(2)}% <span className="text-muted-foreground">{p.rateLabel}</span>
                  </td>
                  <td className="hidden px-5 py-4 text-right font-mono tabular-nums md:table-cell">
                    {formatCompactUsd(p.tvlUsd)}
                  </td>
                  <td className="hidden px-5 py-4 text-right md:table-cell">{p.withdrawals}</td>
                  <td className="hidden px-5 py-4 text-right font-mono tabular-nums lg:table-cell">
                    {p.minDeposit}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr className="border-t border-border">
                  <td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">
                    No products match &ldquo;{query}&rdquo;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </main>
    </>
  );
}
