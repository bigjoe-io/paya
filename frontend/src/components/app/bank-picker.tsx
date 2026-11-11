"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Landmark, Search } from "lucide-react";
import type { Bank } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Words that don't help tell banks apart. */
const NOISE = new Set(["bank", "plc", "limited", "ltd", "of", "the", "and", "&", "microfinance", "mfb", "nigeria", "ng"]);
const STOP = new Set(["of", "the", "and", "for", "&"]);
/** Names people actually type. */
const ALIASES: Record<string, string> = {
  gtb: "guaranty trust",
  gtbank: "guaranty trust",
  gtco: "guaranty trust",
  firstbank: "first bank",
  stanbic: "stanbic ibtc",
  stanchart: "standard chartered",
  mpesa: "safaricom",
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Score how well a bank name matches what was typed. 0 = no match. */
export function scoreBank(name: string, rawQuery: string): number {
  const q = norm(rawQuery);
  if (!q) return 1;
  const n = norm(name);
  const words = n.split(" ");
  // "UBA" = United Bank (for) Africa, "FCMB", "GTB": skip only the small words…
  const initials = words.filter((w) => !STOP.has(w)).map((w) => w[0]).join("");
  // …or every non-noise word ("Zenith Bank PLC" → "z")
  const core = words.filter((w) => !NOISE.has(w)).map((w) => w[0]).join("");
  const target = ALIASES[q.replace(/\s/g, "")];

  if (n === q) return 1000;
  if (target && n.includes(target)) return 900;
  if (n.startsWith(q)) return 800 - n.length;
  const flatQ = q.replace(/\s/g, "");
  if (flatQ.length >= 2 && (initials === flatQ || core === flatQ)) return 750;
  if (words.some((w) => w.startsWith(q))) return 700 - n.length;
  // every typed word is the start of some word: "un ba af" → United Bank for Africa
  const qWords = q.split(" ").filter((w) => !NOISE.has(w) || q.split(" ").length === 1);
  if (qWords.length && qWords.every((qw) => words.some((w) => w.startsWith(qw)))) return 600 - n.length;
  if (flatQ.length >= 2 && initials.startsWith(flatQ)) return 550;
  if (n.includes(q)) return 500 - n.indexOf(q);
  // typo-tolerant: letters appear in order (e.g. "zenth" → Zenith)
  const flat = n.replace(/\s/g, "");
  const fq = q.replace(/\s/g, "");
  let i = 0;
  let gaps = 0;
  let last = -1;
  for (const ch of fq) {
    const at = flat.indexOf(ch, i);
    if (at < 0) return 0;
    if (last >= 0) gaps += at - last - 1;
    last = at;
    i = at + 1;
  }
  return fq.length >= 3 && gaps <= fq.length * 2 ? 300 - gaps : 0;
}

/**
 * Searchable bank picker. Shows the full list on open; typing narrows it
 * to the closest names (prefix, initials like "GTB" or "UBA", words in any
 * order, small typos). Arrow keys, Enter and Escape work as expected.
 */
export function BankPicker({
  banks,
  value,
  onChange,
  labelId,
}: {
  banks: Bank[];
  value: string;
  onChange: (id: string) => void;
  labelId: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = banks.find((b) => b.id === value);

  const results = useMemo(() => {
    if (!query.trim()) return banks;
    return banks
      .map((b) => ({ b, s: scoreBank(b.name, query) }))
      .filter((x) => x.s > 0)
      .sort((a, z) => z.s - a.s || a.b.name.localeCompare(z.b.name))
      .map((x) => x.b);
  }, [banks, query]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // keep the highlighted row in view
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // close when focus/click leaves the picker
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function openPicker() {
    setQuery("");
    const i = banks.findIndex((b) => b.id === value);
    setActive(i < 0 ? 0 : i);
    setOpen(true);
  }

  function choose(b: Bank) {
    onChange(b.id);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const b = results[active];
      if (b) choose(b);
    } else if (e.key === "Escape") {
      // don't let the surrounding <dialog> close too
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "Tab") setOpen(false);
  }

  return (
    <div ref={rootRef} className="mt-1.5">
      {!open ? (
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={false}
          aria-labelledby={labelId}
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || (e.key.length === 1 && /\S/.test(e.key))) {
              e.preventDefault();
              openPicker();
              if (e.key.length === 1) setQuery(e.key);
            }
          }}
          className="focus-ring flex min-h-11 w-full items-center gap-2 rounded-xl border border-border bg-panel pr-3 pl-3 text-left text-base"
        >
          <span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.name : banks.length ? "Search or choose a bank" : "No banks available"}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      ) : (
        <div className="overflow-hidden rounded-xl border border-foreground/40 bg-panel shadow-sm">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-labelledby={labelId}
              aria-autocomplete="list"
              aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKey}
              placeholder="Type your bank's name"
              autoComplete="off"
              spellCheck={false}
              className="min-h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {query ? `${results.length} found` : `${banks.length} banks`}
            </span>
          </div>
          <ul ref={listRef} id={listId} role="listbox" aria-labelledby={labelId} className="max-h-64 overflow-y-auto overscroll-contain p-1">
            {results.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                No bank matches “{query}”. Try fewer letters.
              </li>
            ) : (
              results.map((b, i) => (
                <li
                  key={b.id}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={b.id === value}
                  onPointerMove={() => setActive(i)}
                  onPointerDown={(e) => e.preventDefault() /* keep focus in the input */}
                  onClick={() => choose(b)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm",
                    i === active && "bg-card",
                  )}
                >
                  {b.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.logo} alt="" className="size-6 shrink-0 rounded-full bg-card object-contain" loading="lazy" />
                  ) : (
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/10">
                      <Landmark className="size-3" aria-hidden="true" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    <Highlight text={b.name} query={query} />
                  </span>
                  {b.id === value && <Check className="size-4 shrink-0" aria-hidden="true" />}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-semibold text-foreground">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}
