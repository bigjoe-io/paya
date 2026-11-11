// Server-only (node:fs). Blog posts live in src/blog/posts/<slug>.md with frontmatter:
//   title, summary, category, date (YYYY-MM-DD), cover (buy | both), coverText, keywords (comma list)
import fs from "node:fs";
import path from "node:path";

export type CoverKind = "buy" | "both";
export type Post = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  date: string;
  cover: CoverKind;
  coverText: string;
  keywords: string[];
  body: string;
};

export const SITE_URL = "https://www.usepaya.xyz";
const DIR = path.join(process.cwd(), "src", "blog", "posts");

const unquote = (v: string) => v.replace(/^"(.*)"$/, "$1");

let cache: Post[] | undefined;

export function getAllPosts(): Post[] {
  if (cache && process.env.NODE_ENV === "production") return cache;
  cache = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const raw = fs.readFileSync(path.join(DIR, file), "utf8");
      const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
      if (!m) throw new Error(`blog/${file}: missing frontmatter`);
      const d: Record<string, string> = {};
      for (const line of m[1].split("\n")) {
        const i = line.indexOf(":");
        if (i > 0) d[line.slice(0, i).trim()] = unquote(line.slice(i + 1).trim());
      }
      return {
        slug: file.replace(/\.md$/, ""),
        title: d.title,
        summary: d.summary ?? "",
        category: d.category ?? "Announcements",
        date: d.date,
        cover: (d.cover === "buy" ? "buy" : "both") as CoverKind,
        coverText: d.coverText ?? d.title,
        keywords: (d.keywords ?? "").split(",").map((k) => k.trim()).filter(Boolean),
        body: raw.slice(m[0].length),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  return cache;
}

export const getPost = (slug: string) => getAllPosts().find((p) => p.slug === slug);

/** "### Question" lines under the "Frequently asked questions" heading, for FAQPage structured data. */
export function faqs(body: string) {
  const start = body.indexOf("## Frequently asked questions");
  if (start < 0) return [];
  const out: { q: string; a: string }[] = [];
  for (const block of body.slice(start).split(/\n### /).slice(1)) {
    const [q, ...rest] = block.split("\n");
    const a = rest.join(" ").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
    if (q && a) out.push({ q: q.trim(), a });
  }
  return out;
}

export const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
