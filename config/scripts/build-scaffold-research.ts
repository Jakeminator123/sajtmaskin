/**
 * Build scaffold-research.generated.json from dossier data.
 *
 * Usage:  npx tsx config/scripts/build-scaffold-research.ts
 * Or:     npm run scaffolds:research
 *
 * Reads dossier data from research/dossiers/ (when populated) and produces
 * per-scaffold qualityChecklist + research overrides consumed at runtime by
 * scaffold-research.ts -> registry.ts.
 *
 * When no dossier source exists yet, regenerates a minimal stub that keeps
 * the existing runtime contract intact.
 *
 * Output: src/lib/gen/scaffolds/scaffold-research.generated.json
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { getAllScaffolds } from "../../src/lib/gen/scaffolds/registry";

const OUTPUT_PATH = path.resolve(
  __dirname,
  "../../src/lib/gen/scaffolds/scaffold-research.generated.json",
);
const DOSSIER_DIR = path.resolve(__dirname, "../../research/dossiers");

interface DossierManifest {
  id: string;
  title: string;
  categorySlug: string;
  qualityScore: number;
  strengths: string[];
  scaffoldId?: string;
  qualityChecklist?: string[];
  upgradeTargets?: string[];
}

function loadDossiers(): Map<string, DossierManifest[]> {
  const byScaffold = new Map<string, DossierManifest[]>();
  if (!fs.existsSync(DOSSIER_DIR)) return byScaffold;

  for (const entry of fs.readdirSync(DOSSIER_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(DOSSIER_DIR, entry.name, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;

    try {
      const data = JSON.parse(
        fs.readFileSync(manifestPath, "utf-8"),
      ) as DossierManifest;
      const scaffoldId = data.scaffoldId;
      if (!scaffoldId) continue;
      const existing = byScaffold.get(scaffoldId) ?? [];
      existing.push(data);
      byScaffold.set(scaffoldId, existing);
    } catch {
      console.warn(`Skipping malformed dossier: ${entry.name}`);
    }
  }
  return byScaffold;
}

const MAX_CHECKLIST_ITEMS = 10;
const MAX_UPGRADE_TARGETS = 6;
const MAX_REFERENCE_TEMPLATES = 3;

function main() {
  const scaffolds = getAllScaffolds();
  const dossiersByScaffold = loadDossiers();

  const scaffoldsOut: Record<string, unknown> = {};

  for (const scaffold of scaffolds) {
    const dossiers = dossiersByScaffold.get(scaffold.id);

    if (dossiers && dossiers.length > 0) {
      const checklist = [...new Set(
        dossiers.flatMap((d) => d.qualityChecklist ?? []).filter(Boolean),
      )].slice(0, MAX_CHECKLIST_ITEMS);

      const upgradeTargets = [...new Set(
        dossiers.flatMap((d) => d.upgradeTargets ?? []).filter(Boolean),
      )].slice(0, MAX_UPGRADE_TARGETS);

      const referenceTemplates = dossiers
        .sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0))
        .slice(0, MAX_REFERENCE_TEMPLATES)
        .map((d) => ({
          id: d.id,
          title: d.title,
          categorySlug: d.categorySlug,
          qualityScore: d.qualityScore,
          strengths: d.strengths,
        }));

      scaffoldsOut[scaffold.id] = {
        qualityChecklist: checklist,
        research: { upgradeTargets, referenceTemplates },
      };
    } else {
      scaffoldsOut[scaffold.id] = {
        qualityChecklist: [],
        research: { upgradeTargets: [], referenceTemplates: [] },
      };
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: "config/scripts/build-scaffold-research.ts",
    scaffolds: scaffoldsOut,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");

  const totalChecklist = Object.values(scaffoldsOut).reduce(
    (sum: number, s) => sum + ((s as { qualityChecklist: string[] }).qualityChecklist?.length ?? 0),
    0,
  );
  console.info(`Wrote research for ${Object.keys(scaffoldsOut).length} scaffolds to ${OUTPUT_PATH}`);
  console.info(`Total checklist items: ${totalChecklist} (cap: ${MAX_CHECKLIST_ITEMS}/scaffold)`);

  if (dossiersByScaffold.size === 0) {
    console.info("No dossiers found in research/dossiers/ — all scaffolds get empty research stubs.");
  }
}

main();
