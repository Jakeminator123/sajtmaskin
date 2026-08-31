#!/usr/bin/env node
/**
 * Fail-closed wrapper: run a command and refuse a dirty or rewritten source
 * checkout. Backoffice tests that need Git must use their own temp repo;
 * this guard catches leaks into the real worktree.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function gitOutput(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function snapshotCheckout(cwd) {
  return {
    head: gitOutput(["rev-parse", "HEAD"], cwd).trim(),
    branch: gitOutput(["rev-parse", "--abbrev-ref", "HEAD"], cwd).trim(),
    status: gitOutput(["status", "--porcelain", "--untracked-files=normal"], cwd),
    config: gitOutput(["config", "--local", "--list"], cwd),
    refs: gitOutput(
      ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads", "refs/tags"],
      cwd,
    ),
  };
}

export function describeCheckoutDrift(before, after) {
  const changes = [];
  if (before.head !== after.head) changes.push(`HEAD ${before.head} → ${after.head}`);
  if (before.branch !== after.branch) changes.push(`branch ${before.branch} → ${after.branch}`);
  if (before.status !== after.status) changes.push("index/worktree/status ändrades");
  if (before.config !== after.config) changes.push("lokal git-config ändrades");
  if (before.refs !== after.refs) changes.push("heads/tags ändrades");
  return changes;
}

export function parseWrappedCommand(argv) {
  const separator = argv.indexOf("--");
  if (separator < 0 || separator === argv.length - 1) return null;
  return argv.slice(separator + 1);
}

function main() {
  const command = parseWrappedCommand(process.argv.slice(2));
  if (!command) {
    console.error("usage: node scripts/dev/assert-git-checkout-unchanged.mjs -- <command>...");
    process.exitCode = 2;
    return;
  }
  const cwd = process.cwd();
  const root = gitOutput(["rev-parse", "--show-toplevel"], cwd).trim();
  const before = snapshotCheckout(root);
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  let after;
  try {
    after = snapshotCheckout(root);
  } catch (error) {
    console.error(
      "[git-checkout] STOPP: kunde inte läsa Git-state efter kommandot.",
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
    return;
  }
  const drift = describeCheckoutDrift(before, after);
  if (drift.length > 0) {
    console.error("[git-checkout] STOPP: kommandot ändrade käll-checkoutens Git-state:");
    for (const line of drift) console.error(`  - ${line}`);
    process.exitCode = 1;
    return;
  }
  if (result.error) {
    console.error(`[git-checkout] kunde inte starta ${command[0]}: ${result.error.message}`);
    process.exitCode = 1;
    return;
  }
  if (result.signal) {
    console.error(`[git-checkout] ${command[0]} avbröts av ${result.signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
