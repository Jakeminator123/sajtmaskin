/**
 * Removes local scratch / cache / stale-artifact files that accumulate during
 * development but are NOT tracked by git (they are gitignored). Unlike
 * `clean-orphans.mjs` (which only sweeps __pycache__ and empty dirs), this
 * script targets the growing scratch trees: .tmp, caches, rotated logs and
 * timestamped env-backups.
 *
 * Why this exists:
 * `.tmp/`, `logs/*` and `.env-backups/` are gitignored, so `git clean` in a
 * normal workflow never touches them and they grow unbounded on disk. This is
 * the repeatable "empty them" button the repo-cleanup plan asked for.
 *
 * Safety model:
 *   - Dry-run by DEFAULT. Nothing is removed unless you pass --apply.
 *   - NEVER deletes git-tracked files (checked via `git ls-files`).
 *   - Retention: keeps the newest RETAIN_COUNT entries AND anything newer than
 *     RETAIN_DAYS in age-based trees (logs, env-backups). Pure caches (.tmp,
 *     .eslintcache, .pytest_cache) are cleared fully.
 *
 * Usage:
 *   npm run clean:scratch        # dry-run (preview only)
 *   npm run clean:scratch:apply  # actually delete
 *
 * Cross-platform: pure Node fs + one `git ls-files` call.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
const apply = process.argv.includes("--apply");

// Keep at least this many newest entries in age-based trees, and never delete
// anything younger than this many days. Conservative on purpose.
const RETAIN_COUNT = 3;
const RETAIN_DAYS = 14;
const RETAIN_MS = RETAIN_DAYS * 24 * 60 * 60 * 1000;

/** Fully-cleared trees (pure cache/scratch — safe to wipe contents entirely). */
const WIPE_TREES = [".tmp", ".pytest_cache"];
/** Single cache files removed outright. */
const WIPE_FILES = [".eslintcache"];
/** Age-based trees: keep newest RETAIN_COUNT + anything younger than RETAIN_DAYS. */
const AGE_TREES = ["logs", ".env-backups"];
/**
 * Names inside AGE_TREES that have their OWN retention managed by observability
 * tooling (LRU caps, see .gitignore). We must not fight that tooling, so we
 * skip these subtrees entirely and only prune loose sibling artifacts.
 */
const AGE_SKIP_NAMES = new Set([
  "generationslogg",
  "site-observability",
  "llm-segmentts-and-index",
]);

/** Set of git-tracked paths (absolute, normalized) so we never delete them. */
function loadTrackedSet() {
  try {
    const out = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
    const set = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.trim()) continue;
      set.add(path.resolve(root, line));
    }
    return set;
  } catch {
    // No git or command failed — fail safe: treat everything as "tracked"
    // by returning null, which callers interpret as "skip deletion".
    return null;
  }
}

const tracked = loadTrackedSet();
const removed = [];
const skippedTracked = [];
const kept = [];

function isTracked(abs) {
  if (tracked === null) return true; // fail-safe
  return tracked.has(path.resolve(abs));
}

/** Recursively collect tracked-file guard: true if dir contains any tracked file. */
function containsTrackedFile(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (containsTrackedFile(abs)) return true;
    } else if (isTracked(abs)) {
      return true;
    }
  }
  return false;
}

function removeEntry(abs, label) {
  removed.push({ abs, label });
  if (apply) fs.rmSync(abs, { recursive: true, force: true });
}

/** Wipe a whole scratch/cache tree (skips tracked files if any sneak in). */
function wipeTree(rel) {
  const dir = path.join(root, rel);
  if (!fs.existsSync(dir)) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory() ? containsTrackedFile(abs) : isTracked(abs)) {
      skippedTracked.push(abs);
      continue;
    }
    removeEntry(abs, `wipe:${rel}`);
  }
}

function wipeFile(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return;
  if (isTracked(abs)) {
    skippedTracked.push(abs);
    return;
  }
  removeEntry(abs, `wipe-file:${rel}`);
}

/** Age-based prune: keep newest RETAIN_COUNT + anything younger than RETAIN_DAYS. */
function pruneByAge(rel) {
  const dir = path.join(root, rel);
  if (!fs.existsSync(dir)) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const now = Date.now();
  const candidates = [];
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    // Leave tooling-managed subtrees (their own LRU retention) untouched.
    if (e.isDirectory() && AGE_SKIP_NAMES.has(e.name)) {
      kept.push(abs);
      continue;
    }
    // Never touch subtrees/files that contain tracked files.
    if (e.isDirectory() ? containsTrackedFile(abs) : isTracked(abs)) {
      skippedTracked.push(abs);
      continue;
    }
    let mtime = 0;
    try {
      mtime = fs.statSync(abs).mtimeMs;
    } catch {
      continue;
    }
    candidates.push({ abs, mtime });
  }
  // Sort newest-first; keep RETAIN_COUNT newest regardless of age.
  candidates.sort((a, b) => b.mtime - a.mtime);
  candidates.forEach((c, i) => {
    const withinCount = i < RETAIN_COUNT;
    const withinAge = now - c.mtime < RETAIN_MS;
    if (withinCount || withinAge) {
      kept.push(c.abs);
    } else {
      removeEntry(c.abs, `age-prune:${rel}`);
    }
  });
}

for (const t of WIPE_TREES) wipeTree(t);
for (const f of WIPE_FILES) wipeFile(f);
for (const t of AGE_TREES) pruneByAge(t);

const rel = (p) => path.relative(root, p);
const tag = apply ? "[clean-scratch] removed" : "[clean-scratch] would remove";
for (const r of removed) console.log(`${tag} (${r.label}): ${rel(r.abs)}`);
if (skippedTracked.length > 0) {
  console.log(`[clean-scratch] kept ${skippedTracked.length} tracked/guarded path(s).`);
}
console.log(
  `[clean-scratch] done${apply ? "" : " (dry-run)"} — ` +
    `${removed.length} item(s) ${apply ? "removed" : "would be removed"}, ` +
    `${kept.length} kept by retention (newest ${RETAIN_COUNT} / <${RETAIN_DAYS}d).` +
    (apply ? "" : " Re-run with --apply to delete."),
);
