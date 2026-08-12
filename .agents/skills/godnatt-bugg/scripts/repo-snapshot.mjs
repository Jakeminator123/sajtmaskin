#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const MAX_BUFFER = 64 * 1024 * 1024;

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "buffer",
    maxBuffer: MAX_BUFFER,
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

export function captureRepoSnapshot(cwd = process.cwd()) {
  const repoRoot = text(git(cwd, ["rev-parse", "--show-toplevel"]));
  const untracked = nulList(
    git(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ).map((path) => {
    const absolutePath = resolve(repoRoot, path);
    try {
      const stats = statSync(absolutePath);
      const content = readFileSync(absolutePath);
      return { path, size: stats.size, sha256: sha256(content) };
    } catch (error) {
      return {
        path,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  const refs = git(repoRoot, ["for-each-ref", "--format=%(refname) %(objectname)"]);
  const reflog = git(repoRoot, ["reflog", "show", "--all", "--date=raw", "--format=%H %gD %gs"]);
  const status = git(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const unstaged = git(repoRoot, ["diff", "--binary", "--no-ext-diff"]);
  const staged = git(repoRoot, ["diff", "--cached", "--binary", "--no-ext-diff"]);
  const worktrees = git(repoRoot, ["worktree", "list", "--porcelain"]);

  return {
    version: 1,
    repoRoot: resolve(repoRoot),
    head: text(git(repoRoot, ["rev-parse", "HEAD"])),
    branch: text(git(repoRoot, ["branch", "--show-current"])) || null,
    refsSha256: sha256(refs),
    reflogSha256: sha256(reflog),
    statusSha256: sha256(status),
    unstagedDiffSha256: sha256(unstaged),
    stagedDiffSha256: sha256(staged),
    worktreesSha256: sha256(worktrees),
    untracked,
  };
}

function main() {
  process.stdout.write(JSON.stringify(captureRepoSnapshot(), null, 2) + "\n");
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  main();
}
