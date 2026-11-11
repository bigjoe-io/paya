import type { MetadataRoute } from "next";
import { SITE_URL } from "@/blog/registry";

export default function robots(): MetadataRoute.Robots {
  return {
    // The app, tester gate and docs are behind an access code; only public pages are crawlable.
    rules: { userAgent: "*", allow: "/", disallow: ["/app", "/admin", "/docs", "/api"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
