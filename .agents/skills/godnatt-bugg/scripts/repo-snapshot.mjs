#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { posix, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const MAX_BUFFER = 64 * 1024 * 1024;

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "buffer",
    maxBuffer: MAX_BUFFER,
    timeout: 10_000,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
}

function text(buffer) {
  return buffer.toString("utf8").trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function nulList(buffer) {
  return buffer.toString("utf8").split("\0").filter(Boolean).sort();
}

function refRecords(buffer) {
  return Object.fromEntries(text(buffer).split("\n").filter(Boolean).map((line) => {
    const split = line.lastIndexOf(" ");
    return [line.slice(0, split), line.slice(split + 1)];
  }));
}

function worktreeRecords(buffer) {
  return Object.fromEntries(text(buffer).split(/\r?\n\r?\n/u).filter(Boolean).map((block) => {
    const lines = block.split(/\r?\n/u);
    return [lines[0].slice("worktree ".length), lines.slice(1).join("\n")];
  }));
}

function changedKeys(before = {}, after = {}) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => before[key] !== after[key]).sort();
}

function worktreePath(path) {
  const slashed = path.replaceAll("\\", "/");
  return /^[a-z]:\//iu.test(slashed) || slashed.startsWith("//")
    ? win32.normalize(path).replaceAll("\\", "/").toLowerCase()
    : posix.normalize(slashed);
}

function normalizedWorktrees(records) {
  return Object.fromEntries(Object.entries(records).map(([path, value]) => [worktreePath(path), value]));
}

function workingFiles(repoRoot) {
  const untracked = nulList(
    git(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ).map((path) => {
    try {
      const absolutePath = resolve(repoRoot, path);
      const stats = statSync(absolutePath);
      return { path, size: stats.size, sha256: sha256(readFileSync(absolutePath)) };
    } catch (error) {
      return { path, error: error instanceof Error ? error.message : String(error) };
    }
  });
  return {
    statusSha256: sha256(git(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])),
    unstagedDiffSha256: sha256(git(repoRoot, ["diff", "--binary", "--no-ext-diff"])),
    stagedDiffSha256: sha256(git(repoRoot, ["diff", "--cached", "--binary", "--no-ext-diff"])),
    untracked,
  };
}

function validSnapshot(snapshot) {
  if (!snapshot || ![1, 2].includes(snapshot.version)) return false;
  const hashes = ["refsSha256", "reflogSha256", "statusSha256", "unstagedDiffSha256",
    "stagedDiffSha256", "worktreesSha256"];
  if (snapshot.version === 2) hashes.push("headReflogSha256");
  if (!hashes.every((key) => /^[a-f0-9]{64}$/u.test(snapshot[key] ?? ""))) return false;
  if (typeof snapshot.head !== "string" || !/^[a-f0-9]{40}$/u.test(snapshot.head)) return false;
  if (typeof snapshot.repoRoot !== "string" ||
    !(posix.isAbsolute(snapshot.repoRoot) || win32.isAbsolute(snapshot.repoRoot))) return false;
  if (snapshot.branch !== null && (typeof snapshot.branch !== "string" || !snapshot.branch)) return false;
  if (!Array.isArray(snapshot.untracked) || !snapshot.untracked.every((entry) =>
    typeof entry?.path === "string" && entry.path &&
    entry.error === undefined && Number.isInteger(entry.size) && entry.size >= 0 &&
      /^[a-f0-9]{64}$/u.test(entry.sha256 ?? ""))) return false;
  if (snapshot.version === 1) return true;
  if (![snapshot.refs, snapshot.worktrees].every((records) => records &&
    typeof records === "object" && !Array.isArray(records))) return false;
  if (!Object.entries(snapshot.refs).every(([ref, sha]) => ref.startsWith("refs/") &&
    typeof sha === "string" && /^[a-f0-9]{40}$/u.test(sha))) return false;
  if (!Object.values(snapshot.worktrees).every((value) => typeof value === "string")) return false;
  const records = normalizedWorktrees(snapshot.worktrees);
  if (Object.keys(records).length !== Object.keys(snapshot.worktrees).length) return false;
  const siblings = snapshot.siblingWorktrees;
  if (!siblings || typeof siblings !== "object" || Array.isArray(siblings)) return false;
  const expectedSiblings = Object.keys(records).filter((path) =>
    path !== worktreePath(snapshot.repoRoot) && !records[path].split("\n").includes("bare")).sort();
  if (JSON.stringify(Object.keys(siblings).sort()) !== JSON.stringify(expectedSiblings) ||
    !Object.values(siblings).every((hash) => typeof hash === "string" && /^[a-f0-9]{64}$/u.test(hash))) return false;
  const ownWorktree = records[worktreePath(snapshot.repoRoot)];
  if (typeof ownWorktree !== "string") return false;
  const ownLines = ownWorktree.split("\n");
  if (!ownLines.includes(`HEAD ${snapshot.head}`)) return false;
  if (snapshot.branch === null) {
    return ownLines.includes("detached") && !ownLines.some((line) => line.startsWith("branch "));
  }
  const ownRef = `refs/heads/${snapshot.branch}`;
  return snapshot.refs[ownRef] === snapshot.head && ownLines.includes(`branch ${ownRef}`) &&
    !ownLines.includes("detached");
}

// Pass-integrity is strict. Other shared refs/worktrees are still reported,
// but cannot establish who changed them or automatically accuse the reviewer.
export function compareRepoSnapshots(before, after, { passBranch = before?.branch } = {}) {
  if (!validSnapshot(before) || !validSnapshot(after) ||
    (passBranch && (before.branch !== passBranch || after.branch !== passBranch))) {
    return { kind: "unclassified-change", passChanges: [], externalRefs: [],
      externalWorktrees: [], globalChanges: [], requiresInspection: true };
  }
  const passChanges = ["head", "branch", "statusSha256",
    "unstagedDiffSha256", "stagedDiffSha256", "headReflogSha256"]
    .filter((key) => before[key] !== after[key]);
  if (worktreePath(before.repoRoot) !== worktreePath(after.repoRoot)) passChanges.push("repoRoot");
  if (JSON.stringify(before.untracked) !== JSON.stringify(after.untracked)) {
    passChanges.push("untracked");
  }
  const hasRecords = (snapshot) => [snapshot.refs, snapshot.worktrees].every((records) =>
    records && typeof records === "object" && !Array.isArray(records));
  const structured = before.version >= 2 && after.version >= 2 && hasRecords(before) && hasRecords(after);
  const incomplete = (before.version >= 2 || after.version >= 2) && !structured;
  const refs = structured ? changedKeys(before.refs, after.refs) : [];
  const worktrees = structured ? changedKeys(normalizedWorktrees(before.worktrees), normalizedWorktrees(after.worktrees)) : [];
  const siblingFiles = structured ? changedKeys(before.siblingWorktrees, after.siblingWorktrees) : [];
  const passRef = passBranch ? `refs/heads/${passBranch}` : null;
  if (passRef && refs.includes(passRef)) passChanges.push(passRef);
  const passPath = worktreePath(before.repoRoot);
  if (worktrees.includes(passPath)) passChanges.push("pass-worktree");
  const externalRefs = refs.filter((ref) => ref !== passRef);
  const externalWorktrees = [...new Set([...worktrees.filter((path) => path !== passPath), ...siblingFiles])].sort();
  const globalChanges = ["refsSha256", "reflogSha256", "worktreesSha256"]
    .filter((key) => before[key] !== after[key]);
  const unexplained = incomplete || !structured ||
    (globalChanges.length > 0 && refs.length === 0 && worktrees.length === 0);
  return {
    kind: passChanges.length > 0 ? "pass-mutation" : unexplained ? "unclassified-change" :
      externalRefs.length > 0 || externalWorktrees.length > 0 ? "external-change" : "unchanged",
    passChanges,
    externalRefs,
    externalWorktrees,
    globalChanges,
    // External changes must be inspected (a delivery base can have moved).
    requiresInspection: passChanges.length > 0 || globalChanges.length > 0 || unexplained ||
      externalRefs.length > 0 || externalWorktrees.length > 0,
  };
}

export function captureRepoSnapshot(cwd = process.cwd()) {
  const repoRoot = text(git(cwd, ["rev-parse", "--show-toplevel"]));
  const files = workingFiles(repoRoot);
  const refs = git(repoRoot, ["for-each-ref", "--format=%(refname) %(objectname)"]);
  const reflog = git(repoRoot, ["reflog", "show", "--all", "--date=raw", "--format=%H %gD %gs"]);
  const worktrees = git(repoRoot, ["worktree", "list", "--porcelain"]);
  const records = worktreeRecords(worktrees);
  const siblingWorktrees = Object.fromEntries(Object.entries(records).filter(([path, record]) =>
    worktreePath(path) !== worktreePath(repoRoot) && !record.split("\n").includes("bare")).map(([path]) => {
    try {
      const sibling = workingFiles(path);
      // Unreadable files are incomplete proof, never a stable clean fingerprint.
      if (sibling.untracked.some((entry) => entry.error !== undefined)) throw new Error("unreadable sibling files");
      return [worktreePath(path), sha256(JSON.stringify(sibling))];
    } catch (error) {
      return [worktreePath(path), { error: error instanceof Error ? error.message : String(error) }];
    }
  }));

  return {
    version: 2,
    repoRoot: resolve(repoRoot),
    head: text(git(repoRoot, ["rev-parse", "HEAD"])),
    branch: text(git(repoRoot, ["branch", "--show-current"])) || null,
    refs: refRecords(refs),
    worktrees: records,
    siblingWorktrees,
    headReflogSha256: sha256(git(repoRoot, ["reflog", "show", "HEAD", "--date=raw", "--format=%H %gD %gs"])),
    refsSha256: sha256(refs),
    reflogSha256: sha256(reflog),
    statusSha256: files.statusSha256,
    unstagedDiffSha256: files.unstagedDiffSha256,
    stagedDiffSha256: files.stagedDiffSha256,
    worktreesSha256: sha256(worktrees),
    untracked: files.untracked,
  };
}

function main() {
  process.stdout.write(JSON.stringify(captureRepoSnapshot(), null, 2) + "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  main();
}
