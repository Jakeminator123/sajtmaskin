import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site-data";



export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/om-oss", "/meny", "/boka", "/kontakt"];

  return routes.map((route) => ({
    url: `${siteConfig.url}${route}`,
    lastModified: new Date("2025-01-01"),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.8,
  }));
}