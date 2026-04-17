/**
 * Generate a human-readable curation queue from raw skiss-files.
 * Lists all candidate dossiers grouped by category, with title + repo-suggestion + Vercel-URL.
 *
 * Output: data/dossiers/_raw/_curation-queue.md
 *
 * Used after `dossiers:scrape` + `dossiers:import` to let a human (or LLM)
 * pick which candidates to promote to real dossiers.
 */

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const RAW_ROOT = resolve(process.cwd(), "data", "dossiers", "_raw");
const OUTPUT_PATH = join(RAW_ROOT, "_curation-queue.md");

interface DossierSkiss {
  id: string;
  category: string;
  _kindHint: "integration" | "ui-section";
  title: string;
  description: string;
  templateUrl: string;
  repoUrl: string | null;
  demoUrl: string | null;
}

function loadSkiss(id: string): DossierSkiss | null {
  const skissPath = join(RAW_ROOT, id, "skiss.json");
  if (!existsSync(skissPath)) return null;
  try {
    return JSON.parse(readFileSync(skissPath, "utf-8")) as DossierSkiss;
  } catch {
    return null;
  }
}

function listSkissDirs(): string[] {
  if (!existsSync(RAW_ROOT)) return [];
  return readdirSync(RAW_ROOT)
    .filter((entry) => {
      if (entry.startsWith("_")) return false;
      try {
        return statSync(join(RAW_ROOT, entry)).isDirectory();
      } catch {
        return false;
      }
    });
}

function categoryHeader(cat: string, kind: string): string {
  const labelMap: Record<string, string> = {
    auth: "Auth (login, signup, OAuth, SSO)",
    payments: "Payments (Stripe, Paddle, billing)",
    database: "Database (Postgres, Supabase, Prisma)",
    cms: "CMS (Sanity, Contentful, Notion, WordPress)",
    realtime: "Realtime (Liveblocks, websockets, presence)",
    bookings: "Bookings (Cal.com, Calendly)",
    email: "Email (Resend, transactional)",
    analytics: "Analytics (PostHog, A/B testing, feature flags)",
    ai: "AI (chat, RAG, agents, voice)",
    storage: "Storage (Blob, S3, Cloudinary)",
    search: "Search (Algolia, Meilisearch)",
    "ui-marketing": "UI — Marketing (landing, pricing, hero, testimonials)",
    "ui-content": "UI — Content (blog, docs, articles)",
    "ui-data": "UI — Data (dashboard, tables, admin)",
  };
  return `## ${labelMap[cat] ?? cat} — ${kind}`;
}

function main(): void {
  const dirs = listSkissDirs();
  const all: DossierSkiss[] = [];
  for (const id of dirs) {
    const skiss = loadSkiss(id);
    if (skiss) all.push(skiss);
  }
  if (all.length === 0) {
    console.log("[queue] No skiss-files found. Run dossiers:scrape + dossiers:import first.");
    return;
  }

  // Group: category -> kindHint -> []
  const grouped = new Map<string, Map<string, DossierSkiss[]>>();
  for (const skiss of all) {
    const catBucket = grouped.get(skiss.category) ?? new Map();
    const kindBucket = catBucket.get(skiss._kindHint) ?? [];
    kindBucket.push(skiss);
    catBucket.set(skiss._kindHint, kindBucket);
    grouped.set(skiss.category, catBucket);
  }

  const lines: string[] = [
    "# Dossier Curation Queue",
    "",
    `**Generated:** ${new Date().toISOString()}`,
    `**Total candidates:** ${all.length}`,
    "",
    "Each row below is a scraped Vercel template that classifier picked as a dossier candidate.",
    "Curation = pick which to promote to `data/dossiers/<id>/` (clone repo, extract 2-5 files, write manifest.json + instructions.md).",
    "",
    "**Marking convention** (edit this file to record decisions):",
    "- `[x]` = approved → ready to extract",
    "- `[~]` = needs investigation",
    "- `[-]` = rejected (note why in inline comment)",
    "- `[ ]` = not yet decided (default)",
    "",
    "---",
    "",
  ];

  // Sort categories
  const sortedCats = [...grouped.keys()].sort((a, b) => {
    const order = ["auth", "payments", "database", "cms", "realtime", "bookings", "email", "analytics", "ai", "storage", "search", "ui-marketing", "ui-content", "ui-data"];
    return order.indexOf(a) - order.indexOf(b);
  });

  for (const cat of sortedCats) {
    const kinds = grouped.get(cat)!;
    for (const kind of ["integration", "ui-section"] as const) {
      const list = kinds.get(kind);
      if (!list || list.length === 0) continue;
      list.sort((a, b) => a.title.localeCompare(b.title));
      lines.push(categoryHeader(cat, kind));
      lines.push("");
      lines.push(`_${list.length} candidate(s)_`);
      lines.push("");
      for (const skiss of list) {
        const repoBadge = skiss.repoUrl ? `[repo](${skiss.repoUrl})` : "";
        const demoBadge = skiss.demoUrl ? `[demo](${skiss.demoUrl})` : "";
        const desc = skiss.description ? ` — ${skiss.description}` : "";
        lines.push(
          `- [ ] **${skiss.title}** [\`${skiss.id}\`](${skiss.templateUrl})${desc}`,
        );
        if (repoBadge || demoBadge) {
          lines.push(`  ${[repoBadge, demoBadge].filter(Boolean).join(" • ")}`);
        }
      }
      lines.push("");
    }
  }

  writeFileSync(OUTPUT_PATH, lines.join("\n") + "\n", "utf-8");
  console.log(`[queue] Wrote ${all.length} candidates across ${sortedCats.length} categories to ${OUTPUT_PATH}`);
}

main();
