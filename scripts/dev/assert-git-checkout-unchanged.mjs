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

export function parseWorktreeSnapshot(value) {
  const lines = String(value ?? "").split(/\r?\n/u);
  return {
    // HEAD-raden rör sig legitimt när ett syskon committar. All övrig
    // worktree-topologi (path, branch, detached/locked) ska ligga still.
    topology: lines.filter((line) => !line.startsWith("HEAD ")).join("\n"),
    branchRefs: lines
      .filter((line) => line.startsWith("branch "))
      .map((line) => line.slice("branch ".length)),
  };
}

export function changedRefNames(before, after) {
  const parse = (value) =>
    new Map(
      String(value ?? "")
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((line) => {
          const separator = line.indexOf(" ");
          return [line.slice(0, separator), line.slice(separator + 1)];
        }),
    );
  const beforeRefs = parse(before);
  const afterRefs = parse(after);
  return [...new Set([...beforeRefs.keys(), ...afterRefs.keys()])]
    .filter((ref) => beforeRefs.get(ref) !== afterRefs.get(ref))
    .sort();
}

export function snapshotCheckout(cwd) {
  const branch = gitOutput(["rev-parse", "--abbrev-ref", "HEAD"], cwd).trim();
  return {
    head: gitOutput(["rev-parse", "HEAD"], cwd).trim(),
    branch,
    status: gitOutput(["status", "--porcelain", "--untracked-files=normal"], cwd),
    config: gitOutput(["config", "--local", "--list"], cwd),
    worktrees: parseWorktreeSnapshot(gitOutput(["worktree", "list", "--porcelain"], cwd)),
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
  if (before.worktrees.topology !== after.worktrees.topology) {
    changes.push("registrerade worktrees ändrades");
  }

  // Alla refs är delade i repots common Git-dir. Ignorera endast en rörelse av
  // en branch som bevisligen är utcheckad i ett annat registrerat worktree;
  // tags och oägda branchrefs ska fortfarande avslöja en testläcka.
  const siblingRefs = new Set([...before.worktrees.branchRefs, ...after.worktrees.branchRefs]);
  if (before.branch !== "HEAD") siblingRefs.delete(`refs/heads/${before.branch}`);
  if (after.branch !== "HEAD") siblingRefs.delete(`refs/heads/${after.branch}`);
  const attributableRefDrift = changedRefNames(before.refs, after.refs).filter(
    (ref) => !siblingRefs.has(ref),
  );
  if (attributableRefDrift.length > 0) {
    changes.push("heads/tags ändrades");
  }
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
    // Wrappern anropas med `node`, som är ett riktigt executable även på
    // Windows. Shell skulle ändra quoting/globbning och bredda injektionsytan.
    shell: false,
    windowsHide: true,
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
