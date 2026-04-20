/**
 * Build the scaffold-recommendations register from dossier manifests.
 *
 * Reads:  data/dossiers/_index/master.json
 * Writes: data/dossiers/_index/scaffold-recommendations.json
 *
 * Behavior:
 * - **Default mode (no flags):** if scaffold-recommendations.json EXISTS, do
 *   not overwrite. The file is hand-editable and the script must respect that.
 *   Print a diff of what would change so the user can decide.
 * - **With --force:** overwrite, regenerate from scaffoldFit + heuristics.
 * - **With --merge:** keep manual additions, only add new dossiers (never
 *   remove existing entries the user has put in).
 *
 * Heuristic for initial generation:
 * - For each scaffold-id (10 of them):
 *   - primaryRecommended  = dossiers whose scaffoldFit.primary includes scaffold-id
 *   - suggested           = dossiers whose scaffoldFit.compatible includes scaffold-id
 *   - alwaysInclude       = empty (never auto-added; explicit only)
 *
 * The pool model: every dossier is technically available to every scaffold;
 * this register just biases the embedding-driven dossier picker at runtime.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const WORKSPACE_ROOT = process.cwd();
const INDEX_ROOT = resolve(WORKSPACE_ROOT, "data", "dossiers", "_index");
const MASTER_PATH = join(INDEX_ROOT, "master.json");
const RECOMMENDATIONS_PATH = join(INDEX_ROOT, "scaffold-recommendations.json");

// Hard-coded scaffold-id list. Source of truth: src/lib/gen/scaffolds/types.ts.
const SCAFFOLD_IDS = [
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
] as const;

interface MasterDossier {
  id: string;
  category: string;
  scaffoldFit?: {
    primary?: string[];
    compatible?: string[];
  };
}

interface MasterIndex {
  generatedAt: string;
  totalDossiers: number;
  dossiers: MasterDossier[];
}

interface ScaffoldRecBucket {
  alwaysInclude: string[];
  primaryRecommended: string[];
  suggested: string[];
}

interface RecommendationsFile {
  $schema?: string;
  generatedAt: string;
  generationMode: "auto" | "merged" | "manual";
  scaffolds: Record<string, ScaffoldRecBucket>;
  notes?: string;
}

const SCHEMA_REF = "../../../docs/schemas/strict/scaffold-recommendations.schema.json";

function generateAuto(master: MasterIndex): RecommendationsFile {
  const scaffolds: Record<string, ScaffoldRecBucket> = {};
  for (const scaffoldId of SCAFFOLD_IDS) {
    const primary = master.dossiers
      .filter((d) => d.scaffoldFit?.primary?.includes(scaffoldId))
      .map((d) => d.id)
      .sort();
    const suggested = master.dossiers
      .filter((d) => d.scaffoldFit?.compatible?.includes(scaffoldId))
      .map((d) => d.id)
      .sort();
    scaffolds[scaffoldId] = {
      alwaysInclude: [],
      primaryRecommended: primary,
      suggested,
    };
  }
  return {
    $schema: SCHEMA_REF,
    generatedAt: new Date().toISOString(),
    generationMode: "auto",
    scaffolds,
    notes: "Auto-generated from dossier scaffoldFit. Edit freely; rerun with --merge to keep your edits and only add new dossiers.",
  };
}

function mergeWithExisting(
  fresh: RecommendationsFile,
  existing: RecommendationsFile,
  validIds: Set<string>,
): RecommendationsFile {
  const merged: RecommendationsFile = {
    $schema: SCHEMA_REF,
    generatedAt: new Date().toISOString(),
    generationMode: "merged",
    scaffolds: {},
    notes: existing.notes,
  };
  // Strip ids that no longer exist in master.json — they are stale references
  // (dossier folder deleted or renamed). User additions for living dossiers
  // are preserved; references to deleted ones are dropped.
  const filterValid = (ids: string[]): string[] => ids.filter((id) => validIds.has(id));
  for (const scaffoldId of SCAFFOLD_IDS) {
    const old = existing.scaffolds[scaffoldId] ?? { alwaysInclude: [], primaryRecommended: [], suggested: [] };
    const newAuto = fresh.scaffolds[scaffoldId] ?? { alwaysInclude: [], primaryRecommended: [], suggested: [] };
    const union = (a: string[], b: string[]): string[] =>
      [...new Set([...a, ...b])].sort();
    merged.scaffolds[scaffoldId] = {
      alwaysInclude: filterValid(old.alwaysInclude), // always-include is manual only — never auto-added
      primaryRecommended: union(filterValid(old.primaryRecommended), newAuto.primaryRecommended),
      suggested: union(filterValid(old.suggested), newAuto.suggested),
    };
  }
  return merged;
}

function diffSummary(a: RecommendationsFile, b: RecommendationsFile): string[] {
  const changes: string[] = [];
  for (const scaffoldId of SCAFFOLD_IDS) {
    const oldBucket = a.scaffolds[scaffoldId] ?? { alwaysInclude: [], primaryRecommended: [], suggested: [] };
    const newBucket = b.scaffolds[scaffoldId] ?? { alwaysInclude: [], primaryRecommended: [], suggested: [] };
    const setDiff = (oldArr: string[], newArr: string[]): { added: string[]; removed: string[] } => ({
      added: newArr.filter((x) => !oldArr.includes(x)),
      removed: oldArr.filter((x) => !newArr.includes(x)),
    });
    for (const tier of ["alwaysInclude", "primaryRecommended", "suggested"] as const) {
      const d = setDiff(oldBucket[tier], newBucket[tier]);
      if (d.added.length > 0 || d.removed.length > 0) {
        changes.push(`  [${scaffoldId}] ${tier}: +${d.added.length} -${d.removed.length}`);
      }
    }
  }
  return changes;
}

function main(): void {
  const force = process.argv.includes("--force");
  const merge = process.argv.includes("--merge");

  if (!existsSync(MASTER_PATH)) {
    console.error(`Missing ${MASTER_PATH}. Run: npm run dossiers:index`);
    process.exit(1);
  }
  const master: MasterIndex = JSON.parse(readFileSync(MASTER_PATH, "utf-8"));

  if (master.totalDossiers === 0) {
    console.error("[recommend] master.json has 0 dossiers. Add dossiers first.");
    process.exit(1);
  }

  mkdirSync(INDEX_ROOT, { recursive: true });

  const fresh = generateAuto(master);

  if (existsSync(RECOMMENDATIONS_PATH) && !force && !merge) {
    const existing: RecommendationsFile = JSON.parse(readFileSync(RECOMMENDATIONS_PATH, "utf-8"));
    const changes = diffSummary(existing, fresh);
    console.log(`[recommend] ${RECOMMENDATIONS_PATH} exists. Not overwriting.`);
    console.log(`[recommend] Use --force to overwrite or --merge to add new dossiers without removing your edits.`);
    if (changes.length === 0) {
      console.log("[recommend] No changes detected vs auto-generated.");
    } else {
      console.log(`[recommend] Diff (auto vs current):`);
      for (const change of changes) console.log(change);
    }
    return;
  }

  let toWrite = fresh;
  const validIds = new Set(master.dossiers.map((d) => d.id));
  if (merge && existsSync(RECOMMENDATIONS_PATH)) {
    const existing: RecommendationsFile = JSON.parse(readFileSync(RECOMMENDATIONS_PATH, "utf-8"));
    toWrite = mergeWithExisting(fresh, existing, validIds);
    const totalEntries = Object.values(toWrite.scaffolds).reduce(
      (sum, b) => sum + b.alwaysInclude.length + b.primaryRecommended.length + b.suggested.length,
      0,
    );
    console.log(`[recommend] Merged with existing — preserved valid edits (${validIds.size} valid dossier ids), total entries: ${totalEntries}.`);
  } else if (force) {
    console.log(`[recommend] --force: overwriting ${RECOMMENDATIONS_PATH}`);
  } else {
    console.log(`[recommend] Creating new ${RECOMMENDATIONS_PATH}`);
  }

  writeFileSync(RECOMMENDATIONS_PATH, JSON.stringify(toWrite, null, 2) + "\n", "utf-8");

  for (const scaffoldId of SCAFFOLD_IDS) {
    const bucket = toWrite.scaffolds[scaffoldId];
    if (!bucket) continue;
    const counts = `always=${bucket.alwaysInclude.length} primary=${bucket.primaryRecommended.length} suggested=${bucket.suggested.length}`;
    console.log(`  ${scaffoldId.padEnd(15)} ${counts}`);
  }
}

main();
