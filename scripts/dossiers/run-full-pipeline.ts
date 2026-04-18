/**
 * Full Vercel-template ingestion pipeline in one cross-platform command.
 *
 * Runs sequentially:
 *   1. dossiers:scrape           Playwright catalog scrape (~3 min)
 *   2. dossiers:enrich           Playwright detail-page enrich (~14 min cold, ~30s if resumed)
 *   3. dossiers:github-enrich    Bulk GitHub-API health check (~2 min with token)
 *   4. dossiers:import           Convert enriched -> skiss-files (auto-skips archived sources)
 *   5. dossiers:queue            Build markdown curation-queue
 *
 * Optional steps via flags:
 *   --with-promote-all           Auto-promote every skiss to draft
 *   --with-clone                 Shallow-clone every draft's source repo (~500 MB - 2 GB)
 *   --with-extract               Auto-extract files + deps + envVars from clones
 *   --with-curate                Run AI curator on all drafts (~$3-10, ~30 min)
 *   --with-rebuild               Rebuild master + recommendations + embeddings
 *
 * Why this script: PowerShell does not chain `npm run` with `&&`; this gives
 * a single cross-platform entry point. Each step inherits stdio so progress
 * is live in the terminal.
 *
 * Exit early on first failure (skips remaining steps).
 *
 * Usage:
 *   npm run dossiers:full-pipeline
 *   npm run dossiers:full-pipeline -- --with-promote-all --with-clone --with-extract --with-curate --with-rebuild
 */

import { spawnSync } from "node:child_process";
import { platform } from "node:process";

interface Step {
  label: string;
  cmd: string;
  args: string[];
  optional?: boolean;
}

const isWin = platform === "win32";
const NPM = isWin ? "npm.cmd" : "npm";

const args = process.argv.slice(2);
const optAll = args.includes("--with-all");
const opts = {
  promoteAll: optAll || args.includes("--with-promote-all"),
  clone: optAll || args.includes("--with-clone"),
  extract: optAll || args.includes("--with-extract"),
  curate: optAll || args.includes("--with-curate"),
  rebuild: optAll || args.includes("--with-rebuild"),
};

const STEPS: Step[] = [
  { label: "1/N scrape catalog", cmd: NPM, args: ["run", "dossiers:scrape"] },
  { label: "2/N enrich detail-pages", cmd: NPM, args: ["run", "dossiers:enrich"] },
  { label: "3/N github-enrich", cmd: NPM, args: ["run", "dossiers:github-enrich"] },
  { label: "4/N import skiss-files", cmd: NPM, args: ["run", "dossiers:import"] },
  { label: "5/N build curation-queue", cmd: NPM, args: ["run", "dossiers:queue"] },
];

if (opts.promoteAll) {
  STEPS.push({
    label: "6 promote all skiss → draft",
    cmd: "npx",
    args: ["tsx", "scripts/dossiers/promote-skiss-to-dossier.ts", "--all"],
  });
}
if (opts.clone) {
  STEPS.push({ label: "7 clone draft repos", cmd: NPM, args: ["run", "dossiers:clone-repos"] });
}
if (opts.extract) {
  STEPS.push({ label: "8 extract files from clones", cmd: NPM, args: ["run", "dossiers:extract-files"] });
}
if (opts.curate) {
  STEPS.push({ label: "9 AI curate drafts", cmd: NPM, args: ["run", "dossiers:curate"] });
}
if (opts.rebuild) {
  STEPS.push({ label: "10 rebuild master + recommendations + embeddings", cmd: NPM, args: ["run", "dossiers:rebuild"] });
}

console.log(`[full-pipeline] Running ${STEPS.length} steps`);
console.log(
  `[full-pipeline] Optional steps: ${
    Object.entries(opts)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(", ") || "(none — base pipeline only)"
  }`,
);
console.log(``);

const startedAt = Date.now();
let failed = 0;
for (const [i, step] of STEPS.entries()) {
  const stepStart = Date.now();
  console.log(`══════════════════════════════════════════════════════════════════`);
  console.log(`[full-pipeline] ▶ ${step.label}  (${step.cmd} ${step.args.join(" ")})`);
  console.log(`══════════════════════════════════════════════════════════════════`);
  const result = spawnSync(step.cmd, step.args, {
    stdio: "inherit",
    shell: isWin,
  });
  const elapsedSec = ((Date.now() - stepStart) / 1000).toFixed(1);
  if (result.status !== 0) {
    console.error(`\n[full-pipeline] ✗ Step ${i + 1}/${STEPS.length} FAILED after ${elapsedSec}s — aborting remaining steps`);
    failed = 1;
    break;
  }
  console.log(`\n[full-pipeline] ✓ Step ${i + 1}/${STEPS.length} done in ${elapsedSec}s\n`);
}

const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`══════════════════════════════════════════════════════════════════`);
console.log(`[full-pipeline] ${failed === 0 ? "✓ All steps completed" : "✗ Pipeline aborted"} in ${totalSec}s total`);
console.log(`══════════════════════════════════════════════════════════════════`);
process.exit(failed);
