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

function deriveQualityChecklist(entry: NormalizedEntry, scaffoldId: string): string[] {
  const checklist: string[] = [];

  checklist.push("Responsive mobile-first layout");
  checklist.push("Semantic HTML with proper heading hierarchy");
  checklist.push("Accessible navigation with keyboard support");

  if (scaffoldId === "ecommerce") {
    checklist.push("Product grid with filtering");
    checklist.push("Cart state management");
    checklist.push("Checkout flow with form validation");
  } else if (scaffoldId === "dashboard") {
    checklist.push("Data visualization with charts");
    checklist.push("Sidebar navigation pattern");
    checklist.push("Responsive table/card views");
  } else if (scaffoldId === "blog") {
    checklist.push("Article list with pagination");
    checklist.push("Single post with rich typography");
    checklist.push("Author and date metadata");
  } else if (scaffoldId === "auth-pages") {
    checklist.push("Login / register form with validation");
    checklist.push("Password reset flow");
    checklist.push("Protected route pattern");
  } else if (scaffoldId === "saas-landing") {
    checklist.push("Feature comparison grid");
    checklist.push("Pricing tier cards");
    checklist.push("Social proof / testimonials section");
  } else if (scaffoldId === "portfolio") {
    checklist.push("Project gallery with filtering");
    checklist.push("Case study detail pages");
    checklist.push("Contact form");
  } else if (scaffoldId === "landing-page") {
    checklist.push("Hero section with clear CTA");
    checklist.push("Feature highlights");
    checklist.push("Footer with navigation links");
  } else if (scaffoldId === "content-site") {
    checklist.push("Content hierarchy with sections");
    checklist.push("Internal linking structure");
    checklist.push("SEO metadata on all pages");
  } else if (scaffoldId === "app-shell") {
    checklist.push("Sidebar or top navigation layout");
    checklist.push("Settings or configuration UI");
    checklist.push("Loading and empty states");
  }

  if (entry.signals.auth) checklist.push("Auth-aware UI states");
  if (entry.qualityScore >= 75) checklist.push("Lighthouse 90+ target");

  return checklist;
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
