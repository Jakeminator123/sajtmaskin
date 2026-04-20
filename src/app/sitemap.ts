import type { MetadataRoute } from "next";
import { hrefForSeoLanding } from "@/content/seo/config";
import { URLS } from "@/lib/config";
import { collectAllSeoLandings } from "@/lib/seo/load-landing";

const BASE_URL = URLS.baseUrl;

/**
 * Relativa marknads-/juridik-vägar i sitemap (för regression).
 * **Checklista när du lägger till en ny publik sida:** skapa `src/app/.../page.tsx`, lägg vägen här,
 * uppdatera relevant footer (`landing-footer.tsx` / `components/layout/footer.tsx`) om sidan ska länkas,
 * och kör `npx vitest run src/app/sitemap.test.ts`.
 */
export const STATIC_SITEMAP_REL_PATHS = [
  "",
  "/templates",
  "/buy-credits",
  "/faq",
  "/om",
  "/blogg",
  "/landningssidor",
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

const SEO_LANDING_PRIORITY: Record<string, number> = {
  city: 0.8,
  usecase: 0.8,
  industry: 0.75,
  ai: 0.7,
  compare: 0.7,
  "city-usecase": 0.65,
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPriorities: Record<string, number> = {
    "": 1.0,
    "/templates": 0.9,
    "/buy-credits": 0.7,
    "/faq": 0.5,
    "/om": 0.45,
    "/blogg": 0.45,
    "/landningssidor": 0.5,
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
    "/landningssidor": "weekly",
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

  const landings = await collectAllSeoLandings();
  const seoLandingPages: MetadataRoute.Sitemap = landings.map(({ family, slug, generatedAt }) => {
    const lastModified = generatedAt ? new Date(generatedAt) : now;
    return {
      url: `${BASE_URL}${hrefForSeoLanding(family, slug)}`,
      lastModified: Number.isNaN(lastModified.getTime()) ? now : lastModified,
      changeFrequency: "weekly" as const,
      priority: SEO_LANDING_PRIORITY[family] ?? 0.6,
    };
  });

  return [...staticPages, ...categoryPages, ...seoLandingPages];
}
