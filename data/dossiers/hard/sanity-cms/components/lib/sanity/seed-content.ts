/**
 * Static fallback content used when Sanity is NOT configured (design preview
 * or missing/placeholder env). Server code branches on `isSanityConfigured()`
 * from `@/lib/sanity/api`: configured → query via `sanityFetch()`, not
 * configured → render this seed content with a discreet
 * `<SanityConfigNotice />`.
 *
 * REWRITE TARGET: mirror the app's real Sanity document types and fields here
 * (same shape as the objects the GROQ queries would return) so the design
 * preview looks like the finished site.
 */
export interface SeedDocument {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  publishedAt: string;
}

export const seedContent: SeedDocument[] = [
  {
    _id: "seed-1",
    title: "Exempelartikel ett",
    slug: "exempelartikel-ett",
    excerpt: "Statiskt exempelinnehåll som visas när CMS:et inte är konfigurerat.",
    publishedAt: "2026-01-15",
  },
  {
    _id: "seed-2",
    title: "Exempelartikel två",
    slug: "exempelartikel-tva",
    excerpt: "Ersätt fälten med domänriktigt exempelinnehåll för sajten.",
    publishedAt: "2026-02-03",
  },
  {
    _id: "seed-3",
    title: "Exempelartikel tre",
    slug: "exempelartikel-tre",
    excerpt: "Samma form som Sanity-dokumenten i GROQ-svaren, så designen kan förhandsgranskas.",
    publishedAt: "2026-03-21",
  },
];
