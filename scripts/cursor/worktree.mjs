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
 *   node scripts/cursor/worktree.mjs link   ../sajtmaskin-feat-x
 *   node scripts/cursor/worktree.mjs remove ../sajtmaskin-feat-x [--force]
 *
 * npm: `npm run worktree:link -- <path>` · `npm run worktree:remove -- <path>`
 */
import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync, rmdirSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
 * @param {{ targetPath: string, worktrees: { path: string, isMain: boolean }[] }} input
 * @returns {{ ok: true, worktreePath: string } | { ok: false, reason: string }}
 */
export function resolveTargetWorktree({ targetPath, worktrees }) {
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
  return { ok: true, worktreePath: match.path };
}

function normalizePath(p) {
  return resolve(p).replace(/[\\/]+$/, "").toLowerCase();
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
 * Depth-1 entries of the worktree that are links rather than real directories.
 *
 * Depth 1 is deliberate: the only link anyone creates is `node_modules` at the
 * root, and descending into a real `node_modules` would cost more than the
 * `npm ci` this whole mechanism exists to avoid.
 *
 * @param {string} worktreePath
 * @param {{ readdir?: (p: string) => string[], lstat?: (p: string) => { isSymbolicLink: () => boolean } }} [io]
 * @returns {string[]} absolute paths
 */
export function findLinkedEntries(worktreePath, io = {}) {
  const readdir = io.readdir ?? ((p) => readdirSync(p));
  const lstat = io.lstat ?? ((p) => lstatSync(p));

  let entries;
  try {
    entries = readdir(worktreePath);
  } catch {
    return [];
  }

  const linked = [];
  for (const entry of entries) {
    const full = join(worktreePath, entry);
    try {
      if (lstat(full).isSymbolicLink()) linked.push(full);
    } catch {
      // A racing delete is not our problem — it is already gone.
    }
  }
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
export function describeRemovalFailure({
  worktreePath,
  detachedLinks,
  stillRegistered,
  message,
}) {
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

/** Remove a link without following it. Junctions are directories; file symlinks are not. */
function removeLink(linkPath) {
  try {
    rmdirSync(linkPath);
  } catch (err) {
    if (err.code === "ENOTDIR" || err.code === "EPERM") {
      unlinkSync(linkPath);
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

function commandLink(targetPath) {
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

  const linkPath = join(plan.worktreePath, "node_modules");
  const source = join(mainWorktree, "node_modules");

  try {
    if (lstatSync(linkPath)) {
      console.error(
        `[worktree] ${linkPath} already exists. Remove it first if you want to relink.`,
      );
      process.exit(1);
    }
  } catch {
    // Missing is the expected happy path.
  }

  symlinkSync(source, linkPath, "junction");
  console.log(`[worktree] linked ${linkPath} -> ${source}`);
  console.log(
    "[worktree] IMPORTANT: tear this worktree down with `npm run worktree:remove -- <path>`, " +
      "never a bare `git worktree remove` — that follows the junction and empties the shared node_modules.",
  );
}

function commandRemove(targetPath, { force }) {
  const plan = resolveTargetWorktree({ targetPath, worktrees: listWorktrees() });
  if (!plan.ok) {
    console.error(`[worktree] ${plan.reason}`);
    process.exit(1);
  }

  if (!force) {
    const dirty = parseDirtyEntries(git(["-C", plan.worktreePath, "status", "--porcelain"]));
    if (dirty.length > 0) {
      console.error(
        `[worktree] ${plan.worktreePath} has uncommitted or untracked content. ` +
          "Refusing, exactly as `git worktree remove` would, and leaving all links attached:\n" +
          dirty.map((entry) => `  ${entry}`).join("\n") +
          "\n[worktree] Commit or rescue it (`git stash push -u -m ...`), or rerun with --force if you have decided to discard it.",
      );
      process.exit(1);
    }
  }

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

  if (!action || !targetPath || !["link", "remove"].includes(action)) {
    console.error(
      "Usage:\n" +
        "  node scripts/cursor/worktree.mjs link   <worktree-path>\n" +
        "  node scripts/cursor/worktree.mjs remove <worktree-path> [--force]",
    );
    process.exit(2);
  }

  if (action === "link") commandLink(targetPath);
  else commandRemove(targetPath, { force });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
