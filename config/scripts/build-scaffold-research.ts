/**
 * Build scaffold-research.generated.json — minimal stubs per scaffold.
 *
 * Usage:  npx tsx config/scripts/build-scaffold-research.ts
 * Or:     npm run scaffolds:research
 *
 * Generates an empty-but-structurally-valid entry for each scaffold in
 * the registry. Dossier/external enrichment was removed; quality
 * checklists and reference templates will be rebuilt when new scaffold
 * content is authored.
 *
 * Output: src/lib/gen/scaffolds/scaffold-research.generated.json
 */

import fs from "fs";
import path from "path";
import { getAllScaffolds } from "../../src/lib/gen/scaffolds/registry";

const OUTPUT_PATH = path.resolve(
  __dirname,
  "../../src/lib/gen/scaffolds/scaffold-research.generated.json",
);

function main() {
  const scaffolds = getAllScaffolds();
  const scaffoldsOut: Record<string, unknown> = {};

  for (const scaffold of scaffolds) {
    scaffoldsOut[scaffold.id] = {
      qualityChecklist: [],
      research: { upgradeTargets: [], referenceTemplates: [] },
    };
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: "config/scripts/build-scaffold-research.ts",
    scaffolds: scaffoldsOut,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");

  console.info(`Wrote empty research stubs for ${Object.keys(scaffoldsOut).length} scaffolds to ${OUTPUT_PATH}`);
}

main();
