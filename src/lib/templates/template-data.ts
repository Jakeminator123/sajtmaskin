// Template catalog data: categories, quick prompts, and gallery items.
// `templates.json` + `template-categories.json` are GENERATED from the Vercel Blob
// manifest by `scripts/v0-templates/upload-mallar-blob.mjs --write-catalog`
// (the "mallar" → Blob intake; the data's own `_source`/`_discoveryMode` confirms this).
// Blob is the ONLY catalog-generation path — the legacy v0-auto-fetch path
// (sync-v0-templates.mjs, /api/admin/templates/sync, TEMPLATE_SYNC_*) was removed 2026-07-08.
// Canonical flow + guardrails: docs/architecture/templates.md

import templatesData from "./templates.json";
import templateCategoriesData from "./template-categories.json";

// Build reverse lookup: templateId -> category
const templateCategoryMapping: Record<string, string> = {};
for (const [category, templateIds] of Object.entries(templateCategoriesData)) {
  if (category.startsWith("_")) continue; // Skip metadata fields
  for (const id of templateIds as string[]) {
    templateCategoryMapping[id] = category;
  }
}

export interface QuickPrompt {
  label: string;
  prompt: string;
}

export interface CategoryInfo {
  id: string;
  title: string;
  description: string;
  icon: string; // Lucide icon name
  quickPrompts: QuickPrompt[];
}

// Template interface for gallery items (data sourced from generated catalog)
export interface Template {
  id: string;
  title: string;
  slug: string;
  imageFilename: string;
  previewImageUrl: string;
  previewStillUrl?: string | null;
  previewLoopUrl?: string | null;
  previewLoopKind?: "none" | "frames" | "animated-image" | "video" | string | null;
  previewLoopFrameDurationMs?: number | null;
  previewFrameUrls?: string[];
  archiveUrl?: string | null;
  category: string;
}

/**
 * Templates excluded from the catalog because they cannot run in the preview
 * host in their current form. Verified 2026-07-08 via
 * `scripts/v0-templates/audit-template-repos.mjs`:
 *   - no `package.json` / no `dev` script / non-Next  → can never boot preview
 *   - module-scope read of an uncovered env key       → crashes `next dev` on load
 *
 * This is a display/catalog-level exclusion only — the Blob archives are kept,
 * so re-including a template later just means removing its id from this set.
 */
export const EXCLUDED_TEMPLATE_IDS = new Set<string>([
  // Broken: no runnable project (no package.json / no dev script / non-Next)
  "CirmLMhUoF0", // Car rental website clone — no package.json
  "mEefgKyVifq", // enhanced-travel-website — single-file, no package.json
  "YEBQHPfbqc0", // PrintLess Eco Metrics — single-file, no package.json
  "YZqzCqeqEat", // PWA Subscription Tracker — no dev script
  "rhQ1SQjfhor", // Doppel Template — Vite project, not Next.js
  // Env crash-on-load: module-scope read of an uncovered env key in the render path
  // (function-scope-aware detection incl. `new Client({ apiKey: process.env.X })`).
  "350IE4ojQXK", // NEON_AUTH_* (apps-and-games)
  "7YygHkO1oj4", // Grok Creative Studio — MUX_* / MIXEDBREAD_API_KEY
  "a9HJA3gXB4w", // LANGCACHE_* (ai)
  "GB2Aln8GBDP", // Shadcn registry generator — NEON_DATABASE_URL
  "hkRpZoLOrJC", // AI_GATEWAY / SUPABASE_SERVICE_ROLE_KEY / VERCEL_OAUTH_* (ai)
  "hO33zwNmsQF", // AI_GATEWAY / SUPABASE_SERVICE_ROLE_KEY / VERCEL_OAUTH_* (ai)
  "jSYDGSkRBFX", // QStash / KV / Neon / Stack / XAI (login-and-sign-up)
  "kz69KY1ux5H", // FAL_KEY / PRODIA_TOKEN / XAI_API_KEY (ai)
  "Ln5i4EVw63N", // Sign In with X — X_CLIENT_* / JWT_SECRET
  "t02Cx1KfaCS", // AI Components Generator — FIRECRAWL_API_KEY
  "xbwwZ9kD745", // FAL_API_KEY (ai)
]);

// Filter out category placeholder entries that are not real templates
const rawTemplates = (
  templatesData as Array<{
    id: string;
    title: string;
    slug: string;
    image_filename: string;
    preview_image_url: string;
    preview_still_url?: string | null;
    preview_loop_url?: string | null;
    preview_loop_kind?: string | null;
    preview_loop_frame_duration_ms?: number | null;
    preview_frame_urls?: string[];
    archive_url?: string | null;
    category: string;
  }>
)
  .filter((t) => t.slug !== "categories" && t.id !== "categories")
  .filter((t) => !EXCLUDED_TEMPLATE_IDS.has(t.id));

export const TEMPLATES: Template[] = rawTemplates.map((t) => ({
  id: t.id,
  title: t.title || t.id,
  slug: t.slug,
  imageFilename: t.image_filename,
  previewImageUrl: t.preview_image_url,
  previewStillUrl: t.preview_still_url ?? t.preview_image_url,
  previewLoopUrl: t.preview_loop_url ?? null,
  previewLoopKind: t.preview_loop_kind ?? null,
  previewLoopFrameDurationMs: t.preview_loop_frame_duration_ms ?? null,
  previewFrameUrls: Array.isArray(t.preview_frame_urls) ? t.preview_frame_urls : [],
  archiveUrl: t.archive_url ?? null,
  category: t.category,
}));

// Map template slugs/IDs to category IDs
export function getTemplateCategoryId(template: Template): string {
  // Category slugs that are actual categories (not templates)
  const categorySlugs = [
    "ai",
    "animations",
    "components",
    "login-and-sign-up",
    "portfolio",
    "design-systems",
    "layouts",
    "landing-pages",
    "dashboards",
    "e-commerce",
    "website-templates",
    "apps-and-games",
    "categories",
    "templates",
  ];

  // Skip category templates themselves
  if (categorySlugs.includes(template.slug)) {
    return "website-templates"; // Don't show category cards as templates
  }

  // PRIORITY 1: Check manual category mapping (from template-categories.json)
  // This overrides all other categorization methods
  const mappedCategory = templateCategoryMapping[template.id];
  if (mappedCategory) {
    return mappedCategory;
  }

  // Available gallery categories to distribute templates across
  const availableCategories = [
    "ai",
    "animations",
    "components",
    "login-and-sign-up",
    "blog-and-portfolio",
    "design-systems",
    "layouts",
    "landing-pages",
    "dashboards",
    "e-commerce",
    "website-templates",
    "apps-and-games",
    "uncategorized", // New fallback category
  ];

  // PRIORITY 2: If template has a specific category in its data, use it
  if (template.category && template.category !== "Templates") {
    const normalizedCategory = template.category.toLowerCase().replace(/\s+/g, "-");
    if (availableCategories.includes(normalizedCategory)) {
      return normalizedCategory;
    }
  }

  // PRIORITY 3: Return "uncategorized" instead of random hash distribution
  // This prevents templates from appearing in wrong categories
  return "uncategorized";
}

// Gallery category metadata for the generated v0 catalog
export const V0_CATEGORIES: Record<string, CategoryInfo> = {
  ai: {
    id: "ai",
    title: "AI",
    description: "AI-drivna mallar och komponenter",
    icon: "Wand2",
    quickPrompts: [],
  },
  animations: {
    id: "animations",
    title: "Animationer",
    description: "Animerade komponenter och effekter",
    icon: "Zap",
    quickPrompts: [],
  },
  components: {
    id: "components",
    title: "Komponenter",
    description: "Återanvändbara UI-komponenter",
    icon: "Puzzle",
    quickPrompts: [],
  },
  "login-and-sign-up": {
    id: "login-and-sign-up",
    title: "Inloggning & registrering",
    description: "Inloggnings- och registreringsformulär",
    icon: "Lock",
    quickPrompts: [],
  },
  "blog-and-portfolio": {
    id: "blog-and-portfolio",
    title: "Blogg & portfolio",
    description: "Bloggar och portfoliowebbplatser",
    icon: "FileText",
    quickPrompts: [],
  },
  "design-systems": {
    id: "design-systems",
    title: "Designsystem",
    description: "Designsystem och komponentbibliotek",
    icon: "Palette",
    quickPrompts: [],
  },
  layouts: {
    id: "layouts",
    title: "Layouter",
    description: "Sidlayouter och strukturer",
    icon: "Layout",
    quickPrompts: [],
  },
  "landing-pages": {
    id: "landing-pages",
    title: "Landningssidor",
    description: "One-pagers för produkter och kampanjer",
    icon: "FileText",
    quickPrompts: [],
  },
  dashboards: {
    id: "dashboards",
    title: "Instrumentpaneler",
    description: "Admin-paneler och datavisualisering",
    icon: "LayoutDashboard",
    quickPrompts: [],
  },
  "e-commerce": {
    id: "e-commerce",
    title: "E-handel",
    description: "Butiker, kassor och produktsidor",
    icon: "ShoppingCart",
    quickPrompts: [],
  },
  "website-templates": {
    id: "website-templates",
    title: "Webbplatsmallar",
    description: "Kompletta webbplatsmallar",
    icon: "Globe",
    quickPrompts: [],
  },
  "apps-and-games": {
    id: "apps-and-games",
    title: "Appar & spel",
    description: "Applikationer och spel",
    icon: "Gamepad2",
    quickPrompts: [],
  },
  uncategorized: {
    id: "uncategorized",
    title: "Okategoriserade",
    description: "Mallar som ännu inte kategoriserats",
    icon: "HelpCircle",
    quickPrompts: [],
  },
};

// Category titles in Swedish for display
export const CATEGORY_TITLES: Record<string, string> = {
  "landing-page": "Landningssida",
  website: "Hemsida",
  dashboard: "Instrumentpanel",
  ai: "AI",
  animations: "Animationer",
  components: "Komponenter",
  "login-and-sign-up": "Inloggning & registrering",
  "blog-and-portfolio": "Blogg & portfolio",
  "design-systems": "Designsystem",
  layouts: "Layouter",
  "landing-pages": "Landningssidor",
  dashboards: "Instrumentpaneler",
  "e-commerce": "E-handel",
  "website-templates": "Webbplatsmallar",
  "apps-and-games": "Appar & spel",
};

export function getV0CategoryTitle(categoryId: string): string {
  return V0_CATEGORIES[categoryId]?.title || CATEGORY_TITLES[categoryId] || categoryId;
}

export function getTemplateCategoryTitle(template: Template): string {
  return getV0CategoryTitle(getTemplateCategoryId(template));
}

// Get templates by category ID
export function getTemplatesByCategory(categoryId: string): Template[] {
  // Filter out category templates themselves (they have matching slug)
  const categorySlugs = Object.keys(V0_CATEGORIES);

  return TEMPLATES.filter((template) => {
    // Skip category templates
    if (categorySlugs.includes(template.slug)) {
      return false;
    }

    // Map template to category
    const templateCategory = getTemplateCategoryId(template);
    return templateCategory === categoryId;
  });
}

// Get all v0 categories
export function getAllV0Categories(): CategoryInfo[] {
  return Object.values(V0_CATEGORIES);
}

// Get template by ID
export function getTemplateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function getTemplateImageUrl(template: Template): string {
  if (template.previewImageUrl) {
    return template.previewImageUrl;
  }
  return `/templates/${template.imageFilename}`;
}
