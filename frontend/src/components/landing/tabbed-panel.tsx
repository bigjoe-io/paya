"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export type Tab = {
  id: string;
  label: string;
  description: string;
  panel: ReactNode;
};

const AUTO_ADVANCE_MS = 6000;

/**
 * Tabbed showcase with progress bars, like the reference's "Fuse Card / Swaps /
 * Earn" rotator. Auto-advances until the user picks a tab; respects
 * prefers-reduced-motion by not auto-advancing at all.
 */
export function TabbedPanel({
  tabs,
  heading,
  id,
  reverse = false,
}: {
  tabs: Tab[];
  heading: ReactNode;
  id?: string;
  /** Panel on the left, text on the right. */
  reverse?: boolean;
}) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (paused) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = setInterval(
      () => setActive((i) => (i + 1) % tabs.length),
      AUTO_ADVANCE_MS,
    );
    return () => clearInterval(t);
  }, [paused, tabs.length]);

  function select(i: number) {
    setActive(i);
    setPaused(true);
  }

  function onKeyDown(e: KeyboardEvent, i: number) {
    const last = tabs.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = i === last ? 0 : i + 1;
    if (e.key === "ArrowLeft") next = i === 0 ? last : i - 1;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    select(next);
    tabRefs.current[next]?.focus();
  }

  const current = tabs[active];

  return (
    <section
      id={id}
      className="container-page grid scroll-mt-20 items-center gap-10 py-16 md:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] md:gap-16 md:py-24"
    >
      <div className={cn(reverse && "md:order-2")}>
        <h2 className="max-w-md text-3xl font-semibold tracking-tight text-balance md:text-4xl">{heading}</h2>

        <div role="tablist" aria-label="Features" className="mt-8 flex gap-3" onMouseEnter={() => setPaused(true)}>
          {tabs.map((tab, i) => (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              id={`${baseId}-tab-${i}`}
              aria-selected={i === active}
              aria-controls={`${baseId}-panel`}
              tabIndex={i === active ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className="focus-ring group -m-2 rounded-md p-2"
            >
              <span className="sr-only">{tab.label}</span>
              <span aria-hidden="true" className="block h-1 w-14 overflow-hidden rounded-full bg-border md:w-20">
                <span
                  className={cn(
                    "block h-full origin-left rounded-full bg-accent transition-transform duration-200 ease-out",
                    i === active ? (paused ? "scale-x-100" : "animate-progress") : "scale-x-0",
                  )}
                />
              </span>
            </button>
          ))}
        </div>

        <div className="mt-6 min-h-32 max-w-md" aria-live="polite">
          <h3 className="text-lg font-semibold tracking-tight">{current.label}</h3>
          <p className="mt-2 text-muted-foreground text-pretty">{current.description}</p>
        </div>
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${active}`}
        className={cn(
          "relative flex min-h-96 items-center justify-center overflow-hidden rounded-4xl bg-card p-6 md:min-h-112 md:p-10",
          reverse && "md:order-1",
        )}
      >
        {current.panel}
      </div>

      <style>{`
        @keyframes paya-progress { from { transform: scaleX(0) } to { transform: scaleX(1) } }
        .animate-progress { animation: paya-progress ${AUTO_ADVANCE_MS}ms linear forwards; }
        @media (prefers-reduced-motion: reduce) { .animate-progress { animation: none; transform: scaleX(1) } }
      `}</style>
    </section>
  );
}
