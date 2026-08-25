#!/usr/bin/env node
/**
 * scripts/cursor/worktree.mjs
 *
 * Safe create/remove for agent worktrees that share `node_modules` with the
 * main checkout via a Windows junction.
 *
 * Why this exists: a fresh worktree has no `node_modules`, and `npm ci` costs
 * minutes, so the fast path is a junction to the main checkout's copy. But
 * `git worktree remove --force` deletes the worktree directory recursively and
 * **follows the junction**, emptying the link's target — the main checkout's
 * real `node_modules`. The failure surfaces much later, somewhere unrelated, as
 * `ERR_MODULE_NOT_FOUND: Cannot find package 'dotenv'`, which reads like a
 * broken repo rather than a cleanup that went wrong. It happened 2026-07-27.
 *
 * The ordering that avoids it — unlink first, then remove the worktree — is
 * easy to get wrong by hand and impossible to notice when you do. This script
 * makes the safe order the default.
 *
 * Usage:
 *   node scripts/cursor/worktree.mjs setup  ../sajtmaskin-feat-x
 *   node scripts/cursor/worktree.mjs link   ../sajtmaskin-feat-x
 *   node scripts/cursor/worktree.mjs remove ../sajtmaskin-feat-x [--force]
 *
 * npm: `npm run worktree:setup -- <path>` · `npm run worktree:link -- <path>` ·
 * `npm run worktree:remove -- <path>`
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_REF, isExactMergedPr, isProtectedBranch, loadPrLifecycle } from "../dev/tidy.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Parse `git worktree list --porcelain`. The FIRST entry is always the main
 * worktree — that is the one we must never hand to a recursive delete.
 *
 * @param {string} porcelain
 * @returns {{ path: string, isMain: boolean }[]}
 */
export function parseWorktreeList(porcelain) {
  const paths = [];
  for (const line of porcelain.split(/\r?\n/)) {
    const match = /^worktree (.+)$/.exec(line.trim());
    if (match?.[1]) paths.push(match[1]);
  }
  return paths.map((path, index) => ({ path, isMain: index === 0 }));
}

/**
 * Resolve `targetPath` to a registered secondary worktree, comparing resolved
 * paths so `..\name`, a trailing slash and a different drive-letter case all
 * match. Refuses the main checkout — it is shared with the user.
 *
 * @param {{ targetPath: string, worktrees: { path: string, isMain: boolean }[], protectedWorktreePaths?: string[] }} input
 * @returns {{ ok: true, worktreePath: string } | { ok: false, reason: string }}
 */
export function resolveTargetWorktree({ targetPath, worktrees, protectedWorktreePaths = [] }) {
  const wanted = normalizePath(targetPath);
  const match = worktrees.find((w) => normalizePath(w.path) === wanted);

  if (!match) {
    return {
      ok: false,
      reason: `${targetPath} is not a registered git worktree. Run \`git worktree list\` and pass one of those paths.`,
    };
  }
  if (match.isMain) {
    return {
      ok: false,
      reason: `${targetPath} is the MAIN checkout, not a worktree. Refusing — removing it would delete the shared working tree.`,
    };
  }
  if (protectedWorktreePaths.some((path) => normalizePath(path) === wanted)) {
    return {
      ok: false,
      reason: `${targetPath} is a protected permanent/current worktree. Refusing removal.`,
    };
  }
  return { ok: true, worktreePath: match.path };
}

export function classifyRemovalLifecycle({
  branch,
  headSha,
  isDirty,
  force,
  discardReason = "",
  lifecycle,
  mergedIntoBase,
}) {
  if (typeof branch === "string" && isProtectedBranch(branch)) {
    return { ok: false, reason: "skyddat branchnamn får aldrig tas bort" };
  }
  if (!lifecycle) return { ok: false, reason: "GitHub PR-livscykeln kunde inte verifieras" };
  if (lifecycle.openHeads.has(branch)) {
    return { ok: false, reason: "branchen äger en öppen PR" };
  }
  if (force) {
    if (discardReason.trim().length < 20) {
      return {
        ok: false,
        reason: "--force kräver SAJTMASKIN_DISCARD_REASON med ett tydligt beslut",
      };
    }
    return { ok: true, reason: "explicit discard utan öppen PR" };
  }
  if (isDirty) return { ok: false, reason: "worktreet är smutsigt" };
  if (!mergedIntoBase && !isExactMergedPr(lifecycle, branch, headSha)) {
    return { ok: false, reason: "ingen exakt Git-/squash-merge bevisad" };
  }
  return { ok: true, reason: "FRI: ingen öppen PR, rent och exakt mergat" };
}

/**
 * Protect both the checkout running this script and the repo-conventional
 * permanent Codex checkout next to the main checkout.
 *
 * @param {{ path: string, isMain: boolean }[]} worktrees
 * @param {string} [currentWorktreePath]
 * @param {string[]} [configuredPaths]
 * @returns {string[]}
 */
export function protectedRemovalPaths(
  worktrees,
  currentWorktreePath = REPO_ROOT,
  configuredPaths = [],
) {
  const mainWorktree = findMainWorktree(worktrees);
  return [
    currentWorktreePath,
    ...(mainWorktree ? [`${mainWorktree}-codex`] : []),
    ...configuredPaths,
  ];
}

function normalizePath(p) {
  return resolve(p)
    .replace(/[\\/]+$/, "")
    .toLowerCase();
}

/**
 * The main checkout, whose `node_modules` is the only sane link source.
 *
 * Derived from git rather than from this file's location on purpose: an agent
 * working inside a worktree runs that worktree's copy of this script, so a
 * path-relative repo root would resolve to the worktree itself and link
 * `node_modules` to its own missing directory.
 *
 * @param {{ path: string, isMain: boolean }[]} worktrees
 * @returns {string | null}
 */
export function findMainWorktree(worktrees) {
  return worktrees.find((w) => w.isMain)?.path ?? null;
}

/**
 * A directory named `node_modules` is where the scan STOPS, never where it
 * continues. It is still checked for being a link — that is the whole point —
 * but it is never entered, so the ~765-package tree this mechanism exists to
 * avoid copying is also never walked. `.git` is excluded for the same reason.
 */
const LINK_SCAN_LEAF_DIRS = new Set(["node_modules", ".git"]);

/**
 * Belt-and-braces bound on repo layout, not a performance measure — the leaf
 * rule above is what keeps the walk cheap. Depth 2 covers
 * `<sub-project>/node_modules`; the extra level is headroom.
 */
const LINK_SCAN_MAX_DEPTH = 3;

/**
 * Every link inside the worktree that must be detached before
 * `git worktree remove` runs.
 *
 * The scan used to stop at depth 1, reasoning that the only junction anyone
 * creates is `node_modules` at the root. That stopped being true once
 * sub-projects needed their own linked `node_modules` (see
 * {@link NESTED_NODE_MODULES}). On 2026-08-01 a hand-made
 * `preview-host/node_modules` junction was invisible here: detaching skipped
 * it, and `git worktree remove` then followed it into the main checkout and
 * emptied the real directory — the exact failure the depth-1 scan was written
 * to prevent, one level down.
 *
 * Nested links are now created by {@link commandLink} rather than by hand, and
 * found here, so the two halves stay in step.
 *
 * @param {string} worktreePath
 * @param {{ readdir?: (p: string) => string[], lstat?: (p: string) => { isSymbolicLink: () => boolean, isDirectory?: () => boolean } }} [io]
 * @returns {string[]} absolute paths
 */
export function findLinkedEntries(worktreePath, io = {}) {
  const readdir = io.readdir ?? ((p) => readdirSync(p));
  const lstat = io.lstat ?? ((p) => lstatSync(p));

  const linked = [];

  const walk = (dir, depth) => {
    let entries;
    try {
      entries = readdir(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = join(dir, entry);
      let stats;
      try {
        stats = lstat(full);
      } catch {
        // A racing delete is not our problem — it is already gone.
        continue;
      }
      // Order matters: a junction reports as a link, so a LINKED node_modules
      // is collected here and never reaches the leaf rule below.
      if (stats.isSymbolicLink()) {
        linked.push(full);
        continue;
      }
      if (depth < LINK_SCAN_MAX_DEPTH && !LINK_SCAN_LEAF_DIRS.has(entry) && stats.isDirectory?.()) {
        walk(full, depth + 1);
      }
    }
  };

  walk(worktreePath, 1);
  return linked;
}

/**
 * Entries that make `git worktree remove` refuse without `--force`.
 *
 * Checked BEFORE any link is detached: a wrapper must never be less safe than
 * the command it wraps. Detaching first would discard an untracked root-level
 * link that raw git would have preserved by refusing the whole removal.
 *
 * @param {string} porcelainStatus output of `git status --porcelain`
 * @returns {string[]} human-readable entries, empty when the worktree is clean
 */
export function parseDirtyEntries(porcelainStatus) {
  return porcelainStatus
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Message for a `git worktree remove` that failed AFTER the links were already
 * detached.
 *
 * The raw failure reads like the junction trap this script exists to prevent —
 * a stacktrace right after "unlinked … (target untouched)" looks like the
 * shared `node_modules` just got emptied. It did not: detaching happened first
 * and succeeded, which is the whole point of the ordering. Say so before
 * anything else, then say what actually failed and how to finish by hand.
 *
 * Observed twice on 2026-07-29 and again 2026-07-30: git reports
 * `Permission denied` from a lingering file handle (a watcher or a just-ended
 * test run still holding the directory) while the git metadata is ALREADY
 * gone, so the worktree vanishes from `git worktree list` and an empty folder
 * stays on disk.
 *
 * @param {{ worktreePath: string, detachedLinks: string[], stillRegistered: boolean, message: string }} input
 * @returns {string}
 */
export function describeRemovalFailure({ worktreePath, detachedLinks, stillRegistered, message }) {
  const lines = [];
  if (detachedLinks.length > 0) {
    lines.push(
      `[worktree] The shared node_modules is SAFE: ${detachedLinks.length} link(s) were ` +
        "detached before the removal was attempted, and detaching never follows a junction.",
    );
  }
  lines.push(`[worktree] What failed is the directory removal itself: ${message.trim()}`);
  lines.push(
    "[worktree] Most likely a lingering file handle (a watcher or a just-finished test run) " +
      "is still holding the directory.",
  );
  if (stillRegistered) {
    lines.push(
      `[worktree] git still lists ${worktreePath} as a worktree, so nothing is half-removed. ` +
        "Close whatever holds it and rerun this command.",
    );
  } else {
    lines.push(
      `[worktree] git no longer lists ${worktreePath}, so only the folder is left over. ` +
        "Finish by hand:\n" +
        "  git worktree prune\n" +
        `  Remove-Item -LiteralPath "${worktreePath}" -Recurse -Force   # pwsh\n` +
        `  rm -rf "${worktreePath}"                                      # bash`,
    );
  }
  return lines.join("\n");
}

/**
 * Remove a link without following it. Junctions are directories; file symlinks are not.
 *
 * On Windows, `rmdirSync` can report ENOENT for a file symlink even though
 * `lstatSync` just found it. Falling back to `unlinkSync` on ENOENT is safe:
 * unlink removes the link itself, never its target. If the entry raced away,
 * unlink returns ENOENT and the desired end state is already true.
 *
 * @param {string} linkPath
 * @param {{ rmdir?: (p: string) => void, unlink?: (p: string) => void }} [io]
 */
export function removeLink(linkPath, io = {}) {
  const rmdir = io.rmdir ?? rmdirSync;
  const unlink = io.unlink ?? unlinkSync;
  try {
    rmdir(linkPath);
  } catch (err) {
    if (err.code === "ENOTDIR" || err.code === "EPERM" || err.code === "ENOENT") {
      try {
        unlink(linkPath);
      } catch (unlinkError) {
        if (unlinkError.code === "ENOENT") return;
        throw unlinkError;
      }
      return;
    }
    throw err;
  }
}

function git(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

/** Block the (fully synchronous) script briefly without pulling in a dependency. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function listWorktrees() {
  return parseWorktreeList(git(["worktree", "list", "--porcelain"]));
}

function configuredProtectedWorktreePaths() {
  try {
    return git(["config", "--get-all", "sajtmaskin.protectedWorktree"])
      .split(/\r?\n/u)
      .map((path) => path.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Sub-projects that carry their own `node_modules` and therefore get their own
 * junction alongside the root one.
 *
 * `preview-host` has a separate dependency set, so
 * `npm --prefix preview-host run test:guards` dies with MODULE_NOT_FOUND in a
 * fresh worktree unless this is linked too. It used to be created by hand with
 * `mklink /J` — which is precisely how the 2026-08-01 incident happened, since
 * a hand-made link is one the remove path never knew to detach. Creating it
 * here is what makes {@link findLinkedEntries} sufficient rather than merely
 * broader.
 */
const NESTED_NODE_MODULES = ["preview-host"];

/** `true` when the path exists, without following it. */
function pathExists(candidate) {
  try {
    lstatSync(candidate);
    return true;
  } catch {
    return false;
  }
}

/**
 * Only a link to the main checkout's node_modules is a valid shared install.
 * A real directory or a link to somewhere else is leftover / isolated, not setup.
 *
 * @param {string} linkPath
 * @param {string} expectedSource
 * @param {{ lstat?: (p: string) => { isSymbolicLink: () => boolean }, readlink?: (p: string) => string }} [io]
 * @returns {{ ok: true, reason: string } | { ok: false, reason: string }}
 */
export function classifyExistingNodeModules(linkPath, expectedSource, io = {}) {
  const lstat = io.lstat ?? lstatSync;
  const readlink = io.readlink ?? readlinkSync;
  let stats;
  try {
    stats = lstat(linkPath);
  } catch {
    return { ok: false, reason: "node_modules saknas" };
  }
  if (!stats.isSymbolicLink()) {
    return {
      ok: false,
      reason: `${linkPath} is a real install, not a link to the main checkout`,
    };
  }
  const raw = readlink(linkPath);
  const resolved = normalizePath(resolve(dirname(linkPath), raw));
  if (resolved !== normalizePath(expectedSource) && normalizePath(raw) !== normalizePath(expectedSource)) {
    return {
      ok: false,
      reason: `${linkPath} points at ${raw}, not ${expectedSource}`,
    };
  }
  return { ok: true, reason: "expected junction" };
}

/**
 * Paths listed in `.worktreeinclude`, minus comments and blanks.
 *
 * @param {string} contents
 * @returns {string[]}
 */
export function parseWorktreeIncludeList(contents) {
  return String(contents ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/**
 * Copy gitignored files from the main checkout into a fresh worktree.
 * Missing sources are skipped — a brand-new clone may not have `.env.local`.
 *
 * @param {string} mainWorktree
 * @param {string} worktreePath
 * @param {string[]} listed
 * @param {{ exists?: (p: string) => boolean, copyFile?: (from: string, to: string) => void, mkdir?: (p: string, opts: { recursive: boolean }) => void }} [io]
 * @returns {{ copied: string[], skipped: string[] }}
 */
export function copyWorktreeIncludeFiles(mainWorktree, worktreePath, listed, io = {}) {
  const exists = io.exists ?? pathExists;
  const copyFile = io.copyFile ?? copyFileSync;
  const mkdir = io.mkdir ?? mkdirSync;
  const copied = [];
  const skipped = [];
  for (const rel of listed) {
    const source = join(mainWorktree, rel);
    const dest = join(worktreePath, rel);
    if (!exists(source)) {
      skipped.push(rel);
      continue;
    }
    mkdir(dirname(dest), { recursive: true });
    copyFile(source, dest);
    copied.push(rel);
  }
  return { copied, skipped };
}

/**
 * Gitignored `.cursor/mcp.json` does not appear in a fresh worktree.
 * Prefer the main checkout's live file so local OAuth-less URL lists stay
 * in one place; fall back to the tracked example.
 *
 * @param {string} mainWorktree
 * @param {string} worktreePath
 * @param {{ exists?: (p: string) => boolean, copyFile?: (from: string, to: string) => void, mkdir?: (p: string, opts: { recursive: boolean }) => void }} [io]
 * @returns {{ ok: true, dest: string, source: string } | { ok: false, reason: string }}
 */
export function syncWorktreeMcpJson(mainWorktree, worktreePath, io = {}) {
  const exists = io.exists ?? pathExists;
  const copyFile = io.copyFile ?? copyFileSync;
  const mkdir = io.mkdir ?? mkdirSync;
  const live = join(mainWorktree, ".cursor", "mcp.json");
  const example = join(mainWorktree, ".cursor", "mcp.json.example");
  const source = exists(live) ? live : example;
  if (!exists(source)) {
    return { ok: false, reason: "no .cursor/mcp.json or mcp.json.example in the main checkout" };
  }
  const destDir = join(worktreePath, ".cursor");
  const dest = join(destDir, "mcp.json");
  mkdir(destDir, { recursive: true });
  copyFile(source, dest);
  return { ok: true, dest, source };
}

function resolveSecondaryWorktree(targetPath) {
  const worktrees = listWorktrees();
  const plan = resolveTargetWorktree({ targetPath, worktrees });
  if (!plan.ok) {
    console.error(`[worktree] ${plan.reason}`);
    process.exit(1);
  }
  const mainWorktree = findMainWorktree(worktrees);
  if (!mainWorktree) {
    console.error("[worktree] Could not determine the main checkout from `git worktree list`.");
    process.exit(1);
  }
  return { worktreePath: plan.worktreePath, mainWorktree };
}

function linkNodeModules(worktreePath, mainWorktree, { skipExisting }) {
  const linkPath = join(worktreePath, "node_modules");
  const source = join(mainWorktree, "node_modules");

  if (pathExists(linkPath)) {
    if (skipExisting) {
      const existing = classifyExistingNodeModules(linkPath, source);
      if (!existing.ok) {
        console.error(`[worktree] ${existing.reason}. Remove it first if you want to relink.`);
        process.exit(1);
      }
      console.log(`[worktree] skipped ${linkPath} — ${existing.reason}.`);
    } else {
      console.error(
        `[worktree] ${linkPath} already exists. Remove it first if you want to relink.`,
      );
      process.exit(1);
    }
  } else {
    symlinkSync(source, linkPath, "junction");
    console.log(`[worktree] linked ${linkPath} -> ${source}`);
  }

  // Best-effort by design: a missing sub-project or an already-present correct
  // link is not a reason to fail a link that otherwise succeeded. A wrong
  // nested install is still a recorded link — refuse it the same way.
  for (const project of NESTED_NODE_MODULES) {
    const nestedLink = join(worktreePath, project, "node_modules");
    const nestedSource = join(mainWorktree, project, "node_modules");
    if (pathExists(nestedLink)) {
      if (skipExisting) {
        const existing = classifyExistingNodeModules(nestedLink, nestedSource);
        if (!existing.ok) {
          console.error(`[worktree] ${existing.reason}. Remove it first if you want to relink.`);
          process.exit(1);
        }
      }
      console.log(`[worktree] skipped ${nestedLink} — already exists.`);
      continue;
    }
    if (!pathExists(nestedSource)) {
      console.log(`[worktree] skipped ${project}/node_modules — ${nestedSource} does not exist.`);
      continue;
    }
    symlinkSync(nestedSource, nestedLink, "junction");
    console.log(`[worktree] linked ${nestedLink} -> ${nestedSource}`);
  }
}

function syncMcpAndWarn(mainWorktree, worktreePath) {
  const mcp = syncWorktreeMcpJson(mainWorktree, worktreePath);
  if (mcp.ok) {
    console.log(`[worktree] synced ${mcp.dest}`);
  } else {
    console.log(`[worktree] skipped mcp.json — ${mcp.reason}`);
  }

  console.log(
    "[worktree] IMPORTANT: tear this worktree down with `npm run worktree:remove -- <path>`, " +
      "never a bare `git worktree remove` — that follows the junction and empties the shared node_modules.",
  );
}

function commandLink(targetPath) {
  const { worktreePath, mainWorktree } = resolveSecondaryWorktree(targetPath);
  linkNodeModules(worktreePath, mainWorktree, { skipExisting: false });
  syncMcpAndWarn(mainWorktree, worktreePath);
}

function commandSetup(targetPath) {
  const { worktreePath, mainWorktree } = resolveSecondaryWorktree(targetPath);
  const includeFile = join(mainWorktree, ".worktreeinclude");
  const listed = pathExists(includeFile)
    ? parseWorktreeIncludeList(readFileSync(includeFile, "utf8"))
    : [];
  const copied = copyWorktreeIncludeFiles(mainWorktree, worktreePath, listed);
  for (const rel of copied.copied) {
    console.log(`[worktree] copied ${rel}`);
  }
  for (const rel of copied.skipped) {
    console.log(`[worktree] skipped ${rel} — missing in main checkout`);
  }
  linkNodeModules(worktreePath, mainWorktree, { skipExisting: true });
  syncMcpAndWarn(mainWorktree, worktreePath);
}

function commandRemove(targetPath, { force }) {
  const worktrees = listWorktrees();
  const plan = resolveTargetWorktree({
    targetPath,
    worktrees,
    protectedWorktreePaths: protectedRemovalPaths(
      worktrees,
      REPO_ROOT,
      configuredProtectedWorktreePaths(),
    ),
  });
  if (!plan.ok) {
    console.error(`[worktree] ${plan.reason}`);
    process.exit(1);
  }

  const branch = git(["-C", plan.worktreePath, "rev-parse", "--abbrev-ref", "HEAD"]).trim();
  if (branch === "codex/workspace") {
    console.error(
      `[worktree] ${plan.worktreePath} is the permanent Codex checkout (${branch}). Refusing removal.`,
    );
    process.exit(1);
  }

  const headSha = git(["-C", plan.worktreePath, "rev-parse", "HEAD"]).trim();
  let lifecycle = loadPrLifecycle(REPO_ROOT);
  // Connector-baserade merge-stewards kan sakna gh lokalt. De får överlämna
  // ett exakt, terminalt MERGED-bevis; alla tre fält måste matcha live target.
  if (
    !lifecycle &&
    process.env.SAJTMASKIN_TERMINAL_PR_STATE === "MERGED" &&
    process.env.SAJTMASKIN_TERMINAL_PR_BRANCH === branch &&
    process.env.SAJTMASKIN_TERMINAL_PR_HEAD_SHA?.toLowerCase() === headSha.toLowerCase()
  ) {
    lifecycle = {
      openHeads: new Set(),
      mergedHeads: new Map([[branch, new Set([headSha.toLowerCase()])]]),
    };
  }

  const dirty = parseDirtyEntries(git(["-C", plan.worktreePath, "status", "--porcelain"]));
  const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", headSha, BASE_REF], {
    cwd: REPO_ROOT,
    stdio: "ignore",
  });
  const lifecycleDecision = classifyRemovalLifecycle({
    branch,
    headSha,
    isDirty: dirty.length > 0,
    force,
    discardReason: process.env.SAJTMASKIN_DISCARD_REASON ?? "",
    lifecycle,
    mergedIntoBase: ancestry.status === 0,
  });
  if (!lifecycleDecision.ok) {
    console.error(
      `[worktree] Refusing removal: ${lifecycleDecision.reason}. Run npm run tidy first.`,
    );
    process.exit(1);
  }
  console.log(`[worktree] lifecycle proof: ${lifecycleDecision.reason}`);

  const links = findLinkedEntries(plan.worktreePath);
  for (const link of links) {
    removeLink(link);
    console.log(`[worktree] unlinked ${link} (target untouched)`);
  }
  if (links.length === 0) {
    console.log("[worktree] no links found — nothing to detach.");
  }

  // Retried once: the usual cause is a file handle that has just been released
  // but not yet reaped by the OS, and a second attempt a moment later succeeds.
  let lastError = null;
  for (const delayMs of [0, 750]) {
    if (delayMs > 0) sleepSync(delayMs);
    try {
      git(["worktree", "remove", ...(force ? ["--force"] : []), plan.worktreePath]);
      console.log(`[worktree] removed ${plan.worktreePath}`);
      return;
    } catch (err) {
      lastError = err;
    }
  }

  const stillRegistered = resolveTargetWorktree({
    targetPath: plan.worktreePath,
    worktrees: listWorktrees(),
  }).ok;
  console.error(
    describeRemovalFailure({
      worktreePath: plan.worktreePath,
      detachedLinks: links,
      stillRegistered,
      message:
        (lastError && (lastError.stderr?.toString() || lastError.message)) || "unknown error",
    }),
  );
  process.exit(1);
}

function main() {
  const [action, targetPath, ...rest] = process.argv.slice(2);
  const force = rest.includes("--force");

  if (!action || !targetPath || !["setup", "link", "remove"].includes(action)) {
    console.error(
      "Usage:\n" +
        "  node scripts/cursor/worktree.mjs setup  <worktree-path>\n" +
        "  node scripts/cursor/worktree.mjs link   <worktree-path>\n" +
        "  node scripts/cursor/worktree.mjs remove <worktree-path> [--force]",
    );
    process.exit(2);
  }

  if (action === "setup") commandSetup(targetPath);
  else if (action === "link") commandLink(targetPath);
  else commandRemove(targetPath, { force });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
