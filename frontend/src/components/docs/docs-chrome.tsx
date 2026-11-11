"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Check, Copy, ListTree, Menu, Search, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

export type NavPage = { slug: string; title: string };
export type NavGroup = { group: string; pages: NavPage[] };
export type SearchDoc = { slug: string; title: string; group: string; summary: string; headings: string[]; text: string };

const docPath = (slug: string) => (slug ? `/docs/${slug}` : "/docs");

function useCurrentSlug() {
  const pathname = usePathname() ?? "/docs";
  return pathname.replace(/^\/docs\/?/, "").split("/")[0] ?? "";
}

/* ---------- top bar ---------- */

export function DocsTopBar({ groups, index }: { groups: NavGroup[]; index: SearchDoc[] }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          aria-label="Open docs menu"
          onClick={() => setMenuOpen(true)}
          className="focus-ring -ml-2 flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground lg:hidden"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
        <Link href="/docs" className="focus-ring flex items-center gap-2 rounded-full" aria-label="Paya docs home">
          <Logo />
          <span className="text-lg text-muted-foreground">Docs</span>
        </Link>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="focus-ring mx-auto hidden h-10 w-full max-w-md items-center gap-2.5 rounded-xl border border-border bg-panel px-3.5 text-left text-sm text-muted-foreground hover:border-foreground/20 md:flex"
        >
          <Search className="size-4" aria-hidden="true" />
          <span className="flex-1">Search the docs</span>
          <kbd className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px]">⌘K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <button
            type="button"
            aria-label="Search the docs"
            onClick={() => setSearchOpen(true)}
            className="focus-ring flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground md:hidden"
          >
            <Search className="size-[18px]" aria-hidden="true" />
          </button>
          <Link href="/" className="focus-ring hidden min-h-10 items-center rounded-full px-3 text-sm text-muted-foreground hover:text-foreground sm:inline-flex">
            Home
          </Link>
          <Link
            href="/app"
            className="focus-ring inline-flex min-h-10 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background hover:bg-foreground/90"
          >
            Open app
          </Link>
        </div>
      </div>
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} index={index} />
      {menuOpen && <MobileNav groups={groups} onClose={() => setMenuOpen(false)} />}
    </header>
  );
}

/* ---------- sidebar ---------- */

export function DocsSidebar({ groups, onNavigate, className }: { groups: NavGroup[]; onNavigate?: () => void; className?: string }) {
  const slug = useCurrentSlug();
  return (
    <nav aria-label="Docs pages" className={className}>
      <Link
        href="/docs"
        onClick={onNavigate}
        aria-current={slug === "" ? "page" : undefined}
        className={cn(
          "focus-ring mb-6 block rounded-xl px-3 py-2 text-[15px]",
          slug === "" ? "bg-card font-medium text-foreground" : "text-foreground/75 hover:bg-card/70 hover:text-foreground",
        )}
      >
        Overview
      </Link>
      {groups.map((g) => (
        <div key={g.group} className="mb-6">
          <p className="mb-2 px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.group}</p>
          <ul className="space-y-0.5">
            {g.pages.map((p) => {
              const active = p.slug === slug;
              return (
                <li key={p.slug}>
                  <Link
                    href={docPath(p.slug)}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "focus-ring block rounded-xl px-3 py-2 text-[15px] transition-colors duration-100",
                      active ? "bg-card font-medium text-foreground" : "text-foreground/75 hover:bg-card/70 hover:text-foreground",
                    )}
                  >
                    {p.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function MobileNav({ groups, onClose }: { groups: NavGroup[]; onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Docs menu">
      <button type="button" aria-label="Close menu" className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 flex w-[300px] max-w-[85vw] flex-col overflow-y-auto border-r border-border bg-background p-4">
        <div className="mb-6 flex items-center justify-between">
          <Logo />
          <button type="button" aria-label="Close menu" onClick={onClose} className="focus-ring flex size-10 items-center justify-center rounded-full text-muted-foreground hover:text-foreground">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <DocsSidebar groups={groups} onNavigate={onClose} />
      </div>
    </div>
  );
}

/* ---------- on this page ---------- */

export function Toc({ items }: { items: { id: string; text: string; level: 2 | 3 }[] }) {
  const [active, setActive] = useState<string | undefined>(items[0]?.id);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => Boolean(e));
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -65% 0px" },
    );
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, [items]);
  if (!items.length) return null;
  return (
    <nav aria-label="On this page" className="text-sm">
      <p className="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <ListTree className="size-3.5" aria-hidden="true" /> On this page
      </p>
      <ul className="space-y-0.5 border-l border-border">
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              className={cn(
                "-ml-px block border-l py-1.5 transition-colors duration-100",
                i.level === 3 ? "pl-6" : "pl-4",
                active === i.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {i.text}
            </a>
          </li>
        ))}
      </ul>
      <a href="#top" className="mt-5 inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
        Back to top <ArrowUp className="size-3.5" aria-hidden="true" />
      </a>
    </nav>
  );
}

/* ---------- copy page ---------- */

export function CopyPageButton({ markdown }: { markdown: string }) {
  const [done, setDone] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      setDone(false);
    }
  }, [markdown]);
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="focus-ring inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-panel px-3.5 text-[13px] text-muted-foreground hover:text-foreground"
    >
      {done ? <Check className="size-3.5 text-success" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      {done ? "Copied" : "Copy page"}
    </button>
  );
}

export function DocLink({ slug, className, children }: { slug: string; className?: string; children: ReactNode }) {
  return (
    <Link href={docPath(slug)} className={className}>
      {children}
    </Link>
  );
}

/* ---------- search ---------- */

function score(doc: SearchDoc, terms: string[]) {
  let s = 0;
  const title = doc.title.toLowerCase();
  const heads = doc.headings.join(" ").toLowerCase();
  const summary = doc.summary.toLowerCase();
  const text = doc.text.toLowerCase();
  for (const t of terms) {
    const hit = title.includes(t) || heads.includes(t) || summary.includes(t) || text.includes(t);
    if (!hit) return 0;
    if (title.includes(t)) s += 10;
    if (heads.includes(t)) s += 5;
    if (summary.includes(t)) s += 3;
    if (text.includes(t)) s += 1;
  }
  return s;
}

function SearchPalette({ open, onClose, index }: { open: boolean; onClose: () => void; index: SearchDoc[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const router = useRouter();
  const listId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return index.slice(0, 8);
    return index
      .map((d) => ({ d, s: score(d, terms) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 10)
      .map((r) => r.d);
  }, [q, index]);

  const go = (slug: string) => {
    ref.current?.close();
    router.push(docPath(slug));
  };

  return (
    <dialog
      ref={ref}
      aria-label="Search the docs"
      onClose={() => {
        setQ("");
        setSel(0);
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="mx-auto mt-[12vh] w-[min(100%-2rem,36rem)] rounded-3xl border border-border bg-panel p-0 text-foreground shadow-xl backdrop:bg-foreground/20 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Search className="size-[18px] text-muted-foreground" aria-hidden="true" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-label="Search the docs"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((s) => Math.min(s + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((s) => Math.max(s - 1, 0));
            } else if (e.key === "Enter" && results[sel]) go(results[sel].slug);
          }}
          placeholder="Search: cash out, fees, BVN, refund…"
          className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
      </div>
      <ul id={listId} role="listbox" aria-label="Results" className="max-h-[55vh] overflow-y-auto p-2">
        {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted-foreground">No pages match “{q}”.</li>}
        {results.map((r, i) => (
          <li key={r.slug} role="option" aria-selected={i === sel}>
            <button
              type="button"
              onMouseEnter={() => setSel(i)}
              onClick={() => go(r.slug)}
              className={cn("w-full rounded-xl px-3 py-2.5 text-left", i === sel && "bg-card")}
            >
              <span className="block text-[15px] font-medium">{r.title}</span>
              <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                {r.group} · {r.summary}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
