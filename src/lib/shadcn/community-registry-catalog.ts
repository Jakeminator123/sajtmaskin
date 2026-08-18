/**
 * Client-safe shadcnblocks catalog: namespace, featured set, category labels.
 * No fetch, no cache, no API key. Browser modules must import from here —
 * not from `community-registry-index.ts` (server index + Bearer fetch).
 */

export const SHADCNBLOCKS_NAMESPACE = "@shadcnblocks";

export type CommunityIndexItem = {
  name: string;
  type: string;
  title: string;
  description: string;
  category: string;
};

export type CommunityIndexCategory = {
  id: string;
  label: string;
  count: number;
};

export type CommunityIndexQuery = {
  q?: string;
  category?: string;
  limit?: number;
  cursor?: string | null;
  /** Resolve featured names even when outside the current page. */
  names?: string[];
};

export type CommunityIndexPage = {
  namespace: typeof SHADCNBLOCKS_NAMESPACE;
  total: number;
  categories: CommunityIndexCategory[];
  items: CommunityIndexItem[];
  nextCursor: string | null;
};

/** Known marketing-section prefixes → stable category ids (Swedish labels). */
const CATEGORY_LABELS: Record<string, string> = {
  about: "Om",
  blog: "Blogg",
  contact: "Kontakt",
  cta: "CTA",
  faq: "FAQ",
  feature: "Funktioner",
  footer: "Sidfot",
  gallery: "Galleri",
  hero: "Hero",
  login: "Inloggning",
  navbar: "Navbar",
  pricing: "Prissättning",
  signup: "Registrering",
  stats: "Statistik",
  team: "Team",
  testimonial: "Omdömen",
};

export const FEATURED_SHADCNBLOCKS = [
  { name: "hero1", labelSv: "Hero", category: "hero" },
  { name: "feature1", labelSv: "Funktioner", category: "feature" },
  { name: "pricing1", labelSv: "Prissättning", category: "pricing" },
  { name: "testimonial1", labelSv: "Omdömen", category: "testimonial" },
  { name: "cta1", labelSv: "CTA", category: "cta" },
  { name: "faq1", labelSv: "FAQ", category: "faq" },
  { name: "footer1", labelSv: "Sidfot", category: "footer" },
  { name: "navbar1", labelSv: "Navbar", category: "navbar" },
] as const satisfies ReadonlyArray<{ name: string; labelSv: string; category: string }>;

export type FeaturedShadcnblockId = (typeof FEATURED_SHADCNBLOCKS)[number]["name"];

export function featuredShadcnblockNames(): string[] {
  return FEATURED_SHADCNBLOCKS.map((entry) => entry.name);
}

/**
 * Derive a gallery category from a shadcnblocks item name.
 * `hero1` → `hero`, `pricing12` → `pricing`, `mist-hero-section-1` → `mist`.
 */
export function categoryFromCommunityName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return "other";
  const letterPrefix = trimmed.match(/^([a-z]+)/)?.[1];
  if (letterPrefix && CATEGORY_LABELS[letterPrefix]) return letterPrefix;
  const hyphenPrefix = trimmed.split("-")[0];
  if (hyphenPrefix && CATEGORY_LABELS[hyphenPrefix]) return hyphenPrefix;
  return letterPrefix || hyphenPrefix || "other";
}

export function categoryLabelSv(categoryId: string): string {
  return CATEGORY_LABELS[categoryId] ?? categoryId;
}
