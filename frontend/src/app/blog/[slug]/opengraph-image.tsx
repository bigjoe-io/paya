import { ogCard } from "../../og";
import { getAllPosts, getPost } from "@/blog/registry";

export const alt = "Paya blog";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const generateStaticParams = () => getAllPosts().map((p) => ({ slug: p.slug }));

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const p = getPost((await params).slug);
  return ogCard(p?.title ?? "Paya blog", p ? `${p.category} · Paya blog` : "Paya");
}
