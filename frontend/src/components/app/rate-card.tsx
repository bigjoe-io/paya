"use client";

import { useEffect, useState } from "react";
import { api, formatNgn, type Estimate } from "@/lib/api";

/** Live rate with every cost on the table. Refreshes every minute. */
export function RateCard() {
  const [near, setNear] = useState(10);
  const [est, setEst] = useState<Estimate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .estimate(near)
        .then((e) => {
          if (!cancelled) {
            setEst(e);
            setError(null);
          }
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message);
        });
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [near]);

  return (
    <section className="glass-card rounded-3xl p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Rate right now</p>
        {est && (
          <p className="font-mono text-sm tabular-nums">
            1 NEAR ≈ {formatNgn(est.rate.ngnPerNear)}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <label htmlFor="rate-near" className="sr-only">
          NEAR amount
        </label>
        <input
          id="rate-near"
          type="text"
          inputMode="decimal"
          value={near}
          onChange={(e) => setNear(Math.max(0, Number(e.target.value.replace(/[^0-9.]/g, "")) || 0))}
          className="focus-ring w-24 rounded-lg border border-border bg-panel px-2 py-1 text-right font-mono text-lg tabular-nums"
        />
        <span className="text-muted-foreground">NEAR →</span>
        <span className="font-mono text-2xl font-semibold tabular-nums text-success">
          {est ? formatNgn(est.netNgn) : "—"}
        </span>
      </div>

      {est && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground sm:grid-cols-4">
          <div>
            <dt>USDC after swap</dt>
            <dd className="font-mono text-foreground tabular-nums">${est.usdcEstimate.toFixed(2)}</dd>
          </div>
          <div>
            <dt>USDC → NGN</dt>
            <dd className="font-mono text-foreground tabular-nums">{formatNgn(est.rate.ngnPerUsdc)}</dd>
          </div>
          <div>
            <dt>Bank transfer fee</dt>
            <dd className="font-mono text-foreground tabular-nums">−{formatNgn(est.railFeeNgn)}</dd>
          </div>
          <div>
            <dt>Paya fee ({(est.marginBps / 100).toFixed(2)}%)</dt>
            <dd className="font-mono text-foreground tabular-nums">−{formatNgn(est.marginNgn)}</dd>
          </div>
        </dl>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs text-warning">
          Rate unavailable: {error}
        </p>
      )}
    </section>
  );
}
