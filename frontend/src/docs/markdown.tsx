import Link from "next/link";
import type { ReactNode } from "react";
import { Info, Lightbulb, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Renders the docs' markdown subset to React (server-safe, no raw HTML):
 * ## / ### headings, paragraphs, - and 1. lists (one nesting level), fenced
 * code with an optional title="…", GFM tables, > [!NOTE] / [!TIP] / [!WARNING]
 * callouts, > quotes, --- rules, and inline `code`, **bold**, *italic*, [links](…).
 */

export type TocItem = { id: string; text: string; level: 2 | 3 };

export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/** Only http(s), mailto, site-relative and in-page links survive. */
function safeHref(href: string) {
  const h = href.trim();
  if (/^https?:\/\//i.test(h) || /^mailto:/i.test(h)) return h;
  if (h.startsWith("/") && !h.startsWith("//")) return h;
  if (h.startsWith("#")) return h;
  return undefined;
}

/* ---------- inline ---------- */

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))/;

function inline(text: string, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;
  while (rest.length > 0) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const token = m[0];
    const key = `${keyPrefix}-${n++}`;
    if (m[1]) {
      out.push(
        <code key={key} className="rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[0.86em] text-foreground">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (m[2]) {
      out.push(
        <strong key={key} className="font-semibold text-foreground">
          {inline(token.slice(2, -2), key)}
        </strong>,
      );
    } else if (m[3]) {
      out.push(<em key={key}>{inline(token.slice(1, -1), key)}</em>);
    } else {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      const label = lm ? lm[1] : token;
      const href = lm ? safeHref(lm[2]) : undefined;
      const cls = "focus-ring rounded font-medium text-foreground underline decoration-foreground/30 underline-offset-[3px] hover:decoration-foreground";
      if (!href) out.push(<span key={key}>{inline(label, key)}</span>);
      else if (/^(https?:|mailto:)/i.test(href))
        out.push(
          <a key={key} href={href} target="_blank" rel="noopener noreferrer" className={cls}>
            {inline(label, key)}
          </a>,
        );
      else
        out.push(
          <Link key={key} href={href} className={cls}>
            {inline(label, key)}
          </Link>,
        );
    }
    rest = rest.slice(m.index + token.length);
  }
  return out;
}

const plain = (text: string) =>
  text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

/* ---------- blocks ---------- */

type Tone = "note" | "tip" | "warning";
type ListItem = { text: string; children: { ordered: boolean; items: string[] } | null };
type Block =
  | { kind: "heading"; level: 2 | 3; text: string; id: string }
  | { kind: "para"; text: string }
  | { kind: "code"; lang?: string; title?: string; code: string }
  | { kind: "list"; ordered: boolean; items: ListItem[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "callout"; tone: Tone; text: string[] }
  | { kind: "quote"; text: string[] }
  | { kind: "hr" };

function splitRow(line: string) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  let code = false;
  for (const ch of s) {
    if (ch === "`") code = !code;
    if (ch === "|" && !code) {
      cells.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

const CALLOUTS: Record<string, Tone> = { NOTE: "note", TIP: "tip", WARNING: "warning", CAUTION: "warning", IMPORTANT: "note" };

function joinParagraphs(lines: string[]) {
  const out: string[] = [];
  let cur: string[] = [];
  for (const l of lines) {
    if (l.trim() === "") {
      if (cur.length) out.push(cur.join(" "));
      cur = [];
    } else cur.push(l.trim());
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}

function parse(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  const used = new Map<string, number>();
  const uid = (text: string) => {
    const base = slugify(plain(text)) || "section";
    const c = used.get(base) ?? 0;
    used.set(base, c + 1);
    return c === 0 ? base : `${base}-${c}`;
  };
  const isTable = (i: number) => lines[i].trim().startsWith("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1]);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    const fence = /^(`{3,})\s*([\w-]*)\s*(?:title="([^"]*)")?\s*$/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(fence[1])) body.push(lines[i++]);
      i++;
      blocks.push({ kind: "code", lang: fence[2] || undefined, title: fence[3], code: body.join("\n") });
      continue;
    }
    const h = /^(#{2,3})\s+(.+)$/.exec(line);
    if (h) {
      blocks.push({ kind: "heading", level: h[1].length as 2 | 3, text: h[2].trim(), id: uid(h[2].trim()) });
      i++;
      continue;
    }
    if (/^-{3,}\s*$/.test(line)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const q: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) q.push(lines[i++].replace(/^>\s?/, ""));
      const mark = /^\[!(\w+)\]\s*$/.exec(q[0] ?? "");
      if (mark && CALLOUTS[mark[1].toUpperCase()]) blocks.push({ kind: "callout", tone: CALLOUTS[mark[1].toUpperCase()], text: joinParagraphs(q.slice(1)) });
      else blocks.push({ kind: "quote", text: joinParagraphs(q) });
      continue;
    }
    if (isTable(i)) {
      const head = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(splitRow(lines[i++]));
      blocks.push({ kind: "table", head, rows });
      continue;
    }
    const ls = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (ls && ls[1].length === 0) {
      const ordered = /\d/.test(ls[2]);
      const items: ListItem[] = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (m && m[1].length === 0) {
          items.push({ text: m[3], children: null });
          i++;
        } else if (m && m[1].length >= 2 && items.length) {
          const last = items[items.length - 1];
          if (!last.children) last.children = { ordered: /\d/.test(m[2]), items: [] };
          last.children.items.push(m[3]);
          i++;
        } else if (lines[i].trim() !== "" && /^\s{2,}\S/.test(lines[i]) && items.length) {
          items[items.length - 1].text += " " + lines[i].trim();
          i++;
        } else break;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{2,3})\s/.test(lines[i]) &&
      !/^`{3,}/.test(lines[i]) &&
      !lines[i].startsWith(">") &&
      !/^([-*]|\d+\.)\s/.test(lines[i]) &&
      !isTable(i)
    )
      para.push(lines[i++].trim());
    blocks.push({ kind: "para", text: para.join(" ") });
  }
  return blocks;
}

export function toc(md: string): TocItem[] {
  return parse(md)
    .filter((b): b is Extract<Block, { kind: "heading" }> => b.kind === "heading")
    .map((b) => ({ id: b.id, text: plain(b.text), level: b.level }));
}

const TONES: Record<Tone, { icon: typeof Info; cls: string; label: string }> = {
  note: { icon: Info, cls: "border-border bg-card", label: "Note" },
  tip: { icon: Lightbulb, cls: "border-success/30 bg-success-soft", label: "Tip" },
  warning: { icon: TriangleAlert, cls: "border-warning/30 bg-warning-soft", label: "Important" },
};

export function Markdown({ source }: { source: string }) {
  return <div>{parse(source).map((b, i) => render(b, `b${i}`))}</div>;
}

function render(b: Block, key: string): ReactNode {
  switch (b.kind) {
    case "heading":
      return b.level === 2 ? (
        <h2 key={key} id={b.id} className="mt-12 scroll-mt-28 text-2xl font-semibold tracking-tight text-balance first:mt-0">
          <a href={`#${b.id}`} className="focus-ring rounded">
            {inline(b.text, key)}
          </a>
        </h2>
      ) : (
        <h3 key={key} id={b.id} className="mt-8 scroll-mt-28 text-lg font-semibold tracking-tight">
          <a href={`#${b.id}`} className="focus-ring rounded">
            {inline(b.text, key)}
          </a>
        </h3>
      );
    case "para":
      return (
        <p key={key} className="mt-4 leading-7 text-foreground/80 text-pretty">
          {inline(b.text, key)}
        </p>
      );
    case "code":
      return (
        <figure key={key} className="mt-5 overflow-hidden rounded-2xl border border-border bg-panel">
          {b.title && <figcaption className="border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">{b.title}</figcaption>}
          <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-6">
            <code>{b.code}</code>
          </pre>
        </figure>
      );
    case "list": {
      const Tag = b.ordered ? "ol" : "ul";
      return (
        <Tag key={key} className={cn("mt-4 space-y-2 pl-6 leading-7 text-foreground/80 marker:text-muted-foreground", b.ordered ? "list-decimal" : "list-disc")}>
          {b.items.map((it, j) => (
            <li key={j} className="pl-1">
              {inline(it.text, `${key}-${j}`)}
              {it.children && (
                <ul className={cn("mt-2 space-y-1.5 pl-5", it.children.ordered ? "list-decimal" : "list-[circle]")}>
                  {it.children.items.map((c, k) => (
                    <li key={k} className="pl-1">
                      {inline(c, `${key}-${j}-${k}`)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </Tag>
      );
    }
    case "table":
      return (
        <div key={key} className="mt-5 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="bg-card">
              <tr>
                {b.head.map((h, j) => (
                  <th key={j} scope="col" className="px-4 py-2.5 font-medium">
                    {inline(h, `${key}-h${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-panel">
              {b.rows.map((r, j) => (
                <tr key={j}>
                  {r.map((c, k) => (
                    <td key={k} className="px-4 py-2.5 align-top leading-6 text-foreground/80">
                      {inline(c, `${key}-${j}-${k}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "callout": {
      const t = TONES[b.tone];
      const Icon = t.icon;
      return (
        <aside key={key} role="note" aria-label={t.label} className={cn("mt-5 flex gap-3 rounded-2xl border p-4 text-sm leading-6", t.cls)}>
          <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="space-y-2">
            {b.text.map((p, j) => (
              <p key={j}>{inline(p, `${key}-${j}`)}</p>
            ))}
          </div>
        </aside>
      );
    }
    case "quote":
      return (
        <blockquote key={key} className="mt-5 border-l-2 border-border pl-4 text-foreground/80">
          {b.text.map((p, j) => (
            <p key={j} className="mt-2 first:mt-0">
              {inline(p, `${key}-${j}`)}
            </p>
          ))}
        </blockquote>
      );
    case "hr":
      return <hr key={key} className="my-10 border-border" />;
  }
}
