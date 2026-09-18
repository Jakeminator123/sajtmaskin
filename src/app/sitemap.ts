import type { MetadataRoute } from "next";
import { publicCanonicalPath } from "@/lib/public-canonical-url";
import { getIndexableSeoLandingRelPaths } from "@/lib/seo-landing-pages/registry";

/**
 * Relativa marknads-/juridik-vägar i sitemap (för regression).
 * **Checklista när du lägger till en ny publik sida:**
 * - Vanlig produktsida: skapa `src/app/.../page.tsx`, lägg vägen här,
 *   uppdatera relevant footer om sidan ska länkas, kör sitemap-testet.
 * - SEO-landningssida: registrera i `src/lib/seo-landing-pages/registry.ts`
 *   och sätt `status: "ready"` först när sidan har unikt indexerbart innehåll.
 *   Sitemap hämtar de sidorna automatiskt — lägg inte placeholders här.
 *
 * Auth-gatingade eller noindex-ytor (`/buy-credits`, `/analys`, `/builder`, …)
 * hör inte här. `lastModified` utelämnas medvetet — körningstid är inte ett
 * ändringsdatum.
 */
export const STATIC_SITEMAP_REL_PATHS = [
  "",
  "/templates",
  "/teknik",
  "/faq",
  "/om",
  "/blogg",
  "/terms",
  "/privacy",
] as const;

export const SITEMAP_CATEGORY_SLUGS = [
  "ai",
  "animations",
  "components",
  "login-and-sign-up",
  "blog-and-portfolio",
  "design-systems",
  "layouts",
  "website-templates",
  "apps-and-games",
] as const;

function sitemapEntry(path: string): MetadataRoute.Sitemap[number] {
  return { url: publicCanonicalPath(path) };
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...STATIC_SITEMAP_REL_PATHS.map((path) => sitemapEntry(path)),
    ...SITEMAP_CATEGORY_SLUGS.map((category) => sitemapEntry(`/category/${category}`)),
    ...getIndexableSeoLandingRelPaths().map((path) => sitemapEntry(path)),
  ];
}
