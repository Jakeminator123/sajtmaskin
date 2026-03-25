import type { MetadataRoute } from "next";
import { URLS } from "@/lib/config";

const BASE_URL = URLS.baseUrl;

/** Relativa marknads-/juridik-vägar i sitemap (för regression — håll i linje med footer och sidor under `src/app`). */
export const STATIC_SITEMAP_REL_PATHS = [
  "",
  "/templates",
  "/buy-credits",
  "/faq",
  "/om",
  "/blogg",
  "/terms",
  "/privacy",
] as const;

const CATEGORIES = [
  "ai",
  "animations",
  "components",
  "login-and-sign-up",
  "blog-and-portfolio",
  "design-systems",
  "layouts",
  "website-templates",
  "apps-and-games",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPriorities: Record<string, number> = {
    "": 1.0,
    "/templates": 0.9,
    "/buy-credits": 0.7,
    "/faq": 0.5,
    "/om": 0.45,
    "/blogg": 0.45,
    "/terms": 0.3,
    "/privacy": 0.3,
  };

  const staticFrequencies: Record<string, "weekly" | "monthly" | "yearly"> = {
    "": "weekly",
    "/templates": "weekly",
    "/buy-credits": "monthly",
    "/faq": "monthly",
    "/om": "monthly",
    "/blogg": "weekly",
    "/terms": "yearly",
    "/privacy": "yearly",
  };

  const staticPages: MetadataRoute.Sitemap = STATIC_SITEMAP_REL_PATHS.map((path) => ({
    url: path === "" ? BASE_URL : `${BASE_URL}${path}`,
    lastModified: now,
    changeFrequency: staticFrequencies[path] ?? "monthly",
    priority: staticPriorities[path] ?? 0.5,
  }));

  const categoryPages: MetadataRoute.Sitemap = CATEGORIES.map((category) => ({
    url: `${BASE_URL}/category/${category}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticPages, ...categoryPages];
}
