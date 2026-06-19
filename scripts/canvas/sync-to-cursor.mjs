#!/usr/bin/env node
/**
 * sync-to-cursor.mjs — materialiserar de incheckade canvas-artefakterna
 * (docs/canvases/*.canvas.txt) som riktiga `.canvas.tsx` i Cursors lokala,
 * per-maskin-mapp sa IDE:n renderar dem bredvid chatten.
 *
 * Varfor .txt i repot + .tsx lokalt: en `.canvas.tsx` i repot skulle fangas
 * av repots globala `tsc`/`eslint` (importerar `cursor/canvas` som inte ar ett
 * repo-beroende) och bracka CI. .txt ror ingen tooling; sync:en lagger .tsx
 * dar bara Cursor laser den. Helt opt-in — INGEN automatisk inkoppling i
 * predev/hooks, sa inga befintliga filer behover andras.
 *
 * Korning:
 *   node scripts/canvas/sync-to-cursor.mjs
 *   node scripts/canvas/sync-to-cursor.mjs --print     (visa bara mal, skriv inte)
 *   CURSOR_PROJECT_DIR="<abs path>" node scripts/canvas/sync-to-cursor.mjs
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const SRC_DIR = join(REPO_ROOT, "docs", "canvases");
const PRINT_ONLY = process.argv.includes("--print");

/** Cursors mappnamn for en workspace: drivbokstav gemen, ":" bort, sep -> "-".
 *  Ex: C:\\Users\\jakem\\dev\\sajtmaskin -> c-Users-jakem-dev-sajtmaskin */
function cursorFolderName(absPath) {
  const noColon = absPath.replace(/:/g, "");
  const dashed = noColon.replace(/[\\/]+/g, "-");
  return dashed.charAt(0).toLowerCase() + dashed.slice(1);
}

function projectsBase() {
  return join(process.env.USERPROFILE || homedir(), ".cursor", "projects");
}

/** Hitta alla rimliga mal-projektmappar (robust mot att Cursors hashning
 *  skiljer sig fran var path-harledning). */
function resolveTargets() {
  const explicit = process.env.CURSOR_PROJECT_DIR;
  if (explicit) return [explicit];

  const base = projectsBase();
  const computed = join(base, cursorFolderName(REPO_ROOT));
  const targets = new Set();
  if (existsSync(computed)) targets.add(computed);

  // Skanna ocksa efter befintliga projektmappar som slutar pa -sajtmaskin.
  const repoLeaf = basename(REPO_ROOT).toLowerCase();
  if (existsSync(base)) {
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const lower = entry.name.toLowerCase();
      if (lower.endsWith("-" + repoLeaf) || lower.endsWith(repoLeaf)) {
        targets.add(join(base, entry.name));
      }
    }
  }

  // Inget hittat (IDE har kanske inte oppnat workspacen an): anvand den
  // harledda sokvagen anda sa den ar redo nasta gang.
  if (targets.size === 0) targets.add(computed);
  return [...targets];
}

function listCanvasTxt() {
  if (!existsSync(SRC_DIR)) return [];
  return readdirSync(SRC_DIR)
    .filter((f) => f.endsWith(".canvas.txt"))
    .map((f) => ({ name: f.replace(/\.canvas\.txt$/, ".canvas.tsx"), src: join(SRC_DIR, f) }));
}

function main() {
  const files = listCanvasTxt();
  if (files.length === 0) {
    console.warn(`[sync-to-cursor] inga *.canvas.txt i ${SRC_DIR} — kor build-llm-flow-canvas.mjs forst.`);
    return;
  }
  const targets = resolveTargets();
  console.info(`[sync-to-cursor] ${files.length} canvas -> ${targets.length} projektmapp(ar)`);

  for (const dir of targets) {
    const canvasesDir = join(dir, "canvases");
    for (const { name, src } of files) {
      const dest = join(canvasesDir, name); // .canvas.tsx
      if (PRINT_ONLY) {
        console.info(`  [print] ${dest}`);
        continue;
      }
      try {
        mkdirSync(canvasesDir, { recursive: true });
        writeFileSync(dest, readFileSync(src, "utf8"), "utf8");
        console.info(`  skrev ${dest}`);
      } catch (err) {
        console.error(`  KUNDE INTE skriva ${dest}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  if (!PRINT_ONLY) {
    console.info("[sync-to-cursor] klart. Oppna canvasen i Cursor (Cmd/Ctrl-klick pa .canvas.tsx eller via Canvas-vyn).");
  }
}

main();
