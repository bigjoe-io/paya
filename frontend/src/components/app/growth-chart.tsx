"use client";

import { useId, useRef, useState } from "react";

type Point = { t: number; v: number };

/**
 * Single-series area chart for projected staking growth.
 * One hue (accent), 2px line, recessive grid, right-side value axis,
 * crosshair + tooltip on hover/touch. No legend: a single series is named by
 * the caption below the chart.
 */
export function GrowthChart({
  series,
  years,
  asset,
}: {
  series: Point[];
  years: number;
  asset: string;
}) {
  const id = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const W = 800;
  const H = 300;
  const pad = { top: 16, right: 56, bottom: 28, left: 8 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const maxV = Math.max(...series.map((p) => p.v));
  const niceMax = niceCeil(maxV);
  const x = (t: number) => pad.left + (t / years) * innerW;
  const y = (v: number) => pad.top + innerH - (v / niceMax) * innerH;

  const line = series.map((p, i) => `${i ? "L" : "M"}${x(p.t)} ${y(p.v)}`).join(" ");
  const area = `${line} L${x(years)} ${pad.top + innerH} L${x(0)} ${pad.top + innerH} Z`;

  const ticks = 5;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => (niceMax * i) / ticks);
  const xTicks = [0, years / 2, years];

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const t = Math.min(years, Math.max(0, ((px - pad.left) / innerW) * years));
    const idx = Math.round((t / years) * (series.length - 1));
    setHover(idx);
  }

  const h = hover !== null ? series[hover] : null;

  return (
    <figure className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-labelledby={`${id}-title`}
        className="h-auto w-full touch-none select-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <title id={`${id}-title`}>
          Projected value of staked {asset} over {years} years
        </title>
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* grid + value axis (right, like a price chart) */}
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={pad.left}
              x2={pad.left + innerW}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text
              x={W - pad.right + 10}
              y={y(v)}
              dominantBaseline="middle"
              fontSize="12"
              fill="var(--muted-foreground)"
              className="font-mono tabular-nums"
            >
              {compact(v)}
            </text>
          </g>
        ))}

        {/* time axis */}
        {xTicks.map((t, i) => (
          <text
            key={t}
            x={x(t)}
            y={H - 8}
            fontSize="12"
            fill="var(--muted-foreground)"
            textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
          >
            {i === 0 ? "Now" : `+${Math.round(t)} yrs`}
          </text>
        ))}

        <path d={area} fill={`url(#${id}-fill)`} />
        <path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {h && (
          <g>
            <line
              x1={x(h.t)}
              x2={x(h.t)}
              y1={pad.top}
              y2={pad.top + innerH}
              stroke="var(--muted-foreground)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle cx={x(h.t)} cy={y(h.v)} r="5" fill="var(--accent)" stroke="var(--card)" strokeWidth="2" />
          </g>
        )}
      </svg>

      {/* tooltip, positioned in CSS % so it tracks the responsive SVG */}
      {h && (
        <div
          role="status"
          className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs shadow-sm"
          style={{
            left: `${(x(h.t) / W) * 100}%`,
            top: `${Math.max(0, (y(h.v) / H) * 100 - 14)}%`,
          }}
        >
          <span className="text-muted-foreground">
            {h.t === 0 ? "Now" : `Year ${Math.round(h.t)}`}
          </span>{" "}
          <span className="font-mono font-medium tabular-nums">
            {h.v.toLocaleString("en-US", { maximumFractionDigits: 0 })} {asset}
          </span>
        </div>
      )}
    </figure>
  );
}

function niceCeil(v: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / exp;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * exp;
}

function compact(v: number) {
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K`;
  return String(Math.round(v));
}
