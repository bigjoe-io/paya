"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Topbar } from "@/components/app/topbar";
import { Amount, AssetIcon, Card, Change, PageTitle } from "@/components/app/ui";
import { useWallet } from "@/components/app/wallet-provider";
import { assets, formatUsd } from "@/lib/mock";

export default function CryptoPage() {
  const { accountId } = useWallet();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = assets.filter(
    (a) => !q || a.name.toLowerCase().includes(q) || a.symbol.toLowerCase().includes(q),
  );

  return (
    <>
      <Topbar />
      <main className="mx-auto w-full max-w-6xl px-4 pb-12 lg:px-6">
        <PageTitle>Crypto</PageTitle>

        <label className="relative mt-6 block sm:w-64">
          <span className="sr-only">Search assets</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search assets"
            autoComplete="off"
            className="focus-ring min-h-10 w-full rounded-xl border border-border bg-card pr-3 pl-9 text-sm placeholder:text-muted-foreground"
          />
        </label>

        <Card className="mt-5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-normal">Asset</th>
                <th scope="col" className="px-5 py-3 text-right font-normal">Price</th>
                <th scope="col" className="hidden px-5 py-3 text-right font-normal sm:table-cell">24h</th>
                <th scope="col" className="px-5 py-3 text-right font-normal">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.symbol} className="border-t border-border">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <AssetIcon symbol={a.symbol} />
                      <span>
                        <span className="block font-medium">{a.name}</span>
                        <span className="block text-muted-foreground">{a.symbol}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right font-mono tabular-nums">{formatUsd(a.priceUsd)}</td>
                  <td className="hidden px-5 py-4 text-right sm:table-cell">
                    <Change value={a.change24h} />
                  </td>
                  <td className="px-5 py-4 text-right">
                    {accountId ? (
                      <>
                        <Amount className="block">{formatUsd(a.balance * a.priceUsd)}</Amount>
                        <Amount className="block text-muted-foreground">
                          {a.balance.toLocaleString()} {a.symbol}
                        </Amount>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr className="border-t border-border">
                  <td colSpan={4} className="px-5 py-12 text-center text-muted-foreground">
                    No assets match &ldquo;{query}&rdquo;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        {!accountId && (
          <p className="mt-4 text-sm text-muted-foreground">
            Connect your wallet to see balances. Prices are shown for everyone.
          </p>
        )}
      </main>
    </>
  );
}
