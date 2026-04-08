import { siteConfig } from "@/lib/site";
import type { MetadataRoute } from "next";




export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/om-oss", "/priser", "/galleri", "/boka", "/kontakt"];

  return routes.map((route) => ({
    url: `${siteConfig.url}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.8,
  }));
}