/**
 * generate-dossiers-from-catalog.ts — Zone 2 → research/dossiers/
 *
 * Reads research/normalized-catalog.json and auto-generates dossier
 * manifest.json files for entries that map to one of the 10 runtime
 * scaffold families.
 *
 * Each entry with `recommendedScaffoldFamilies` produces one dossier
 * per matched scaffold family, placed under research/dossiers/<slug>/.
 *
 * Usage:
 *   npx tsx config/scripts/generate-dossiers-from-catalog.ts
 *   npm run research:generate-dossiers
 */

import fs from "fs";
import path from "path";

const CATALOG_INPUT = path.resolve(__dirname, "../../research/normalized-catalog.json");
const DOSSIER_DIR = path.resolve(__dirname, "../../research/dossiers");

const VALID_SCAFFOLD_IDS = new Set([
  "base-nextjs",
  "landing-page",
  "saas-landing",
  "portfolio",
  "blog",
  "dashboard",
  "auth-pages",
  "ecommerce",
  "content-site",
  "app-shell",
]);

interface NormalizedEntry {
  id: string;
  slug: string;
  title: string;
  categorySlug: string;
  categoryName: string;
  description: string;
  qualityScore: number;
  recommendedScaffoldFamilies: string[];
  signals: Record<string, boolean>;
  stackTags: string[];
  frameworkMatch: boolean;
  promotionDecision: string;
}

interface NormalizedCatalog {
  entries: NormalizedEntry[];
  entryCount: number;
}

interface DossierManifest {
  id: string;
  title: string;
  categorySlug: string;
  qualityScore: number;
  strengths: string[];
  scaffoldId: string;
  qualityChecklist: string[];
  upgradeTargets: string[];
}

function deriveStrengths(entry: NormalizedEntry): string[] {
  const strengths: string[] = [];
  if (entry.frameworkMatch) strengths.push("Next.js / React compatible");
  if (entry.signals.auth) strengths.push("Includes authentication patterns");
  if (entry.signals.dashboard) strengths.push("Has dashboard / analytics UI");
  if (entry.signals.pricing) strengths.push("Includes pricing page patterns");
  if (entry.signals.blog) strengths.push("Blog / content publishing support");
  if (entry.signals.ecommerce) strengths.push("E-commerce / product catalog patterns");
  if (entry.signals.ai) strengths.push("AI integration patterns");
  if (entry.signals.docs) strengths.push("Documentation site patterns");
  if (entry.signals.cms) strengths.push("CMS integration");
  if (entry.signals.multiTenant) strengths.push("Multi-tenant architecture");

  for (const tag of entry.stackTags) {
    if (/tailwind/i.test(tag)) {
      strengths.push("Tailwind CSS styling");
      break;
    }
  }

  if (entry.qualityScore >= 80) strengths.push("High quality score");
  return strengths;
}

const SCAFFOLD_CHECKLISTS: Record<string, string[]> = {
  ecommerce: [
    "Product grid with filtering and sorting",
    "Cart state management with add/remove/quantity",
    "Checkout flow with form validation",
    "Product detail page with image gallery",
    "Order confirmation and receipt",
  ],
  dashboard: [
    "Data visualization with charts (bar/line/pie)",
    "Sidebar navigation with collapsible sections",
    "Responsive table and card views",
    "KPI summary cards with trend indicators",
    "Filter/search controls for data views",
  ],
  blog: [
    "Article list with pagination or infinite scroll",
    "Single post with rich typography and code blocks",
    "Author profile and publish date metadata",
    "Category/tag filtering",
    "RSS feed or sitemap generation",
  ],
  "auth-pages": [
    "Login form with email/password validation",
    "Registration form with confirmation",
    "Password reset flow with email link",
    "Protected route redirect pattern",
    "Session indicator in header/navbar",
  ],
  "saas-landing": [
    "Feature comparison grid or bento layout",
    "Pricing tier cards with toggle (monthly/yearly)",
    "Social proof section (testimonials/logos)",
    "Hero with clear value proposition and CTA",
    "FAQ accordion section",
  ],
  portfolio: [
    "Project gallery with category filtering",
    "Case study detail pages with images",
    "Contact form with validation",
    "Skills or services overview section",
    "About page with bio and timeline",
  ],
  "landing-page": [
    "Hero section with primary CTA",
    "Feature highlights with icons or illustrations",
    "Social proof or partner logos",
    "Newsletter signup or lead capture form",
    "Footer with sitemap links",
  ],
  "content-site": [
    "Table of contents or sidebar navigation",
    "Search functionality for content",
    "Breadcrumb navigation",
    "SEO metadata on all content pages",
    "Cross-linking between related content",
  ],
  "app-shell": [
    "Sidebar or top navigation with active state",
    "Settings or configuration panel",
    "Loading skeletons and empty states",
    "Breadcrumb or page title bar",
    "Notification or toast system",
  ],
  "base-nextjs": [
    "App Router page structure",
    "Responsive header with mobile menu",
    "Theme-aware color scheme",
    "Proper metadata exports",
    "Clean component file structure",
  ],
};

const MAX_CHECKLIST_ITEMS = 8;

function deriveQualityChecklist(entry: NormalizedEntry, scaffoldId: string): string[] {
  const checklist = [...(SCAFFOLD_CHECKLISTS[scaffoldId] ?? [])];

  if (entry.signals.auth && scaffoldId !== "auth-pages") {
    checklist.push("Auth-aware UI states");
  }
  if (entry.signals.ai) {
    checklist.push("AI interaction pattern (chat/generate/suggest)");
  }
  if (entry.signals.cms) {
    checklist.push("CMS content rendering with rich blocks");
  }
  if (entry.signals.multiTenant) {
    checklist.push("Tenant-scoped data and navigation");
  }

  return checklist.slice(0, MAX_CHECKLIST_ITEMS);
}

function deriveUpgradeTargets(entry: NormalizedEntry): string[] {
  const targets: string[] = [];
  if (!entry.signals.auth) targets.push("Add authentication when needed");
  if (!entry.signals.dashboard) targets.push("Add analytics dashboard");
  if (entry.qualityScore < 70) targets.push("Improve code quality and structure");
  return targets;
}

function main() {
  if (!fs.existsSync(CATALOG_INPUT)) {
    console.error(`normalized-catalog.json not found at ${CATALOG_INPUT}`);
    console.error("Run 'npm run research:normalize -- --input <dir>' first.");
    process.exit(1);
  }

  const catalog: NormalizedCatalog = JSON.parse(
    fs.readFileSync(CATALOG_INPUT, "utf-8"),
  );

  fs.mkdirSync(DOSSIER_DIR, { recursive: true });

  let created = 0;
  let skipped = 0;
  const scaffoldCounts = new Map<string, number>();

  for (const entry of catalog.entries) {
    if (entry.promotionDecision === "ignore") {
      skipped++;
      continue;
    }

    const families = (entry.recommendedScaffoldFamilies ?? []).filter((f) =>
      VALID_SCAFFOLD_IDS.has(f),
    );

    if (families.length === 0) {
      skipped++;
      continue;
    }

    const primaryScaffoldId = families[0];

    const dossierDir = path.join(DOSSIER_DIR, entry.slug);
    fs.mkdirSync(dossierDir, { recursive: true });

    const manifest: DossierManifest = {
      id: entry.id,
      title: entry.title,
      categorySlug: entry.categorySlug,
      qualityScore: entry.qualityScore,
      strengths: deriveStrengths(entry),
      scaffoldId: primaryScaffoldId,
      qualityChecklist: deriveQualityChecklist(entry, primaryScaffoldId),
      upgradeTargets: deriveUpgradeTargets(entry),
    };

    fs.writeFileSync(
      path.join(dossierDir, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      "utf-8",
    );

    scaffoldCounts.set(
      primaryScaffoldId,
      (scaffoldCounts.get(primaryScaffoldId) ?? 0) + 1,
    );
    created++;
  }

  console.info(`Created ${created} dossiers, skipped ${skipped} entries.`);
  console.info("Dossiers per scaffold:");
  for (const [scaffoldId, count] of [...scaffoldCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    console.info(`  ${scaffoldId}: ${count}`);
  }
  console.info(`\nNext: npm run scaffolds:build`);
}

main();
