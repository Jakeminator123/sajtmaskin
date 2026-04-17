/**
 * Import Playwright catalog into dossier raw-skiss format.
 *
 * Source: data/external-template-pipeline/raw-discovery/current/playwright-catalog.json
 * Target: data/dossiers/_raw/<id>/skiss.json
 *
 * Each Playwright template becomes one skiss-fil with:
 *   - kind hint (integration | ui-section)
 *   - category (mapped from Vercel use-case)
 *   - basic metadata (title, description, repoUrl, demoUrl, importantLines)
 *   - _curationRequired: true (must be hand-reviewed before promoted to data/dossiers/<id>/)
 *
 * No git clones, no file extraction. That happens in a later step after curation.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  RAW_DISCOVERY_CURRENT_ROOT,
  type PlaywrightCatalogFile,
  type PlaywrightTemplateEntry,
} from "../template-library/template-library-discovery";

const WORKSPACE_ROOT = process.cwd();
const RAW_DOSSIER_ROOT = resolve(WORKSPACE_ROOT, "data", "dossiers", "_raw");
const PLAYWRIGHT_CATALOG_PATH_FULL = join(RAW_DISCOVERY_CURRENT_ROOT, "playwright-catalog.json");
const PLAYWRIGHT_CATALOG_PATH_LIGHT = join(RAW_DOSSIER_ROOT, "playwright-catalog-light.json");

// Light-catalog shape produced by scrape-catalog-light.spec.ts.
interface LightCatalogTemplate {
  title: string;
  url: string;
  description: string;
  categorySlug: string;
}

interface LightCatalogFile {
  scrapedAt: string;
  totalTemplates: number;
  byCategory: Record<string, LightCatalogTemplate[]>;
}

function loadCatalog(): { catalog: PlaywrightCatalogFile; sourcePath: string } | null {
  if (existsSync(PLAYWRIGHT_CATALOG_PATH_FULL)) {
    const catalog: PlaywrightCatalogFile = JSON.parse(
      readFileSync(PLAYWRIGHT_CATALOG_PATH_FULL, "utf-8"),
    );
    return { catalog, sourcePath: PLAYWRIGHT_CATALOG_PATH_FULL };
  }
  if (existsSync(PLAYWRIGHT_CATALOG_PATH_LIGHT)) {
    const light: LightCatalogFile = JSON.parse(
      readFileSync(PLAYWRIGHT_CATALOG_PATH_LIGHT, "utf-8"),
    );
    // Adapter: flatten by-category into PlaywrightCatalogFile.templates[]
    // We dedup across categories here because a template can appear under
    // multiple use-cases (e.g. Stripe Subscription Starter under both
    // ecommerce and saas). Keep all categories in `categories: string[]`.
    const byUrl = new Map<string, PlaywrightTemplateEntry>();
    for (const [categorySlug, list] of Object.entries(light.byCategory)) {
      for (const item of list) {
        const existing = byUrl.get(item.url);
        if (existing) {
          if (!existing.categories.includes(categorySlug)) {
            existing.categories.push(categorySlug);
          }
        } else {
          byUrl.set(item.url, {
            title: item.title,
            description: item.description,
            url: item.url,
            categories: [categorySlug],
            stackTags: [],
            repoUrl: null,
            demoUrl: null,
            frameworkMatch: true, // light-skript filtrerar redan på ?framework=next.js
            frameworkReason: "Vercel filter framework=next.js",
            importantLines: [],
          });
        }
      }
    }
    const catalog: PlaywrightCatalogFile = {
      scrapedAt: light.scrapedAt,
      sourceUrl: "https://vercel.com/templates",
      filterPreset: "light",
      totalTemplates: byUrl.size,
      templates: [...byUrl.values()],
    };
    return { catalog, sourcePath: PLAYWRIGHT_CATALOG_PATH_LIGHT };
  }
  return null;
}

/**
 * Map Vercel use-case slug → our dossier category.
 * Some use-cases produce multiple kinds of dossiers depending on what the
 * template actually contains; the kind hint is conservative ("integration"
 * by default, "ui-section" only if the template is clearly UI-only).
 */
/**
 * Title/description-based classifier. Vercel's URL filter is broken (every
 * `?type=X&framework=next.js` returns ~the same 320 templates), so we cannot
 * trust the Vercel category metadata. We classify from the template title +
 * description instead, mapping to OUR dossier category vocabulary.
 *
 * Order matters: first matching rule wins. Specific provider matches first,
 * generic patterns last.
 */
interface ClassifierRule {
  category: string;
  kindHint: "integration" | "ui-section";
  match: RegExp;
}

const CLASSIFIER_RULES: ClassifierRule[] = [
  // --- AUTH ---
  { category: "auth", kindHint: "integration", match: /\b(clerk|auth0|kinde|nextauth|next-auth|workos|supabase auth|whop auth|magic link|passkey|webauthn|oauth|sso|sign[- ]in|sign[- ]up|login|registration)\b/i },
  // --- PAYMENTS ---
  { category: "payments", kindHint: "integration", match: /\b(stripe|paddle|paypal|lemonsqueezy|polar|checkout|subscription|billing|payment|invoice)\b/i },
  // --- AI ---
  { category: "ai", kindHint: "integration", match: /\b(chatbot|chat\s?sdk|openai|anthropic|claude|gpt|llm|rag\b|pinecone|weaviate|mongodb atlas vector|astra db|vercel ai sdk|ai\s?sdk|langchain|llamaindex|hume|elevenlabs|whisper|deepinfra|gemini|mistral|groq|together|ai gateway|agent\b|workflow devkit)\b/i },
  // --- CMS ---
  { category: "cms", kindHint: "integration", match: /\b(sanity|contentful|payload|notion|wordpress|storyblok|prismic|builder\.io|directus|strapi|agility|crystallize|hygraph|datocms|wisp\b|tina|cosmic|graphcms|caisy|umbraco|kontent|optimizely|cms\b|headless cms|content management)\b/i },
  // --- DATABASE ---
  { category: "database", kindHint: "integration", match: /\b(postgres|postgresql|neon|supabase|mongodb|mysql|sqlite|prisma|drizzle|kysely|tigris|cockroachdb|planetscale|turso|edgedb|gel\b|xata|redis|upstash|firebase|fauna|astra db)\b/i },
  // --- REALTIME ---
  { category: "realtime", kindHint: "integration", match: /\b(liveblocks|pusher|ably|pubnub|websocket|realtime|presence|collaborative|partykit|hocus|hocuspocus|yjs|automerge|sse|server-sent events)\b/i },
  // --- BOOKINGS ---
  { category: "bookings", kindHint: "integration", match: /\b(cal\.com|calendly|booking|appointment|reservation|schedule\b)\b/i },
  // --- EMAIL ---
  { category: "email", kindHint: "integration", match: /\b(resend|sendgrid|postmark|mailgun|loops|react email|nodemailer)\b/i },
  // --- ANALYTICS ---
  { category: "analytics", kindHint: "integration", match: /\b(analytics|posthog|amplitude|segment|plausible|umami|mixpanel|fathom|vercel analytics|web vitals|hypertune|growthbook|launchdarkly|statsig|split io|a\/b test|feature flag)\b/i },
  // --- STORAGE ---
  { category: "storage", kindHint: "integration", match: /\b(vercel blob|aws s3|s3 storage|cloudinary|uploadthing|imagekit|bunny storage|backblaze)\b/i },
  // --- SEARCH ---
  { category: "search", kindHint: "integration", match: /\b(algolia|meilisearch|typesense|elasticsearch|search\b)\b/i },
  // --- ECOMMERCE/SHOP (UI-section since storefront is a layout pattern) ---
  { category: "ui-marketing", kindHint: "ui-section", match: /\b(commerce|storefront|shop\b|store\b|cart\b|catalog|product page|saleor|medusa|shopify|big commerce|woocommerce)\b/i },
  // --- DASHBOARD/ADMIN UI ---
  { category: "ui-data", kindHint: "ui-section", match: /\b(dashboard|admin\b|analytics dashboard|operations|monitoring|sidebar layout|crm\b|backoffice|workspace)\b/i },
  // --- BLOG / EDITORIAL UI ---
  { category: "ui-content", kindHint: "ui-section", match: /\b(blog|article|magazine|newsletter|publication|editorial|contentlayer|mdx|essay)\b/i },
  // --- PORTFOLIO ---
  { category: "ui-marketing", kindHint: "ui-section", match: /\b(portfolio|personal site|case stud|showcase|designer|photographer)\b/i },
  // --- DOCUMENTATION ---
  { category: "ui-content", kindHint: "ui-section", match: /\b(documentation|docs site|nextra|fumadocs|mintlify|api reference)\b/i },
  // --- MARKETING / WAITLIST / LANDING ---
  { category: "ui-marketing", kindHint: "ui-section", match: /\b(waitlist|landing page|marketing site|launch page|coming soon|hero section|pricing page|testimonial)\b/i },
  // --- MULTI-TENANT (auth-adjacent) ---
  { category: "auth", kindHint: "integration", match: /\b(multi[- ]tenant|tenant\b|platforms starter|saas starter)\b/i },
];

/**
 * Templates we don't want at all — wrong framework, infra-only, or
 * one-off demos that don't translate into reusable dossier patterns.
 */
const SKIP_TITLE_PATTERNS = [
  /\b(nuxt|gatsby|astro|svelte|remix|qwik|vue\b|angular)\b/i,
  /\b(express|hono|nitro|flask|django|fastapi|fastify|python|go\b|golang|bun\b)\b/i,
  /\b(edge function|edge config|edge middleware|cdn\b|firewall|web3|crypto|nft|solana|ethereum)\b/i,
  /\b(microfrontend|monorepo example|virtual event)\b/i,
  /\b(static tweets|on[- ]demand isr|preview mode|envshare|paint by text|inpainter|qrgpt|alt text generator|emoji generator)\b/i,
];

interface Classification {
  category: string;
  kindHint: "integration" | "ui-section";
  matchedRulePattern: string;
}

function classifyByTitleAndDescription(template: PlaywrightTemplateEntry): Classification | { skip: true; reason: string } {
  const haystack = `${template.title} ${template.description}`;

  for (const skipPattern of SKIP_TITLE_PATTERNS) {
    if (skipPattern.test(haystack)) {
      return { skip: true, reason: `title-skip:${skipPattern.source.slice(0, 30)}` };
    }
  }

  for (const rule of CLASSIFIER_RULES) {
    if (rule.match.test(haystack)) {
      return {
        category: rule.category,
        kindHint: rule.kindHint,
        matchedRulePattern: rule.match.source.slice(0, 40),
      };
    }
  }

  return { skip: true, reason: "no-classifier-match" };
}

interface DossierSkiss {
  _status: "scraped";
  _kindHint: "integration" | "ui-section";
  _curationRequired: true;
  _scrapedAt: string;
  _importedAt: string;
  id: string;
  category: string;
  vercelCategories: string[];
  title: string;
  description: string;
  templateUrl: string;
  templateSlug: string;
  repoUrl: string | null;
  demoUrl: string | null;
  stackTags: string[];
  importantLines: string[];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "untitled";
}

function deriveDossierId(template: PlaywrightTemplateEntry, category: string): string {
  const titleSlug = slugify(template.title);
  // category-prefix avoids collisions across vercel-categories with same title
  return `${category}-${titleSlug}`.slice(0, 80);
}


function buildSkiss(
  template: PlaywrightTemplateEntry,
  scrapedAt: string,
): DossierSkiss | { skip: true; reason: string } {
  if (!template.frameworkMatch) {
    return { skip: true, reason: "non-next-framework" };
  }
  const classification = classifyByTitleAndDescription(template);
  if ("skip" in classification) {
    return classification;
  }

  const id = deriveDossierId(template, classification.category);
  const templateSlug = template.url.replace(/\/+$/, "").split("/").pop() ?? "unknown";

  return {
    _status: "scraped",
    _kindHint: classification.kindHint,
    _curationRequired: true,
    _scrapedAt: scrapedAt,
    _importedAt: new Date().toISOString(),
    id,
    category: classification.category,
    vercelCategories: template.categories ?? [],
    title: template.title,
    description: template.description ?? "",
    templateUrl: template.url,
    templateSlug,
    repoUrl: template.repoUrl ?? null,
    demoUrl: template.demoUrl ?? null,
    stackTags: template.stackTags ?? [],
    importantLines: template.importantLines ?? [],
  };
}

function main(): void {
  const loaded = loadCatalog();
  if (!loaded) {
    console.error(`[import] No catalog found.`);
    console.error(`[import] Tried: ${PLAYWRIGHT_CATALOG_PATH_FULL}`);
    console.error(`[import] Tried: ${PLAYWRIGHT_CATALOG_PATH_LIGHT}`);
    console.error("[import] Run: npm run dossiers:scrape (or scrape-catalog-light.spec.ts)");
    process.exit(1);
  }
  const { catalog, sourcePath } = loaded;
  console.log(`[import] Source: ${sourcePath}`);
  console.log(`[import] Templates in catalog: ${catalog.totalTemplates}`);

  mkdirSync(RAW_DOSSIER_ROOT, { recursive: true });

  const written: DossierSkiss[] = [];
  const skipped: { url: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const template of catalog.templates) {
    const skiss = buildSkiss(template, catalog.scrapedAt);
    if ("skip" in skiss) {
      skipped.push({ url: template.url, reason: skiss.reason });
      continue;
    }

    if (seen.has(skiss.id)) {
      skipped.push({ url: template.url, reason: `duplicate-id (${skiss.id})` });
      continue;
    }
    seen.add(skiss.id);

    const dest = join(RAW_DOSSIER_ROOT, skiss.id);
    mkdirSync(dest, { recursive: true });
    writeFileSync(
      join(dest, "skiss.json"),
      JSON.stringify(skiss, null, 2) + "\n",
      "utf-8",
    );
    written.push(skiss);
  }

  const summary = {
    importedAt: new Date().toISOString(),
    sourcePlaywrightCatalog: sourcePath,
    sourcePreset: catalog.filterPreset,
    sourceScrapedAt: catalog.scrapedAt,
    written: written.length,
    skipped: skipped.length,
    byCategory: written.reduce<Record<string, number>>((acc, skiss) => {
      acc[skiss.category] = (acc[skiss.category] ?? 0) + 1;
      return acc;
    }, {}),
    byVercelCategory: written.reduce<Record<string, number>>((acc, skiss) => {
      const primary = skiss.vercelCategories[0] ?? "unknown";
      acc[primary] = (acc[primary] ?? 0) + 1;
      return acc;
    }, {}),
    skippedSamples: skipped.slice(0, 10),
  };

  writeFileSync(
    join(RAW_DOSSIER_ROOT, "_import-summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
    "utf-8",
  );

  console.log(`[import] Wrote ${written.length} skiss-files to ${RAW_DOSSIER_ROOT}`);
  console.log(`[import] Skipped ${skipped.length} (see _import-summary.json)`);
  console.log(`[import] By category:`, summary.byCategory);
}

main();
