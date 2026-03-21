/**
 * normalize-raw-catalog.ts — Zone 1 → Zone 2
 *
 * Reads the raw scraper output (summary.json / ingestion_report.json) produced
 * outside the repo and writes a small, committed normalized-catalog.json into
 * research/.
 *
 * Usage:
 *   npx tsx config/scripts/normalize-raw-catalog.ts --input ~/vercel-scrape
 *   npm run research:normalize -- --input ~/vercel-scrape
 *
 * The input directory should contain summary.json (from hamta_sidor.py) and
 * optionally ingestion_report.json.  The script never reads large clone dirs;
 * it only consumes JSON metadata files.
 */

import fs from "fs";
import path from "path";
import type {
  NormalizedCatalogEntry,
  NormalizedCatalogFile,
  NormalizedRepoHealth,
  NormalizedRepoType,
  PromotionDecision,
  TemplateLibrarySignals,
} from "../../src/lib/gen/template-library/types";
import type { ScaffoldFamily } from "../../src/lib/gen/scaffolds/types";

const OUTPUT_PATH = path.resolve(__dirname, "../../research/normalized-catalog.json");

interface RawTemplateInfo {
  category_slug: string;
  category_name: string;
  template_url: string;
  title: string;
  description: string;
  repo_url: string | null;
  demo_url: string | null;
  framework_match: boolean;
  framework_reason: string;
  stack_tags: string[];
  important_lines: string[];
}

interface IngestReportEntry {
  template_url: string;
  title?: string;
  repo_url?: string | null;
  category_slug?: string;
  framework_match?: boolean;
  framework_reason?: string;
  clone_ok?: boolean | null;
  disk_bytes_repo?: number;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function inferRepoType(raw: RawTemplateInfo): NormalizedRepoType {
  const text = `${raw.title} ${raw.description}`.toLowerCase();
  if (/boilerplate/.test(text)) return "boilerplate";
  if (/starter\s*kit|starter\s*template/.test(text)) return "starter_kit";
  if (/commerce|shop|store/.test(text)) return "commerce_template";
  if (/landing|marketing/.test(text)) return "landing_template";
  if (/demo|playground|example/.test(text)) return "vertical_demo";
  if (/editor|notion|wysiwyg|ai[\s-]powered/.test(text)) return "full_app";
  if (/design\s*system|ui\s*kit/.test(text)) return "design_reference_only";
  return "unknown";
}

const SCAFFOLD_FAMILY_HINTS: Record<string, string[]> = {
  ecommerce: ["ecommerce", "commerce", "shop", "store", "storefront"],
  blog: ["blog", "markdown", "editorial", "magazine"],
  portfolio: ["portfolio", "gallery", "photography", "personal"],
  "saas-landing": ["saas", "subscription", "pricing"],
  "landing-page": ["starter", "marketing", "landing"],
  dashboard: ["dashboard", "admin", "analytics"],
  "auth-pages": ["authentication", "auth", "login"],
  "app-shell": ["backend", "admin-dashboard", "realtime"],
  "content-site": ["documentation", "docs", "cms", "wiki", "content"],
  "base-nextjs": ["boilerplate", "nextjs", "next.js"],
};

function inferScaffoldFamilies(raw: RawTemplateInfo): ScaffoldFamily[] {
  const text = `${raw.category_slug} ${raw.title} ${raw.description} ${raw.stack_tags.join(" ")}`.toLowerCase();
  const families: ScaffoldFamily[] = [];
  for (const [family, hints] of Object.entries(SCAFFOLD_FAMILY_HINTS)) {
    const hits = hints.filter((h) => text.includes(h)).length;
    if (hits > 0) families.push(family as ScaffoldFamily);
  }
  return families;
}

function inferSignals(raw: RawTemplateInfo): TemplateLibrarySignals {
  const text = `${raw.title} ${raw.description} ${raw.stack_tags.join(" ")} ${raw.important_lines.join(" ")}`.toLowerCase();
  return {
    auth: /auth|login|sign.?in|clerk|supabase.?auth/.test(text),
    dashboard: /dashboard|analytics|admin/.test(text),
    pricing: /pricing|stripe|billing|subscription|paddle/.test(text),
    blog: /blog|article|post|editorial/.test(text),
    portfolio: /portfolio|gallery|photography/.test(text),
    ecommerce: /ecommerce|commerce|shop|cart|shopify/.test(text),
    docs: /documentation|docs|wiki/.test(text),
    ai: /\bai\b|openai|gpt|llm|tiptap/.test(text),
    multiTenant: /multi.?tenant|subdomain|platform/.test(text),
    cms: /cms|sanity|contentful|strapi|notion|payload/.test(text),
  };
}

function inferQualityScore(raw: RawTemplateInfo, cloneOk: boolean | null): number {
  let score = 50;
  if (raw.repo_url) score += 15;
  if (cloneOk === true) score += 10;
  if (raw.framework_match) score += 10;
  if (raw.description.length > 60) score += 5;
  if (raw.stack_tags.length > 0) score += 5;
  const placeholderRatio = estimatePlaceholderRatio(raw);
  if (placeholderRatio > 0.4) score -= 15;
  return Math.max(0, Math.min(100, score));
}

function estimatePlaceholderRatio(raw: RawTemplateInfo): number {
  const text = `${raw.description} ${raw.important_lines.join(" ")}`.toLowerCase();
  const totalWords = text.split(/\s+/).length;
  if (totalWords < 5) return 0;
  const loremCount = (text.match(/lorem|ipsum|dolor|amet|consectetur/g) || []).length;
  return loremCount / totalWords;
}

function inferPromotionDecision(entry: Omit<NormalizedCatalogEntry, "promotionDecision" | "rationale">): PromotionDecision {
  if (!entry.frameworkMatch) return "ignore";
  if (!entry.repoUrl) return "template_library_only";
  if (entry.repoType === "design_reference_only") return "template_library_only";
  if (entry.qualityScore >= 75 && entry.recommendedScaffoldFamilies.length > 0) {
    return "runtime_scaffold_candidate";
  }
  if (entry.qualityScore >= 50) return "dossier_only";
  return "template_library_only";
}

function buildRepoHealth(raw: RawTemplateInfo, cloneOk: boolean | null): NormalizedRepoHealth {
  const lines = raw.important_lines.map((l) => l.toLowerCase());
  return {
    hasReadme: lines.some((l) => l.includes("readme")),
    hasPackageJson: lines.some((l) => l.includes("package.json") || l.includes("npm install") || l.includes("pnpm install")),
    hasAppDir: lines.some((l) => l.includes("app/")),
    hasSrcAppDir: lines.some((l) => l.includes("src/app/")),
    isMonorepo: lines.some((l) => l.includes("monorepo") || l.includes("turbo")),
    packageManager: detectPackageManager(raw),
    envVarCount: lines.filter((l) => /^[A-Z][A-Z0-9_]{4,}$/.test(l.trim())).length,
    placeholderCopyRatio: estimatePlaceholderRatio(raw),
  };
}

function detectPackageManager(raw: RawTemplateInfo): "npm" | "pnpm" | "yarn" | "bun" | "unknown" {
  const text = raw.important_lines.join(" ").toLowerCase();
  if (text.includes("pnpm")) return "pnpm";
  if (text.includes("bun ")) return "bun";
  if (text.includes("yarn")) return "yarn";
  if (text.includes("npm ")) return "npm";
  return "unknown";
}

function normalizeEntry(raw: RawTemplateInfo, cloneInfo: IngestReportEntry | undefined): NormalizedCatalogEntry {
  const cloneOk = cloneInfo?.clone_ok ?? null;
  const partial = {
    id: `vercel-${slugify(raw.title)}`,
    slug: slugify(raw.title),
    title: raw.title,
    description: raw.description,
    sourceUrl: raw.template_url,
    repoUrl: raw.repo_url,
    demoUrl: raw.demo_url,
    categorySlug: raw.category_slug,
    categoryName: raw.category_name,
    stackTags: raw.stack_tags,
    frameworkMatch: raw.framework_match,
    frameworkReason: raw.framework_reason,
    repoType: inferRepoType(raw),
    qualityScore: inferQualityScore(raw, cloneOk),
    signals: inferSignals(raw),
    recommendedScaffoldFamilies: inferScaffoldFamilies(raw),
    repoHealth: buildRepoHealth(raw, cloneOk),
  };

  const promotionDecision = inferPromotionDecision(partial);
  const rationale = `repoType=${partial.repoType}, quality=${partial.qualityScore}, families=[${partial.recommendedScaffoldFamilies.join(",")}]`;

  return { ...partial, promotionDecision, rationale };
}

function main() {
  const args = process.argv.slice(2);
  const inputIdx = args.indexOf("--input");
  if (inputIdx === -1 || !args[inputIdx + 1]) {
    console.error("Usage: npx tsx config/scripts/normalize-raw-catalog.ts --input <raw-scrape-dir>");
    process.exit(1);
  }
  const inputDir = path.resolve(args[inputIdx + 1]);

  const summaryPath = path.join(inputDir, "summary.json");
  if (!fs.existsSync(summaryPath)) {
    console.error(`summary.json not found in ${inputDir}`);
    process.exit(1);
  }

  const summary: Record<string, RawTemplateInfo[]> = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));

  let ingestReport: IngestReportEntry[] = [];
  const reportPath = path.join(inputDir, "ingestion_report.json");
  if (fs.existsSync(reportPath)) {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
    ingestReport = report.entries ?? [];
  }
  const ingestByUrl = new Map(ingestReport.map((e) => [e.template_url, e]));

  const entries: NormalizedCatalogEntry[] = [];
  const seenIds = new Set<string>();

  for (const templates of Object.values(summary)) {
    for (const raw of templates) {
      const entry = normalizeEntry(raw, ingestByUrl.get(raw.template_url));
      if (seenIds.has(entry.id)) {
        entry.id = `${entry.id}-${entry.categorySlug}`;
      }
      seenIds.add(entry.id);
      entries.push(entry);
    }
  }

  const catalog: NormalizedCatalogFile = {
    generatedAt: new Date().toISOString(),
    rawSourcePath: inputDir.replace(/\\/g, "/"),
    entryCount: entries.length,
    entries,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(catalog, null, 2), "utf-8");

  const byDecision = entries.reduce(
    (acc, e) => { acc[e.promotionDecision] = (acc[e.promotionDecision] ?? 0) + 1; return acc; },
    {} as Record<string, number>,
  );

  console.info(`Wrote ${entries.length} normalized entries to ${OUTPUT_PATH}`);
  console.info("Promotion breakdown:", byDecision);
}

main();
