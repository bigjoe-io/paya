import type { Metadata } from "next";
import { DOCS_GROUPS, getAllDocs, searchIndex } from "@/docs/registry";
import { DocsSidebar, DocsTopBar, type NavGroup } from "@/components/docs/docs-chrome";

export const metadata: Metadata = {
  title: { default: "Docs · Paya", template: "%s · Paya docs" },
  description: "How to use Paya: cash out NEAR to your bank, buy NEAR with a bank transfer, fees, limits and security.",
};

export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  const pages = getAllDocs();
  const groups: NavGroup[] = DOCS_GROUPS.map((group) => ({
    group,
    pages: pages.filter((p) => p.group === group).map((p) => ({ slug: p.slug, title: p.title })),
  })).filter((g) => g.pages.length > 0);

  return (
    <div id="top" className="min-h-dvh bg-background text-foreground">
      <DocsTopBar groups={groups} index={searchIndex()} />
      <div className="mx-auto flex max-w-7xl gap-10 px-4 sm:px-6">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 overflow-y-auto py-8 pr-2 lg:block">
          <DocsSidebar groups={groups} />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
