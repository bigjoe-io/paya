"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

/** Horizontal, snap-scrolling row of cards with round prev/next buttons underneath. */
export function Carousel({ children, label }: { children: React.ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const go = (dir: 1 | -1) => {
    const el = ref.current;
    const card = el?.querySelector<HTMLElement>("[data-card]");
    if (!el || !card) return;
    el.scrollBy({ left: dir * (card.offsetWidth + 24), behavior: "smooth" });
  };

  const btn =
    "focus-ring grid size-12 place-items-center rounded-full border border-border bg-background text-foreground transition-colors duration-100 hover:bg-card disabled:opacity-35 disabled:hover:bg-background";

  return (
    <div>
      <div
        ref={ref}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="focus-ring snap-x snap-mandatory overflow-x-auto scroll-smooth px-4 pb-2 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="mx-auto flex w-max gap-6">{children}</div>
      </div>
      {edge.start && edge.end ? null : (
        <div className="mt-10 flex justify-center gap-4">
          <button type="button" className={btn} onClick={() => go(-1)} disabled={edge.start} aria-label="Previous article">
            <ArrowLeft className="size-5" aria-hidden="true" />
          </button>
          <button type="button" className={btn} onClick={() => go(1)} disabled={edge.end} aria-label="Next article">
            <ArrowRight className="size-5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
