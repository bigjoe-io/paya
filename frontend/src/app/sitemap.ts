import type { MetadataRoute } from "next";
import { getAllPosts, SITE_URL } from "@/blog/registry";

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts();
  const latest = posts[0]?.date ?? new Date().toISOString().slice(0, 10);
  return [
    { url: SITE_URL, lastModified: latest, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/blog`, lastModified: latest, changeFrequency: "weekly", priority: 0.8 },
    ...posts.map((p) => ({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified: p.date,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
