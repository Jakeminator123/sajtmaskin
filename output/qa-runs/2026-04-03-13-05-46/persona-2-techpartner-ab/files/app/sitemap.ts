import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/site-data";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/om-oss", "/priser", "/kontakt"];

  return routes.map((route, index) => ({
    url: `${siteConfig.url}${route}`,
    lastModified: new Date("2025-01-01"),
    changeFrequency: index === 0 ? "weekly" : "monthly",
    priority: index === 0 ? 1 : 0.8,
  }));
}