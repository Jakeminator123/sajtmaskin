#!/usr/bin/env node
/**
 * scripts/cursor/kedja-clean.mjs
 *
 * Tears down leftovers from `/kedja` runs: candidate worktrees named
 * `sajtmaskin-kedja-*` and their `kedja/*` branches.
 *
 * Why this exists: `/kedja` never commits — the whole value of a candidate is
 * its UNCOMMITTED diff. Deleting such a worktree is therefore always
 * destructive, which is why the pipeline saves each diff before teardown and
 * why an interrupted run leaves worktrees behind. This script makes the safe
 * order the default: save the diff first, remove second, and refuse to touch
 * anything it could not measure.
 *
 * Guard rails:
 *   - dry run unless `--yes`
 *   - never the main checkout (also enforced by worktree.mjs)
 *   - never a branch that has commits master does not have
 *   - never a worktree whose state could not be read — an unreadable worktree
 *     is usually a LIVE one (a run in progress), which is exactly the case
 *     where deleting would destroy work
 *   - branch-to-worktree mapping comes from `git worktree list --porcelain`,
 *     not from running git inside each worktree, so a busy worktree can never
 *     make its own branch look orphaned
 *   - removal goes through worktree.mjs, never raw `git worktree remove`
 *
 * Usage:
 *   node scripts/cursor/kedja-clean.mjs
 *   node scripts/cursor/kedja-clean.mjs --yes
 *   node scripts/cursor/kedja-clean.mjs --yes --keep ..\sajtmaskin-kedja-slug-a
 *
 * npm: `npm run kedja:clean` · `npm run kedja:clean -- --yes`
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKTREE_PREFIX = "sajtmaskin-kedja-";
const BRANCH_PREFIX = "kedja/";

function gitQuiet(args, options = {}) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Compare paths. Relative input is resolved against the repo root, not the
 * process cwd — `git worktree list` yields absolute paths, so a `--keep` given
 * as `..\sajtmaskin-kedja-x-a` must mean the same thing no matter which
 * directory the script was invoked from. Resolving against cwd made `--keep`
 * silently miss and delete the worktree it was meant to protect.
 */
function samePath(a, b) {
  const norm = (p) => resolve(REPO_ROOT, p).replace(/[\\/]+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

/**
 * Parse `git worktree list --porcelain`. The FIRST entry is always the main
 * checkout. Reading the branch from here rather than from inside each
 * worktree matters: a worktree that is mid-run can fail every git call made
 * within it, and the fallback must not be "assume its branch is unused".
 */
export function parseWorktreePorcelain(porcelain) {
  const entries = [];
  let current = null;
  for (const line of porcelain.split(/\r?\n/)) {
    const trimmed = line.trim();
    const path = /^worktree (.+)$/.exec(trimmed)?.[1];
    if (path) {
      current = { path, branch: null, isMain: entries.length === 0 };
      entries.push(current);
      continue;
    }
    const branch = /^branch refs\/heads\/(.+)$/.exec(trimmed)?.[1];
    if (branch && current) current.branch = branch;
  }
  return entries;
}

/** `master` locally, `origin/master` when the local ref is missing. */
function trunkRef() {
  if (gitQuiet(["rev-parse", "--verify", "master"], { cwd: REPO_ROOT })) return "master";
  if (gitQuiet(["rev-parse", "--verify", "origin/master"], { cwd: REPO_ROOT })) return "origin/master";
  return null;
}

function inspect(worktree, trunk) {
  const status = gitQuiet(["status", "--porcelain"], { cwd: worktree.path });
  const ahead = trunk ? gitQuiet(["rev-list", "--count", `${trunk}..HEAD`], { cwd: worktree.path }) : null;
  return {
    path: worktree.path,
    name: basename(worktree.path),
    branch: worktree.branch,
    // `null` means the probe failed, which is NOT the same as "clean" or
    // "zero commits ahead". Both are treated as "do not touch".
    dirty: status === null ? null : status.length > 0,
    commitsAhead: ahead === null ? null : Number.parseInt(ahead, 10),
  };
}

/**
 * Full diff against HEAD, covering staged, unstaged and new files alike.
 *
 * Two traps this avoids. Plain `git diff` misses untracked files, and a
 * `/kedja` candidate's new test file is usually untracked — hence `add -A -N`,
 * which records intent-to-add without really staging anything. And plain
 * `git diff` also misses changes that are already *staged*, so a worktree dirty
 * in both ways would have been backed up partially and then removed, losing the
 * staged half for good. Diffing against `HEAD` covers every case.
 */
function captureDiff(worktreePath) {
  gitQuiet(["add", "-A", "-N"], { cwd: worktreePath });
  // NOT gitQuiet: its `.trim()` strips trailing blank context lines, which are
  // significant in a patch — `git apply` then rejects the file as corrupt.
  // That silently corrupted two rescue diffs on 2026-08-04.
  try {
    return execFileSync("git", ["diff", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      cwd: worktreePath,
      maxBuffer: 128 * 1024 * 1024,
    });
  } catch {
    return "";
  }
}

function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}

function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--yes");
  const keep = argv.flatMap((arg, i) => (arg === "--keep" && argv[i + 1] ? [argv[i + 1]] : []));

  const porcelain = gitQuiet(["worktree", "list", "--porcelain"], { cwd: REPO_ROOT });
  if (porcelain === null) {
    console.error("[kedja:clean] Kunde inte läsa `git worktree list`. Avbryter utan att röra något.");
    process.exitCode = 1;
    return;
  }

  const worktrees = parseWorktreePorcelain(porcelain);
  const liveBranches = new Set(worktrees.map((w) => w.branch).filter(Boolean));
  const trunk = trunkRef();
  const candidates = worktrees.filter(
    (w) => !w.isMain && basename(w.path).startsWith(WORKTREE_PREFIX),
  );

  const outDir = join(REPO_ROOT, ".cursor", "kedja", timestamp());
  let removed = 0;

  for (const worktree of candidates) {
    const info = inspect(worktree, trunk);

    if (keep.some((k) => samePath(k, worktree.path))) {
      console.log(`[behåll] ${info.name} — utpekad med --keep`);
      continue;
    }
    if (info.dirty === null || info.commitsAhead === null) {
      console.log(
        `[behåll] ${info.name} — kunde inte läsa dess tillstånd (körs den just nu?), rör den inte`,
      );
      continue;
    }
    if (info.commitsAhead > 0) {
      console.log(
        `[behåll] ${info.name} — har ${info.commitsAhead} commit(s) som ${trunk} saknar, städa för hand`,
      );
      continue;
    }

    if (!apply) {
      const work = info.dirty ? "ocommittade ändringar sparas som diff" : "inget arbete kvar";
      console.log(`[skulle ta bort] ${info.name} (${info.branch ?? "detached"}) — ${work}`);
      continue;
    }

    if (info.dirty) {
      const diff = captureDiff(worktree.path);
      if (!diff.trim()) {
        console.log(`[behåll] ${info.name} — rapporterade ändringar men gav tom diff, rör den inte`);
        continue;
      }
      mkdirSync(outDir, { recursive: true });
      const target = join(outDir, `${info.name}.diff`);
      writeFileSync(target, diff, "utf8");
      console.log(`[sparad]  ${target}`);
    }

    try {
      execFileSync(
        process.execPath,
        [join(REPO_ROOT, "scripts", "cursor", "worktree.mjs"), "remove", worktree.path, "--force"],
        { cwd: REPO_ROOT, stdio: "inherit" },
      );
    } catch {
      console.log(`[fel]     ${info.name} — worktree.mjs kunde inte ta bort den, branchen lämnas kvar`);
      // Signalera partiellt fel: en misslyckad borttagning får inte se ut som en
      // ren körning för en anropare (npm/CI) som bara läser exit-koden.
      process.exitCode = 1;
      continue;
    }

    removed += 1;
    liveBranches.delete(info.branch);
    if (info.branch?.startsWith(BRANCH_PREFIX)) {
      const deleted = gitQuiet(["branch", "-D", info.branch], { cwd: REPO_ROOT });
      console.log(
        deleted === null
          ? `[kvar]    branch ${info.branch} — kunde inte raderas`
          : `[borta]   branch ${info.branch}`,
      );
    }
  }

  // Branches whose worktree is already gone — an earlier teardown removed the
  // directory but left the ref behind. `liveBranches` comes from the porcelain
  // listing, so a busy worktree can never land here.
  const branchList = gitQuiet(
    ["branch", "--list", `${BRANCH_PREFIX}*`, "--format=%(refname:short)"],
    { cwd: REPO_ROOT },
  );
  const orphans = (branchList ?? "")
    .split(/\r?\n/)
    .map((b) => b.trim())
    .filter((b) => b && !liveBranches.has(b));

  for (const branch of orphans) {
    const ahead = trunk ? gitQuiet(["rev-list", "--count", `${trunk}..${branch}`], { cwd: REPO_ROOT }) : null;
    if (ahead === null || Number.parseInt(ahead, 10) > 0) {
      console.log(`[behåll] branch ${branch} — har egna commits eller kunde inte jämföras`);
      continue;
    }
    if (!apply) {
      console.log(`[skulle ta bort] branch ${branch} — ingen worktree, inga egna commits`);
      continue;
    }
    const deleted = gitQuiet(["branch", "-D", branch], { cwd: REPO_ROOT });
    console.log(
      deleted === null
        ? `[kvar]    branch ${branch} — kunde inte raderas`
        : `[borta]   branch ${branch}`,
    );
  }

  if (candidates.length === 0 && orphans.length === 0) {
    console.log("[kedja:clean] Inga kedja-worktrees eller -branchar kvar. Inget att göra.");
    return;
  }
  if (!apply) {
    console.log("\n[kedja:clean] Torrkörning. Kör om med `--yes` för att utföra.");
  } else if (removed > 0) {
    console.log(`\n[kedja:clean] ${removed} worktree(s) borta. Sparade diffar: ${outDir}`);
  }
}

main();
