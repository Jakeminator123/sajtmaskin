#!/usr/bin/env node
/**
 * Fail-closed wrapper: run a command and refuse a dirty or rewritten source
 * checkout. Backoffice tests that need Git must use their own temp repo;
 * this guard catches leaks into the real worktree.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const GIT_MAX_BUFFER = 64 * 1024 * 1024;

export function gitOutput(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    maxBuffer: GIT_MAX_BUFFER,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitBytes(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "buffer",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    maxBuffer: GIT_MAX_BUFFER,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function optionalGitOutput(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    maxBuffer: GIT_MAX_BUFFER,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  return result.status === 0 ? result.stdout.trim() : null;
}

export function parseWorktreeSnapshot(value) {
  const lines = String(value ?? "").split(/\r?\n/u);
  return {
    // HEAD-raderna är projektioner av refs och kontrolleras fail-closed i den
    // separata refs-snapshotten. Här bevakas bara worktree-topologin.
    topology: lines.filter((line) => !line.startsWith("HEAD ")).join("\n"),
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

function nulSeparatedPaths(value) {
  const paths = [];
  let start = 0;
  for (let end = value.indexOf(0, start); end >= 0; end = value.indexOf(0, start)) {
    if (end > start) paths.push(value.subarray(start, end));
    start = end + 1;
  }
  if (start < value.length) paths.push(value.subarray(start));
  return paths;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function joinBufferPath(parent, child) {
  return Buffer.concat([parent, Buffer.from(sep), child]);
}

function absoluteBufferPath(root, path) {
  return joinBufferPath(Buffer.from(resolve(root)), path);
}

function utf8Path(value) {
  const decoded = value.toString("utf8");
  return Buffer.from(decoded).equals(value) ? decoded : null;
}

function entryType(stat) {
  if (stat.isFile()) return "file";
  if (stat.isSymbolicLink()) return "symlink";
  if (stat.isDirectory()) return "directory";
  if (stat.isFIFO()) return "fifo";
  if (stat.isSocket()) return "socket";
  if (stat.isCharacterDevice()) return "character-device";
  if (stat.isBlockDevice()) return "block-device";
  return "unknown";
}

function hasGitAdminEntry(absolutePath) {
  try {
    lstatSync(joinBufferPath(absolutePath, Buffer.from(".git")));
    return true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return false;
    throw error;
  }
}

function snapshotIndex(cwd) {
  // -v behåller stage/blob/Git-mode och kodar både assume-unchanged (lowercase)
  // och skip-worktree (S). Rå bytes gör även icke-UTF-8-paths entydiga.
  return digest(gitBytes(["ls-files", "--stage", "-v", "-z"], cwd));
}

function snapshotRepositoryFiles(cwd, repositories) {
  const repository = resolve(cwd);
  if (repositories.has(repository)) return { cycle: true };
  const nestedRepositories = new Set(repositories).add(repository);
  const trackedPaths = nulSeparatedPaths(gitBytes(["ls-files", "--cached", "-z"], cwd));
  const untrackedPaths = nulSeparatedPaths(
    gitBytes(["ls-files", "--others", "--exclude-standard", "-z"], cwd),
  );
  return {
    head: optionalGitOutput(["rev-parse", "--verify", "HEAD"], cwd),
    branch: optionalGitOutput(["symbolic-ref", "--quiet", "HEAD"], cwd),
    index: snapshotIndex(cwd),
    tracked: snapshotFilesystemEntries(cwd, trackedPaths, nestedRepositories),
    untracked: snapshotFilesystemEntries(cwd, untrackedPaths, nestedRepositories),
  };
}

function snapshotDirectory(absolutePath, repositories) {
  const decodedPath = utf8Path(absolutePath);
  if (decodedPath && hasGitAdminEntry(absolutePath)) {
    const topLevel = optionalGitOutput(["rev-parse", "--show-toplevel"], decodedPath);
    if (topLevel && resolve(topLevel) === resolve(decodedPath)) {
      return { kind: "git", state: snapshotRepositoryFiles(decodedPath, repositories) };
    }
  }

  const names = readdirSync(absolutePath, { encoding: "buffer" }).sort(Buffer.compare);
  return {
    kind: "filesystem",
    entries: names.map((name) =>
      snapshotFilesystemEntryAt(joinBufferPath(absolutePath, name), name, repositories),
    ),
  };
}

function snapshotFilesystemEntryAt(absolutePath, path, repositories) {
  let stat;
  try {
    stat = lstatSync(absolutePath);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return { path: path.toString("base64"), type: "missing", mode: null, content: null };
    }
    throw error;
  }

  const encodedPath = path.toString("base64");
  const mode = stat.mode & 0o7777;
  if (stat.isFile()) {
    return { path: encodedPath, type: "file", mode, content: digest(readFileSync(absolutePath)) };
  }
  if (stat.isSymbolicLink()) {
    return {
      path: encodedPath,
      type: "symlink",
      mode,
      content: digest(readlinkSync(absolutePath, "buffer")),
    };
  }
  if (stat.isDirectory()) {
    return {
      path: encodedPath,
      type: "directory",
      mode,
      content: snapshotDirectory(absolutePath, repositories),
    };
  }
  return { path: encodedPath, type: entryType(stat), mode, content: null };
}

function snapshotFilesystemEntries(root, paths, repositories = new Set()) {
  const uniquePaths = new Map(paths.map((path) => [path.toString("base64"), path]));
  return [...uniquePaths.values()].map((path) =>
    snapshotFilesystemEntryAt(absoluteBufferPath(root, path), path, repositories),
  );
}

function snapshotsEqual(before, after) {
  return JSON.stringify(before) === JSON.stringify(after);
}

export function snapshotCheckout(cwd) {
  const branch = gitOutput(["rev-parse", "--abbrev-ref", "HEAD"], cwd).trim();
  const trackedPaths = nulSeparatedPaths(gitBytes(["ls-files", "--cached", "-z"], cwd));
  const untrackedPaths = nulSeparatedPaths(
    gitBytes(["ls-files", "--others", "--exclude-standard", "-z"], cwd),
  );
  return {
    head: gitOutput(["rev-parse", "HEAD"], cwd).trim(),
    branch,
    status: gitOutput(["status", "--porcelain", "--untracked-files=normal"], cwd),
    // Statuskoden ensam ser inte om en redan M-/??-markerad fil skrivs om.
    // Indexet fångar staged blobbar, Git-modes och semantiska indexflaggor;
    // byte-säkra filsystemssnapshots fångar unstaged innehåll, filtyp och mode
    // utan att skriva objekt eller uppdatera indexet.
    trackedIndex: snapshotIndex(cwd),
    trackedWorktree: snapshotFilesystemEntries(cwd, trackedPaths),
    untrackedWorktree: snapshotFilesystemEntries(cwd, untrackedPaths),
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
  if (
    before.status !== after.status ||
    before.trackedIndex !== after.trackedIndex ||
    !snapshotsEqual(before.trackedWorktree, after.trackedWorktree) ||
    !snapshotsEqual(before.untrackedWorktree, after.untrackedWorktree)
  ) {
    changes.push("index/worktree/status ändrades");
  }
  if (before.config !== after.config) changes.push("lokal git-config ändrades");
  if (before.worktrees.topology !== after.worktrees.topology) {
    changes.push("registrerade worktrees ändrades");
  }

  // Heads och tags delas av alla worktrees. Före/efter-snapshots kan inte
  // bevisa vilken process som flyttade en ref, så varje rörelse måste stoppas.
  if (changedRefNames(before.refs, after.refs).length > 0) {
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
