import type { MetadataRoute } from "next";
import { SITE_URL } from "@/blog/registry";

export default function robots(): MetadataRoute.Robots {
  return {
    // The app and admin pages are not useful in search results.
    rules: { userAgent: "*", allow: "/", disallow: ["/app", "/admin", "/api"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
