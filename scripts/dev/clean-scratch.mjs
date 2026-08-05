/**
 * Removes local scratch / cache / stale-artifact files that accumulate during
 * development but are NOT tracked by git (they are gitignored). Unlike
 * `clean-orphans.mjs` (which only sweeps __pycache__ and empty dirs), this
 * script targets the growing scratch trees: .tmp, caches, agent scratch under
 * .cursor/, rotated logs and timestamped env-backups.
 *
 * Why this exists:
 * `.tmp/`, `logs/*`, `.env-backups/` and `.cursor/` scratch are gitignored, so
 * `git clean` in a normal workflow never touches them and they grow unbounded
 * on disk. This is the repeatable "empty them" button the repo-cleanup plan
 * asked for.
 *
 * Safety model:
 *   - Dry-run by DEFAULT. Nothing is removed unless you pass --apply.
 *   - NEVER deletes git-tracked files (checked via `git ls-files`).
 *   - Retention:
 *       · AGE_TREES (`.env-backups`): keep newest RETAIN_COUNT + anything
 *         younger than RETAIN_DAYS.
 *       · COUNT_TREES (`.cursor/` scratch): hard RETAIN_COUNT cap, no age
 *         escape hatch — a busy day produces a dozen entries that are all
 *         minutes old, so the age hatch would keep every one of them.
 *       · logs/: hard LOGS_RETAIN_COUNT (=2) cap on *directories* (same no-
 *         age-escape rationale), plus full wipe of loose scratch files
 *         directly under logs/. Tooling-managed subtrees in AGE_SKIP_NAMES
 *         are left alone.
 *     Pure caches (.tmp, .eslintcache, .pytest_cache) are cleared fully.
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
const DEFAULT_ROOT = path.join(__dirname, "..", "..");

// Keep at least this many newest entries in age-based trees, and never delete
// anything younger than this many days. Conservative on purpose.
export const RETAIN_COUNT = 3;
export const RETAIN_DAYS = 14;
const RETAIN_MS = RETAIN_DAYS * 24 * 60 * 60 * 1000;
/**
 * Owner requirement: at most two log dump folders under logs/ at once.
 * Same hard-cap rationale as COUNT_TREES — dumps from "today" are all young,
 * so an age escape hatch would never prune.
 */
export const LOGS_RETAIN_COUNT = 2;

/** Fully-cleared trees (pure cache/scratch — safe to wipe contents entirely). */
const WIPE_TREES = [".tmp", ".pytest_cache", ".cursor/tmp"];
/** Single cache files removed outright. */
const WIPE_FILES = [".eslintcache"];
/**
 * Agents sometimes drop PR bodies and diff probes straight under `.cursor/`
 * instead of in `.cursor/tmp/`. `.gitignore` hides them from `git status`,
 * which also means nothing else ever sweeps them. Same loose "name contains
 * tmp" match as `.gitignore` — no legitimate `.cursor/` entry contains it.
 */
const STRAY_TREES = [{ rel: ".cursor", match: /tmp/i, own: new Set(["tmp"]) }];
/** Age-based trees: keep newest RETAIN_COUNT + anything younger than RETAIN_DAYS. */
export const AGE_TREES = [".env-backups"];
/** logs/ is count-capped (dirs) + loose-file wiped — see pruneLogs / planLogsTree. */
export const LOGS_TREE = "logs";
/**
 * Hard-capped trees: keep only the newest RETAIN_COUNT entries, age irrelevant.
 *
 * These are the gitignored `.cursor/` scratch surfaces (pattern `X/*` +
 * `!X/README.md` in .gitignore). They differ from AGE_TREES in one way that
 * matters: a busy day produces a dozen entries that are all minutes old, so the
 * age escape hatch would keep every one of them and the cap would never bite.
 * Their READMEs all say the contents may be cleared at any time — a handoff is
 * delivered, a kedja diff is superseded once the winner is merged — so recency
 * is the only signal worth keeping.
 *
 * The tracked-file guard still applies, so the committed README.md in each
 * directory is never a deletion candidate.
 *
 * Two neighbours are deliberately NOT capped:
 *
 *   - Loose files directly under `.cursor/swarms`. That is where `FINDINGS.md`
 *     lives — the curated, deduped list a distill agent maintains across runs,
 *     and the one artifact in these trees whose value grows rather than decays.
 *     Only `swarms/runs` (raw per-agent output) is capped.
 *
 *   - `.cursor/plans`. It is gitignored wholesale, so it holds no tracked file
 *     for the guard above to protect, and tracked source cites individual plans
 *     as its own rationale: `src/lib/gen/autofix/runtime-imports.ts` points at
 *     `3d-motion-stub-fix_1125d129.plan.md` "for the full repro", and
 *     `docs/plans/avklarat/repair-loop-hardening.md` names one as `parent_plan`.
 *     A recency cap would delete the only copy of a document the repo refers to.
 *     Migrate that rationale into the citing file first, then revisit.
 */
const COUNT_TREES = [
  ".cursor/handoffs",
  ".cursor/kedja",
  ".cursor/bugs",
  ".cursor/logg-internet/runs",
  ".cursor/swarms/runs",
];
/**
 * Names inside logs/ that have their OWN retention managed by observability
 * tooling (LRU caps, see .gitignore). We must not fight that tooling, so we
 * skip these subtrees entirely and only prune loose sibling artifacts + other
 * dump folders.
 */
export const AGE_SKIP_NAMES = new Set([
  "generationslogg",
  "site-observability",
  "llm-segmentts-and-index",
]);

/** Set of git-tracked paths (absolute, normalized) so we never delete them. */
function loadTrackedSet(root) {
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

/**
 * True when the path is a symlink or (on Windows) a junction. `readdirSync`
 * and `rmSync` follow such a link and operate on its TARGET, so wiping the
 * "contents" of a linked tree empties whatever it points at — the same trap
 * `scripts/cursor/worktree.mjs` exists to avoid for `node_modules`. We refuse
 * instead of unlinking: this script's job is emptying scratch, not managing
 * links someone else created on purpose.
 */
export function isLinkedPath(abs) {
  try {
    return fs.lstatSync(abs).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Pure retention plan for a logs/ tree's already-collected candidates.
 * Loose files are wiped (no reference value). Directories keep the newest
 * `retainCount`; AGE_SKIP_NAMES directories are always kept.
 *
 * @param {{ abs: string, name: string, mtime: number, isDirectory: boolean }[]} entries
 */
export function planLogsRetention(
  entries,
  { retainCount = LOGS_RETAIN_COUNT, skipNames = AGE_SKIP_NAMES } = {},
) {
  const keep = [];
  const remove = [];
  const dirs = [];

  for (const e of entries) {
    if (e.isDirectory && skipNames.has(e.name)) {
      keep.push(e.abs);
      continue;
    }
    if (!e.isDirectory) {
      remove.push({ abs: e.abs, label: "wipe-loose:logs" });
      continue;
    }
    dirs.push(e);
  }

  dirs.sort((a, b) => b.mtime - a.mtime);
  dirs.forEach((d, i) => {
    if (i < retainCount) {
      keep.push(d.abs);
    } else {
      remove.push({ abs: d.abs, label: "count-cap:logs" });
    }
  });

  return { keep, remove };
}

/**
 * Read a logs/ directory and decide what to keep/remove. Does not delete.
 * Tracked paths, links and tooling-managed subtrees follow the same guards
 * as the CLI path.
 *
 * @param {string} logsDir absolute path to a logs/ tree
 * @param {{ retainCount?: number, skipNames?: Set<string>, isTracked?: (abs: string) => boolean, containsTrackedFile?: (dir: string) => boolean }} [opts]
 */
export function planLogsTree(logsDir, opts = {}) {
  const retainCount = opts.retainCount ?? LOGS_RETAIN_COUNT;
  const skipNames = opts.skipNames ?? AGE_SKIP_NAMES;
  const isTracked = opts.isTracked ?? (() => false);
  const containsTrackedFile =
    opts.containsTrackedFile ??
    ((dir) => {
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
    });

  if (!fs.existsSync(logsDir)) {
    return { keep: [], remove: [], skipped: [] };
  }
  if (isLinkedPath(logsDir)) {
    return { keep: [], remove: [], skipped: [logsDir] };
  }

  let entries;
  try {
    entries = fs.readdirSync(logsDir, { withFileTypes: true });
  } catch {
    return { keep: [], remove: [], skipped: [] };
  }

  const skipped = [];
  const candidates = [];
  for (const e of entries) {
    const abs = path.join(logsDir, e.name);
    // Tooling-managed subtrees: never prune, never inspect for tracked files.
    if (e.isDirectory() && skipNames.has(e.name)) {
      candidates.push({ abs, name: e.name, mtime: 0, isDirectory: true });
      continue;
    }
    if (isLinkedPath(abs)) {
      skipped.push(abs);
      continue;
    }
    if (e.isDirectory() ? containsTrackedFile(abs) : isTracked(abs)) {
      skipped.push(abs);
      continue;
    }
    let mtime = 0;
    try {
      mtime = fs.statSync(abs).mtimeMs;
    } catch {
      continue;
    }
    candidates.push({
      abs,
      name: e.name,
      mtime,
      isDirectory: e.isDirectory(),
    });
  }

  const plan = planLogsRetention(candidates, { retainCount, skipNames });
  return { ...plan, skipped };
}

function createCleaner(root, apply) {
  const tracked = loadTrackedSet(root);
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
    if (isLinkedPath(dir)) {
      skippedTracked.push(dir);
      console.warn(
        `[clean-scratch] ${path.relative(root, dir)} is a link — skipped. ` +
          "Emptying it would empty the link target, not the scratch tree.",
      );
      return;
    }
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

  /** Remove untracked direct children of `rel` whose name matches `match`. */
  function wipeStray({ rel, match, own }) {
    const dir = path.join(root, rel);
    if (!fs.existsSync(dir)) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!match.test(e.name) || own.has(e.name)) continue; // `own` is WIPE_TREES' job
      const abs = path.join(dir, e.name);
      if (e.isDirectory() ? containsTrackedFile(abs) : isTracked(abs)) {
        skippedTracked.push(abs);
        continue;
      }
      removeEntry(abs, `stray:${rel}`);
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

  /**
   * Direct children of `dir` that are safe to consider for deletion, newest
   * first. Tracked paths, links and tooling-managed subtrees are filtered out
   * here (and recorded), so callers only decide *how many* to keep.
   */
  function collectPruneCandidates(dir, { skipNames } = {}) {
    if (isLinkedPath(dir)) {
      skippedTracked.push(dir);
      console.warn(
        `[clean-scratch] ${path.relative(root, dir)} is a link — skipped. ` +
          "Pruning it would prune the link target, not the scratch tree.",
      );
      return [];
    }
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const candidates = [];
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      // Leave tooling-managed subtrees (their own LRU retention) untouched.
      if (e.isDirectory() && skipNames?.has(e.name)) {
        kept.push(abs);
        continue;
      }
      // A junction/symlink child is somebody else's tree. `containsTrackedFile`
      // and `rmSync` both operate on the TARGET, so pruning one by recency would
      // silently prune whatever it points at — the trap `wipeTree` already
      // guards against and `scripts/cursor/worktree.mjs` exists to avoid.
      if (isLinkedPath(abs)) {
        skippedTracked.push(abs);
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
    return candidates.sort((a, b) => b.mtime - a.mtime);
  }

  /** Age-based prune: keep newest RETAIN_COUNT + anything younger than RETAIN_DAYS. */
  function pruneByAge(rel) {
    const dir = path.join(root, rel);
    if (!fs.existsSync(dir)) return;
    const now = Date.now();
    const candidates = collectPruneCandidates(dir);
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

  /**
   * Hard count cap: keep the newest RETAIN_COUNT entries, delete the rest no
   * matter how young they are. No age escape hatch — that is the whole point,
   * see COUNT_TREES.
   */
  function pruneByCount(rel) {
    const dir = path.join(root, rel);
    if (!fs.existsSync(dir)) return;
    const candidates = collectPruneCandidates(dir);
    candidates.forEach((c, i) => {
      if (i < RETAIN_COUNT) {
        kept.push(c.abs);
      } else {
        removeEntry(c.abs, `count-cap:${rel}`);
      }
    });
  }

  /**
   * logs/: hard-cap dump folders at LOGS_RETAIN_COUNT, wipe loose files, leave
   * AGE_SKIP_NAMES tooling trees alone.
   */
  function pruneLogs(rel = LOGS_TREE) {
    const dir = path.join(root, rel);
    const plan = planLogsTree(dir, {
      retainCount: LOGS_RETAIN_COUNT,
      skipNames: AGE_SKIP_NAMES,
      isTracked,
      containsTrackedFile,
    });
    for (const abs of plan.skipped) skippedTracked.push(abs);
    for (const abs of plan.keep) kept.push(abs);
    for (const r of plan.remove) removeEntry(r.abs, r.label);
  }

  function run() {
    for (const t of WIPE_TREES) wipeTree(t);
    for (const s of STRAY_TREES) wipeStray(s);
    for (const f of WIPE_FILES) wipeFile(f);
    for (const t of AGE_TREES) pruneByAge(t);
    pruneLogs();
    for (const t of COUNT_TREES) pruneByCount(t);

    const rel = (p) => path.relative(root, p);
    const tag = apply ? "[clean-scratch] removed" : "[clean-scratch] would remove";
    for (const r of removed) console.log(`${tag} (${r.label}): ${rel(r.abs)}`);
    if (skippedTracked.length > 0) {
      console.log(`[clean-scratch] kept ${skippedTracked.length} tracked/guarded path(s).`);
    }
    console.log(
      `[clean-scratch] done${apply ? "" : " (dry-run)"} — ` +
        `${removed.length} item(s) ${apply ? "removed" : "would be removed"}, ` +
        `${kept.length} kept by retention ` +
        `(logs dirs ≤${LOGS_RETAIN_COUNT}; cursor/age newest ${RETAIN_COUNT}` +
        `, plus <${RETAIN_DAYS}d in age-based trees).` +
        (apply ? "" : " Re-run with --apply to delete."),
    );

    return { removed, kept, skippedTracked };
  }

  return { run };
}

/** CLI / programmatic entry. Exported for tests that need the full runner. */
export function runCleanScratch({ root = DEFAULT_ROOT, apply = false } = {}) {
  return createCleaner(root, apply).run();
}

// Kör bara som CLI, inte när testet importerar de rena funktionerna.
if (process.argv[1] && process.argv[1].endsWith("clean-scratch.mjs")) {
  runCleanScratch({ apply: process.argv.includes("--apply") });
}
