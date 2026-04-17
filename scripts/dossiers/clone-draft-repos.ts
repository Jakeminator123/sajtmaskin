/**
 * Shallow-clone repos for all draft dossiers that have a sourceRepoUrl.
 *
 * Reads:  data/dossiers/_index/master.json (drafts only)
 * Clones: data/dossiers/_repo-cache/<dossier-id>/  (shallow, --depth=1)
 *
 * Why shallow: we only need the latest snapshot to inspect/extract files —
 * not git history. Saves disk + time.
 *
 * Skip behavior:
 * - Dossier missing sourceRepoUrl → skip
 * - Dossier already cloned (folder exists) → skip
 * - Clone fails (404, network, etc.) → log + continue
 *
 * Resumable. Run again to retry failed.
 */

import { readFileSync, existsSync, mkdirSync, statSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const WORKSPACE_ROOT = process.cwd();
const MASTER_PATH = resolve(WORKSPACE_ROOT, "data", "dossiers", "_index", "master.json");
const REPO_CACHE_ROOT = resolve(WORKSPACE_ROOT, "data", "dossiers", "_repo-cache");

interface MasterDossier {
  id: string;
  _status?: "draft" | "active";
  sourceRepoUrl?: string;
}

interface MasterIndex {
  totalDossiers: number;
  dossiers: MasterDossier[];
}

function dirSizeBytes(dir: string): number {
  let total = 0;
  function walk(p: string): void {
    let entries: string[];
    try {
      entries = readdirSync(p);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(p, name);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        if (name === ".git") {
          // Skip .git for size accounting — it's overhead.
          total += s.size;
          continue;
        }
        walk(full);
      } else {
        total += s.size;
      }
    }
  }
  walk(dir);
  return total;
}

function shallowClone(repoUrl: string, dest: string): { ok: boolean; output: string } {
  const result = spawnSync("git", ["clone", "--depth=1", "--single-branch", repoUrl, dest], {
    encoding: "utf-8",
    timeout: 60_000,
  });
  return {
    ok: result.status === 0,
    output: (result.stdout ?? "") + (result.stderr ?? ""),
  };
}

function formatBytes(b: number): string {
  if (b > 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  if (b > 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

function main(): void {
  if (!existsSync(MASTER_PATH)) {
    console.error(`Missing ${MASTER_PATH}. Run npm run dossiers:index first.`);
    process.exit(1);
  }
  const master: MasterIndex = JSON.parse(readFileSync(MASTER_PATH, "utf-8"));

  mkdirSync(REPO_CACHE_ROOT, { recursive: true });

  const draftWithRepo = master.dossiers.filter(
    (d) => (d._status === "draft") && d.sourceRepoUrl,
  );
  const draftWithoutRepo = master.dossiers.filter(
    (d) => (d._status === "draft") && !d.sourceRepoUrl,
  );

  console.log(`[clone] Drafts to consider: ${draftWithRepo.length}`);
  console.log(`[clone] Drafts skipped (no sourceRepoUrl): ${draftWithoutRepo.length}`);

  let cloned = 0;
  let resumed = 0;
  let failed = 0;
  let totalBytes = 0;
  const startTs = Date.now();

  for (const d of draftWithRepo) {
    const dest = join(REPO_CACHE_ROOT, d.id);
    if (existsSync(dest)) {
      const size = dirSizeBytes(dest);
      console.log(`[clone] SKIP ${d.id} (already cloned, ${formatBytes(size)})`);
      resumed++;
      totalBytes += size;
      continue;
    }
    console.log(`[clone] ${d.id} <- ${d.sourceRepoUrl}`);
    const { ok, output } = shallowClone(d.sourceRepoUrl!, dest);
    if (!ok) {
      failed++;
      const tail = output.trim().split("\n").slice(-2).join(" / ");
      console.warn(`[clone] FAIL ${d.id}: ${tail}`);
      continue;
    }
    cloned++;
    const size = dirSizeBytes(dest);
    totalBytes += size;
    console.log(`[clone]   OK (${formatBytes(size)})`);
  }

  const mins = ((Date.now() - startTs) / 60000).toFixed(1);
  console.log(``);
  console.log(`[clone] Done in ${mins} min:`);
  console.log(`[clone]   ${cloned} newly cloned`);
  console.log(`[clone]   ${resumed} already on disk`);
  console.log(`[clone]   ${failed} failed`);
  console.log(`[clone]   ${formatBytes(totalBytes)} total in ${REPO_CACHE_ROOT}`);
  console.log(``);
  console.log(`[clone] Cache is gitignored + cursorignored (won't bloat git or Cursor index).`);
  console.log(`[clone] Next: manually inspect repos to pick 2-5 files per dossier into data/dossiers/<id>/components/`);
}

main();
