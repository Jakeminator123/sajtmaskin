/**
 * Register of public SEO/marketing landing pages on the Sajtmaskin app.
 *
 * These are ordinary App Router routes on the main domain. They are not
 * separate deploys, iframes, subdomains, or mini-apps.
 *
 * Plan owner: `docs/plans/active/2026-09-16-seo-landningssidor/`.
 * This file is the runtime owner for slugs, status and sitemap selection.
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
 * Do not list unfinished slugs in `STATIC_SITEMAP_REL_PATHS`.
 */

export const SEO_LANDING_CTA_HREF = "/builder?new=1" as const;

export const SEO_LANDING_SLUGS = [
  "skapa-hemsida",
  "skapa-hemsida-med-ai",
  "ai-hemsidebyggare",
  "hemsida-till-foretag",
  "hemsideprogram",
  "hemsida-utan-kod",
  "vad-kostar-en-hemsida",
  "wix-alternativ",
  "wordpress-alternativ",
  "lovable-alternativ",
] as const;

export type SeoLandingSlug = (typeof SEO_LANDING_SLUGS)[number];
export type SeoLandingStatus = "placeholder" | "ready";

export type SeoLandingPageEntry = {
  slug: SeoLandingSlug;
  title: string;
  description: string;
  plannedH1: string;
  intent: string;
  relatedSlugs: readonly SeoLandingSlug[];
  status: SeoLandingStatus;
  ctaHref: typeof SEO_LANDING_CTA_HREF;
};

export const SEO_LANDING_PAGES: readonly SeoLandingPageEntry[] = [
  {
    slug: "skapa-hemsida",
    title: "Skapa hemsida – bygg en modern webbplats",
    description:
      "Skapa hemsida från idé till publicerad sajt. En teknikneutral väg för svenska företag.",
    plannedH1: "Skapa hemsida – från idé till färdig företagssida",
    intent: "Bred transactional: vägen från idé till hemsida",
    relatedSlugs: ["skapa-hemsida-med-ai", "hemsideprogram", "vad-kostar-en-hemsida"],
    status: "placeholder",
    ctaHref: SEO_LANDING_CTA_HREF,
  },
  {
    slug: "skapa-hemsida-med-ai",
    title: "Skapa hemsida med AI – se hur det fungerar",
    description:
      "Skapa hemsida med AI: från beskrivning till första version. Se processen i Sajtmaskin.",
    plannedH1: "Skapa hemsida med AI – från beskrivning till första version",
    intent: "Hur man skapar en hemsida med AI",
    relatedSlugs: ["ai-hemsidebyggare", "skapa-hemsida", "hemsida-utan-kod"],
    status: "placeholder",
    ctaHref: SEO_LANDING_CTA_HREF,
  },
  {
    slug: "ai-hemsidebyggare",
    title: "AI-hemsidebyggare – funktioner, val och exempel",
    description:
      "AI-hemsidebyggare: vad du ska jämföra innan du väljer verktyg. Kriterier och exempel.",
    plannedH1: "AI-hemsidebyggare – vad ska du jämföra innan du väljer?",
    intent: "Produktkategori och valkriterier",
    relatedSlugs: ["skapa-hemsida-med-ai", "hemsideprogram", "lovable-alternativ"],
    status: "placeholder",
    ctaHref: SEO_LANDING_CTA_HREF,
  },
  {
    slug: "hemsida-till-foretag",
    title: "Hemsida till företag – vad behöver företagssidan?",
    description:
      "Hemsida till företag för förtroende och förfrågningar. Vad sidan behöver innehålla.",
    plannedH1: "Hemsida till företag – bygg för förtroende och förfrågningar",
    intent: "B2B: affärsnytta, inte verktygskategori",
    relatedSlugs: ["skapa-hemsida", "vad-kostar-en-hemsida", "hemsida-utan-kod"],
    status: "placeholder",
    ctaHref: SEO_LANDING_CTA_HREF,
  },
  {
    slug: "hemsideprogram",
    title: "Hemsideprogram – jämför CMS, builders och AI",
    description:
      "Hemsideprogram: jämför CMS, drag-and-drop, AI-builder och kod. Välj rätt arbetssätt.",
    plannedH1: "Hemsideprogram – välj rätt sätt att bygga din webbplats",
    intent: "Jämför verktygstyper, inte ett enskilt varumärke",
    relatedSlugs: ["ai-hemsidebyggare", "hemsida-utan-kod", "wordpress-alternativ", "wix-alternativ"],
    status: "placeholder",
    ctaHref: SEO_LANDING_CTA_HREF,
  },
  {
    slug: "hemsida-utan-kod",
    title: "Skapa hemsida utan kod – steg för steg",
    description:
      "Skapa hemsida utan kod: vad du kan göra själv och när du fortfarande behöver hjälp.",
    plannedH1: "Skapa hemsida utan kod – vad kan du göra själv?",
    intent: "No-code: göra det själv utan programmering",
    relatedSlugs: ["skapa-hemsida", "skapa-hemsida-med-ai", "hemsideprogram"],
    status: "placeholder",
    ctaHref: SEO_LANDING_CTA_HREF,
  },
  {
    slug: "vad-kostar-en-hemsida",
    title: "Vad kostar en hemsida? Pris och kostnadsdelar",
    description:
      "Vad kostar en hemsida? Kostnadsdelar, arbetssätt och vad som faktiskt påverkar priset.",
    plannedH1: "Vad kostar en hemsida? Kostnaderna som faktiskt påverkar priset",
    intent: "Kostnadsdrivare, inte ett påhittat fast pris",
    relatedSlugs: ["skapa-hemsida", "hemsida-till-foretag", "hemsideprogram"],
    status: "placeholder",
    ctaHref: SEO_LANDING_CTA_HREF,
  },
  {
    slug: "wix-alternativ",
    title: "Wix-alternativ – Wix eller Sajtmaskin?",
    description:
      "Wix-alternativ: jämför arbetssätt, kontroll och publicering innan du byter.",
    plannedH1: "Wix-alternativ – jämför arbetssätt innan du byter",
    intent: "Saklig Wix-jämförelse",
    relatedSlugs: ["hemsideprogram", "ai-hemsidebyggare", "skapa-hemsida"],
    status: "placeholder",
    ctaHref: SEO_LANDING_CTA_HREF,
  },
  {
    slug: "wordpress-alternativ",
    title: "WordPress-alternativ – jämför med Sajtmaskin",
    description:
      "WordPress-alternativ: när ett annat arbetssätt passar bättre än WordPress-ekosystemet.",
    plannedH1: "WordPress-alternativ – när passar ett annat arbetssätt bättre?",
    intent: "Saklig WordPress-jämförelse",
    relatedSlugs: ["hemsideprogram", "hemsida-utan-kod", "skapa-hemsida-med-ai"],
    status: "placeholder",
    ctaHref: SEO_LANDING_CTA_HREF,
  },
  {
    slug: "lovable-alternativ",
    title: "Lovable-alternativ – Lovable eller Sajtmaskin?",
    description:
      "Lovable-alternativ: välj verktyg efter om du bygger företagssida, app eller prototyp.",
    plannedH1: "Lovable-alternativ – välj verktyg efter vad du faktiskt ska bygga",
    intent: "Saklig Lovable-jämförelse utifrån byggmål",
    relatedSlugs: ["ai-hemsidebyggare", "skapa-hemsida-med-ai", "hemsideprogram"],
    status: "placeholder",
    ctaHref: SEO_LANDING_CTA_HREF,
  },
];

const SEO_LANDING_SLUG_SET = new Set<string>(SEO_LANDING_SLUGS);

const SEO_LANDING_BY_SLUG = new Map<string, SeoLandingPageEntry>(
  SEO_LANDING_PAGES.map((page) => [page.slug, page]),
);

export function isSeoLandingSlug(value: string): value is SeoLandingSlug {
  return SEO_LANDING_SLUG_SET.has(value);
}

export function getSeoLandingEntry(slug: SeoLandingSlug) {
  const entry = SEO_LANDING_BY_SLUG.get(slug);
  if (!entry) {
    throw new Error(`Unknown SEO landing slug: ${slug}`);
  }
  return entry;
}

export function indexableSeoLandingRelPathsFrom(
  pages: readonly SeoLandingPageEntry[],
): string[] {
  return pages.filter((page) => page.status === "ready").map((page) => `/${page.slug}`);
}

export function getIndexableSeoLandingRelPaths(): string[] {
  return indexableSeoLandingRelPathsFrom(SEO_LANDING_PAGES);
}

export function getPlaceholderSeoLandingRelPaths(): string[] {
  return SEO_LANDING_PAGES.filter((page) => page.status === "placeholder").map(
    (page) => `/${page.slug}`,
  );
}
