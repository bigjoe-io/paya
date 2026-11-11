import { DOCS_GROUPS, getAllDocs } from "@/docs/registry";

/** Index of the docs for AI assistants (llmstxt.org). */
export function GET() {
  const pages = getAllDocs();
  const sections = DOCS_GROUPS.map((g) => {
    const list = pages.filter((p) => p.group === g);
    return list.length ? `## ${g}\n\n${list.map((p) => `- [${p.title}](/docs/${p.slug}): ${p.summary}`).join("\n")}` : "";
  }).filter(Boolean);
  const body = `# Paya\n\n> Turn NEAR into money in your bank account in Nigeria, Ghana, Kenya, Tanzania and South Africa, or buy NEAR with a bank transfer. Sign in with email; no wallet to connect.\n\nFull text of every page: /llms-full.txt\n\n${sections.join("\n\n")}\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
