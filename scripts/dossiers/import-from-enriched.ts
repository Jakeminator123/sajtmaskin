/**
 * Re-import from enriched template details (data/dossiers/_raw/_enriched/*.json).
 *
 * Replaces the old title-guessing classifier with REAL Vercel badge data:
 *   - useCases       (e.g. ["Starter", "Authentication"])
 *   - stack          (e.g. ["Next.js", "Tailwind"])
 *   - database       (e.g. ["Postgres"])
 *   - cms            (e.g. ["Sanity"])
 *   - authentication (e.g. ["NextAuth.js"])
 *   - framework      (filter)
 *   - repoUrl        (real)
 *
 * Output: data/dossiers/_raw/<id>/skiss.json — overwrites existing skiss
 *         from the title-guessing import.
 *
 * Skip rules:
 *   - framework does not include Next.js → skip (we only build Next sites)
 *   - useCases includes "Edge Config", "Edge Functions", "Edge Middleware",
 *     "CDN", "Vercel Firewall", "Web3", "Microfrontends", "Monorepos",
 *     "Virtual Event", "Backend" → skip (not relevant for site generation)
 *   - templates marked _failed during enrich → skip
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const RAW_ROOT = resolve(process.cwd(), "data", "dossiers", "_raw");
const ENRICHED_DIR = join(RAW_ROOT, "_enriched");

interface EnrichedTemplate {
  templateUrl: string;
  templateSlug: string;
  title: string;
  description: string;
  useCases: string[];
  stack: string[];
  database: string[];
  cms: string[];
  authentication: string[];
  framework: string[];
  repoUrl: string | null;
  demoUrl: string | null;
  enrichedAt: string;
  _failed?: boolean;
  _failureReason?: string;
}

interface DossierSkiss {
  _status: "scraped";
  _kindHint: "integration" | "ui-section";
  _curationRequired: true;
  _scrapedAt: string;
  _importedAt: string;
  _source: string;
  id: string;
  category: string;
  vercelUseCases: string[];
  vercelStack: string[];
  vercelDatabase: string[];
  vercelCms: string[];
  vercelAuth: string[];
  title: string;
  description: string;
  templateUrl: string;
  templateSlug: string;
  repoUrl: string | null;
  demoUrl: string | null;
}

const SKIP_USE_CASES = new Set([
  "Edge Config", "Edge Functions", "Edge Middleware", "CDN",
  "Vercel Firewall", "Web3", "Microfrontends", "Monorepos",
  "Virtual Event", "Backend", "Cron", "Security",
]);

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
}

interface Classification {
  category: string;
  kindHint: "integration" | "ui-section";
}

/**
 * Classify a template using REAL Vercel badges. Specific provider badges
 * (auth/database/cms) take precedence over generic Use Case badges.
 *
 * Priority order (first match wins):
 *   1. Vercel `auth` badge present → category=auth, kind=integration
 *   2. Vercel `cms` badge present → category=cms, kind=integration
 *   3. Title contains stripe/paddle/payment → category=payments, kind=integration
 *   4. Vercel `database` badge present → category=database, kind=integration
 *   5. Use Cases includes "AI" → category=ai, kind=integration
 *   6. Use Cases includes "Realtime Apps" → category=realtime, kind=integration
 *   7. Use Cases includes "Authentication" / "Multi-Tenant Apps" → category=auth, kind=integration
 *   8. Use Cases includes "Ecommerce" → category=payments, kind=integration
 *   9. Use Cases includes "SaaS" → category=payments OR ui-marketing
 *  10. Use Cases includes "Admin Dashboard" → category=ui-data, kind=ui-section
 *  11. Use Cases includes "Blog" → category=ui-content, kind=ui-section
 *  12. Use Cases includes "Portfolio" → category=ui-marketing, kind=ui-section
 *  13. Use Cases includes "Documentation" → category=ui-content, kind=ui-section
 *  14. Use Cases includes "Marketing Sites" → category=ui-marketing, kind=ui-section
 *  15. Title contains "starter" → category=ui-marketing, kind=ui-section (generic)
 *  16. Else → null (skip)
 */
function classify(t: EnrichedTemplate): Classification | null {
  const title = (t.title ?? "").toLowerCase();
  const desc = (t.description ?? "").toLowerCase();
  const haystack = `${title} ${desc}`;

  if (t.authentication.length > 0) {
    return { category: "auth", kindHint: "integration" };
  }
  if (t.cms.length > 0) {
    return { category: "cms", kindHint: "integration" };
  }
  if (/\b(stripe|paddle|paypal|lemonsqueezy|polar)\b/.test(haystack)) {
    return { category: "payments", kindHint: "integration" };
  }
  if (t.database.length > 0) {
    return { category: "database", kindHint: "integration" };
  }
  if (t.useCases.includes("AI")) {
    return { category: "ai", kindHint: "integration" };
  }
  if (t.useCases.includes("Realtime Apps")) {
    return { category: "realtime", kindHint: "integration" };
  }
  if (t.useCases.includes("Authentication") || t.useCases.includes("Multi-Tenant Apps")) {
    return { category: "auth", kindHint: "integration" };
  }
  if (t.useCases.includes("Ecommerce")) {
    return { category: "payments", kindHint: "integration" };
  }
  if (t.useCases.includes("SaaS")) {
    return /\b(stripe|paddle|payment|billing|subscription)\b/.test(haystack)
      ? { category: "payments", kindHint: "integration" }
      : { category: "ui-marketing", kindHint: "ui-section" };
  }
  if (t.useCases.includes("Admin Dashboard")) {
    return { category: "ui-data", kindHint: "ui-section" };
  }
  if (t.useCases.includes("Blog")) {
    return { category: "ui-content", kindHint: "ui-section" };
  }
  if (t.useCases.includes("Portfolio")) {
    return { category: "ui-marketing", kindHint: "ui-section" };
  }
  if (t.useCases.includes("Documentation")) {
    return { category: "ui-content", kindHint: "ui-section" };
  }
  if (t.useCases.includes("Marketing Sites")) {
    return { category: "ui-marketing", kindHint: "ui-section" };
  }
  // Pure starter with no specific tags = generic boilerplate, not useful as dossier.
  return null;
}

function passesFrameworkFilter(t: EnrichedTemplate): boolean {
  if (t.framework.length === 0) {
    // Some templates don't expose a framework badge but title hints work.
    return /\bnext\.?js\b/i.test(t.title) || /\bnext\.?js\b/i.test(t.description);
  }
  return t.framework.some((f) => /next\.?js/i.test(f));
}

function passesUseCaseFilter(t: EnrichedTemplate): { ok: true } | { ok: false; reason: string } {
  for (const uc of t.useCases) {
    if (SKIP_USE_CASES.has(uc)) {
      return { ok: false, reason: `skip-use-case:${uc}` };
    }
  }
  return { ok: true };
}

function buildSkiss(t: EnrichedTemplate, classification: Classification): DossierSkiss {
  const id = `${classification.category}-${slugify(t.title)}`.slice(0, 80);
  return {
    _status: "scraped",
    _kindHint: classification.kindHint,
    _curationRequired: true,
    _scrapedAt: t.enrichedAt,
    _importedAt: new Date().toISOString(),
    _source: "vercel-enriched",
    id,
    category: classification.category,
    vercelUseCases: t.useCases,
    vercelStack: t.stack,
    vercelDatabase: t.database,
    vercelCms: t.cms,
    vercelAuth: t.authentication,
    title: t.title,
    description: t.description,
    templateUrl: t.templateUrl,
    templateSlug: t.templateSlug,
    repoUrl: t.repoUrl,
    demoUrl: t.demoUrl,
  };
}

function main(): void {
  if (!existsSync(ENRICHED_DIR)) {
    console.error(`Missing ${ENRICHED_DIR}. Run: npm run dossiers:enrich`);
    process.exit(1);
  }

  const files = readdirSync(ENRICHED_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.error("[import] No enriched files found.");
    process.exit(1);
  }
  console.log(`[import] Reading ${files.length} enriched files`);

  const written: DossierSkiss[] = [];
  const skipped: { url: string; reason: string }[] = [];
  const seenIds = new Set<string>();

  for (const file of files) {
    let t: EnrichedTemplate;
    try {
      t = JSON.parse(readFileSync(join(ENRICHED_DIR, file), "utf-8")) as EnrichedTemplate;
    } catch (err) {
      skipped.push({ url: file, reason: `invalid-json:${err instanceof Error ? err.message : err}` });
      continue;
    }

    if (t._failed) {
      skipped.push({ url: t.templateUrl, reason: `enrich-failed:${t._failureReason ?? "unknown"}` });
      continue;
    }

    if (!passesFrameworkFilter(t)) {
      skipped.push({ url: t.templateUrl, reason: `non-next-framework:${t.framework.join("|")}` });
      continue;
    }

    const useCaseGate = passesUseCaseFilter(t);
    if (!useCaseGate.ok) {
      skipped.push({ url: t.templateUrl, reason: useCaseGate.reason });
      continue;
    }

    const cls = classify(t);
    if (!cls) {
      skipped.push({ url: t.templateUrl, reason: "no-classifier-match" });
      continue;
    }

    const skiss = buildSkiss(t, cls);
    if (seenIds.has(skiss.id)) {
      skipped.push({ url: t.templateUrl, reason: `duplicate-id:${skiss.id}` });
      continue;
    }
    seenIds.add(skiss.id);

    const dest = join(RAW_ROOT, skiss.id);
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "skiss.json"), JSON.stringify(skiss, null, 2) + "\n", "utf-8");
    written.push(skiss);
  }

  const summary = {
    importedAt: new Date().toISOString(),
    sourceDir: ENRICHED_DIR,
    enrichedFiles: files.length,
    written: written.length,
    skipped: skipped.length,
    byCategory: written.reduce<Record<string, number>>((acc, s) => {
      acc[s.category] = (acc[s.category] ?? 0) + 1;
      return acc;
    }, {}),
    skipReasonCounts: skipped.reduce<Record<string, number>>((acc, s) => {
      const key = s.reason.split(":")[0]!;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  };

  writeFileSync(
    join(RAW_ROOT, "_import-summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
    "utf-8",
  );

  console.log(`[import] Wrote ${written.length} skiss-files`);
  console.log(`[import] Skipped ${skipped.length}`);
  console.log(`[import] By category:`, summary.byCategory);
  console.log(`[import] Skip reasons:`, summary.skipReasonCounts);
}

main();
