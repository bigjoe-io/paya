// Server-only (node:fs). Import from server components and route handlers only.
import fs from "node:fs";
import path from "node:path";

/**
 * Docs pages live in src/docs/content/<slug>.md with a small frontmatter block:
 *
 *   ---
 *   title: Cash out
 *   summary: One line shown under the title, in search and in llms.txt.
 *   group: Using Paya
 *   order: 3
 *   tags: fees-and-limits, troubleshooting      (optional related-page chips)
 *   ---
 */
export const DOCS_GROUPS = ["Get started", "Using Paya", "Fees & security", "Help", "Developers"] as const;
export type DocsGroup = (typeof DOCS_GROUPS)[number];

export type DocPage = {
  slug: string;
  title: string;
  summary: string;
  group: DocsGroup;
  order: number;
  tags: string[];
  body: string;
};

const CONTENT_DIR = path.join(process.cwd(), "src", "docs", "content");

function parse(raw: string, file: string) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  if (!m) throw new Error(`docs/${file}: missing frontmatter`);
  const data: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) data[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { data, body: raw.slice(m[0].length) };
}

let cache: DocPage[] | undefined;

export function getAllDocs(): DocPage[] {
  if (cache && process.env.NODE_ENV === "production") return cache;
  const pages = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((file): DocPage => {
      const { data, body } = parse(fs.readFileSync(path.join(CONTENT_DIR, file), "utf8"), file);
      const group = data.group as DocsGroup;
      if (!data.title || !DOCS_GROUPS.includes(group)) throw new Error(`docs/${file}: needs a title and a valid group`);
      return {
        slug: file.replace(/\.md$/, ""),
        title: data.title,
        summary: data.summary ?? "",
        group,
        order: Number(data.order ?? 99),
        tags: (data.tags ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        body,
      };
    })
    .sort((a, b) => DOCS_GROUPS.indexOf(a.group) - DOCS_GROUPS.indexOf(b.group) || a.order - b.order);
  cache = pages;
  return pages;
}

export const getDoc = (slug: string) => getAllDocs().find((p) => p.slug === slug);

export function siblings(slug: string) {
  const all = getAllDocs();
  const i = all.findIndex((p) => p.slug === slug);
  return { prev: i > 0 ? all[i - 1] : undefined, next: i >= 0 && i < all.length - 1 ? all[i + 1] : undefined };
}

/** The page as plain markdown (for "Copy page" and llms-full.txt). */
export const docMarkdown = (p: DocPage) => `# ${p.title}\n\n> ${p.summary}\n\n${p.body.trim()}\n`;

export type SearchEntry = { slug: string; title: string; group: string; summary: string; headings: string[]; text: string };

export function searchIndex(): SearchEntry[] {
  return getAllDocs().map((p) => ({
    slug: p.slug,
    title: p.title,
    group: p.group,
    summary: p.summary,
    headings: [...p.body.matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1]),
    text: p.body
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[#>*`|[\]()-]/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 4000),
  }));
}
