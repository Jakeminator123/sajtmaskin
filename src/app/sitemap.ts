import type { MetadataRoute } from "next";
import { URLS } from "@/lib/config";
import { getIndexableSeoLandingRelPaths } from "@/lib/seo-landing-pages/registry";

const BASE_URL = URLS.baseUrl;

/**
 * Relativa marknads-/juridik-vägar i sitemap (för regression).
 * **Checklista när du lägger till en ny publik sida:**
 * - Vanlig produktsida: skapa `src/app/.../page.tsx`, lägg vägen här,
 *   uppdatera relevant footer om sidan ska länkas, kör sitemap-testet.
 *   `/exempel` länkas från nav och startsida; `LandingFooter` lämnas orörd.
 * - SEO-landningssida: registrera i `src/lib/seo-landing-pages/registry.ts`
 *   och sätt `status: "ready"` först när sidan har unikt indexerbart innehåll.
 *   Sitemap hämtar de sidorna automatiskt — lägg inte placeholders här.
 */
export const STATIC_SITEMAP_REL_PATHS = [
  "",
  "/templates",
  "/teknik",
  "/buy-credits",
  "/faq",
  "/om",
  "/exempel",
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
  const staticPriorities: Record<string, number> = {
    "": 1.0,
    "/templates": 0.9,
    "/teknik": 0.8,
    "/buy-credits": 0.7,
    "/faq": 0.5,
    "/om": 0.45,
    "/exempel": 0.7,
    "/blogg": 0.45,
    "/terms": 0.3,
    "/privacy": 0.3,
  };

  const staticFrequencies: Record<string, "weekly" | "monthly" | "yearly"> = {
    "": "weekly",
    "/templates": "weekly",
    "/teknik": "monthly",
    "/buy-credits": "monthly",
    "/faq": "monthly",
    "/om": "monthly",
    "/exempel": "monthly",
    "/blogg": "weekly",
    "/terms": "yearly",
    "/privacy": "yearly",
  };

  // Omit lastModified: this sitemap has no owned modification dates.
  // `new Date()` at render would mark every static URL as freshly changed
  // on each crawl.
  const staticPages: MetadataRoute.Sitemap = STATIC_SITEMAP_REL_PATHS.map((path) => ({
    url: path === "" ? BASE_URL : `${BASE_URL}${path}`,
    changeFrequency: staticFrequencies[path] ?? "monthly",
    priority: staticPriorities[path] ?? 0.5,
  }));

  const categoryPages: MetadataRoute.Sitemap = CATEGORIES.map((category) => ({
    url: `${BASE_URL}/category/${category}`,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const landingPages: MetadataRoute.Sitemap = getIndexableSeoLandingRelPaths().map((path) => ({
    url: `${BASE_URL}${path}`,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  return [...staticPages, ...categoryPages, ...landingPages];
}
