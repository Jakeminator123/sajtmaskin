/**
 * Register of public SEO/marketing landing pages on the Sajtmaskin app.
 *
 * These are ordinary App Router routes on the main domain. They are not
 * separate deploys, iframes, subdomains, or mini-apps.
 *
 * How to add or finish a page:
 * 1. Add or update the entry here (unique ASCII slug, title, description).
 * 2. Create `src/app/<slug>/page.tsx` as a normal server page. Copy
 *    `src/app/skapa-hemsida-med-ai/page.tsx` or another sibling.
 * 3. Replace the blue placeholder with the real extracted design/content.
 *    Pull components, CSS and assets into Sajtmaskin — do not embed another
 *    Next/Vite app. Keep page CSS scoped (wrapper class or CSS module);
 *    do not dump imported globals into `src/app/globals.css`.
 * 4. Keep `status: "placeholder"` until the page has unique content.
 *    Sitemap and indexable metadata follow this flag automatically.
 * 5. Set `status: "ready"` only when the page should be indexed.
 *
 * Canonical owner: this file. `sitemap.ts` and `createSeoLandingMetadata`
 * consume it. Do not list unfinished slugs in `STATIC_SITEMAP_REL_PATHS`.
 */

export const SEO_LANDING_CTA_HREF = "/builder?new=1" as const;

export type SeoLandingStatus = "placeholder" | "ready";

export type SeoLandingPageEntry = {
  slug: string;
  title: string;
  description: string;
  status: SeoLandingStatus;
  ctaHref: typeof SEO_LANDING_CTA_HREF;
};

export const SEO_LANDING_PAGES = [
  {
    slug: "skapa-hemsida-med-ai",
    title: "Skapa hemsida med AI",
    description:
      "Skapa en professionell hemsida med AI. Sajtmaskin bygger moderna sajter för svenska företag.",
    status: "placeholder",
    ctaHref: SEO_LANDING_CTA_HREF,
  },
  {
    slug: "ai-hemsidebyggare",
    title: "AI-hemsidebyggare",
    description:
      "AI-hemsidebyggare för svenska företag. Beskriv din verksamhet så bygger Sajtmaskin sajten.",
    status: "placeholder",
    ctaHref: SEO_LANDING_CTA_HREF,
  },
  {
    slug: "hemsida-till-foretag",
    title: "Hemsida till företag",
    description:
      "Hemsida till företag — från idé till publicerad sajt med Sajtmaskin.",
    status: "placeholder",
    ctaHref: SEO_LANDING_CTA_HREF,
  },
  {
    slug: "hemsideprogram",
    title: "Hemsideprogram",
    description:
      "Hemsideprogram med riktig Next.js-kod. Skapa och vidareutveckla din sajt i Sajtmaskin.",
    status: "placeholder",
    ctaHref: SEO_LANDING_CTA_HREF,
  },
  {
    slug: "skapa-hemsida",
    title: "Skapa hemsida",
    description:
      "Skapa hemsida snabbt med AI. Sajtmaskin genererar en modern sajt du kan publicera.",
    status: "placeholder",
    ctaHref: SEO_LANDING_CTA_HREF,
  },
  {
    slug: "wix-alternativ",
    title: "Wix-alternativ",
    description:
      "Wix-alternativ som ger vanlig kod i stället för en stängd editor. Prova Sajtmaskin.",
    status: "placeholder",
    ctaHref: SEO_LANDING_CTA_HREF,
  },
  {
    slug: "wordpress-alternativ",
    title: "WordPress-alternativ",
    description:
      "WordPress-alternativ för dig som vill ha en modern stack utan plugin-underhåll.",
    status: "placeholder",
    ctaHref: SEO_LANDING_CTA_HREF,
  },
  {
    slug: "lovable-alternativ",
    title: "Lovable-alternativ",
    description:
      "Lovable-alternativ på svenska. Bygg och publicera din sajt med Sajtmaskin.",
    status: "placeholder",
    ctaHref: SEO_LANDING_CTA_HREF,
  },
] as const satisfies readonly SeoLandingPageEntry[];

export type SeoLandingSlug = (typeof SEO_LANDING_PAGES)[number]["slug"];

const SEO_LANDING_BY_SLUG = new Map<string, (typeof SEO_LANDING_PAGES)[number]>(
  SEO_LANDING_PAGES.map((page) => [page.slug, page]),
);

export function isSeoLandingSlug(value: string): value is SeoLandingSlug {
  return SEO_LANDING_BY_SLUG.has(value);
}

export function getSeoLandingEntry(slug: SeoLandingSlug) {
  const entry = SEO_LANDING_BY_SLUG.get(slug);
  if (!entry) {
    throw new Error(`Unknown SEO landing slug: ${slug}`);
  }
  return entry;
}

export function getIndexableSeoLandingRelPaths(): string[] {
  return SEO_LANDING_PAGES.filter((page) => page.status === "ready").map(
    (page) => `/${page.slug}`,
  );
}

export function getPlaceholderSeoLandingRelPaths(): string[] {
  return SEO_LANDING_PAGES.filter((page) => page.status === "placeholder").map(
    (page) => `/${page.slug}`,
  );
}
