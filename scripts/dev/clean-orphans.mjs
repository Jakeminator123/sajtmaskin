/**
 * Removes regenerable orphans: Python bytecode caches (__pycache__, *.pyc, *.pyo)
 * and truly-empty directories — without touching dependency, cache, scratch or
 * user-data trees.
 *
 * Why this exists:
 * `git` only deletes files it TRACKS. When a tracked file/dir is removed (e.g. via
 * a merge), its gitignored siblings (like __pycache__) survive `git pull`, keeping
 * the directory alive on disk and confusing the next reader. This sweeps them.
 *
 * Usage:
 *   npm run clean:orphans        # delete orphans
 *   npm run clean:orphans:dry    # preview only, removes nothing
 *
 * Cross-platform: pure Node fs, works on Windows / macOS / Linux.
 * Safe-by-design: only removes __pycache__/*.pyc/*.pyo and dirs that contain no
 * files at any depth; never descends into protected trees (see SKIP_DIRS).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
const dryRun = process.argv.includes("--dry-run");

// Directory names we never descend into (dependency trees, caches, scratch, user data).
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".venv",
  "venv",
  ".cursor",
  ".tmp",
  "data",
  "logs",
  "_parkering",
]);

const removedCaches = [];
const removedEmptyDirs = [];

/** True if dir contains no files at any depth (empty subdirs are allowed). */
function isEmptyDeep(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!isEmptyDeep(path.join(dir, e.name))) return false;
    } else {
      return false; // any file or symlink counts as non-empty
    }
  }
  return true;
}

/** Pass 1: remove __pycache__ dirs and *.pyc / *.pyo files. */
function sweepCaches(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (e.name === "__pycache__") {
        removedCaches.push(abs);
        if (!dryRun) fs.rmSync(abs, { recursive: true, force: true });
        continue;
      }
      sweepCaches(abs);
    } else if (e.isFile() && (e.name.endsWith(".pyc") || e.name.endsWith(".pyo"))) {
      removedCaches.push(abs);
      if (!dryRun) fs.rmSync(abs, { force: true });
    }
  }
}

/** Pass 2: remove truly-empty directories (depth-first so parents can collapse). */
function pruneEmpty(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory() || SKIP_DIRS.has(e.name)) continue;
    const abs = path.join(dir, e.name);
    pruneEmpty(abs);
    try {
      if (isEmptyDeep(abs)) {
        removedEmptyDirs.push(abs);
        if (!dryRun) fs.rmSync(abs, { recursive: true, force: true });
      }
    } catch {
      // ignore races / permission issues; report nothing rather than risk a throw
    }
  }
}

sweepCaches(root);
pruneEmpty(root);

const rel = (p) => path.relative(root, p);
const tag = dryRun ? "[clean-orphans] would remove" : "[clean-orphans] removed";
for (const p of removedCaches) console.log(`${tag} (cache): ${rel(p)}`);
for (const p of removedEmptyDirs) console.log(`${tag} (empty dir): ${rel(p)}`);

console.log(
  `[clean-orphans] done${dryRun ? " (dry-run)" : ""} — ${removedCaches.length} cache item(s), ${removedEmptyDirs.length} empty dir(s).`,
);
