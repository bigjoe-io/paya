import { docMarkdown, getAllDocs } from "@/docs/registry";

/** Every docs page in one file, for AI assistants. */
export function GET() {
  const body = getAllDocs().map(docMarkdown).join("\n---\n\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
