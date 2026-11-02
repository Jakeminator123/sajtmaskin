/** Local, shared handoffs. Listing reads metadata only; acknowledgement removes
 * only a released, unchanged run created by this tool. No Git refs are changed. */
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const STORE = ".cache/agent-handoffs";
const ID = /^\d{8}T\d{9}Z-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const MAX_BODY = 64 * 1024;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const readingReceipt = (id, bodySha256) => digest(`${id}\0${bodySha256}`);

function git(root, args) {
  return execFileSync("git", args, {
    cwd: root, encoding: "utf8", windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function context(cwd) {
  const common = fs.realpathSync(git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  if (path.basename(common) !== ".git") throw new Error("Expected a non-bare checkout with a shared .git directory");
  const root = fs.realpathSync(path.dirname(common));
  const store = path.join(root, STORE);
  plainPath(root, store);
  return { root, store };
}

/** Reject traversal and links/junctions at every existing path component. */
function plainPath(root, target) {
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Path escaped the handoff workspace");
  }
  let current = root;
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`Link/junction is not managed: ${current}`);
  }
  return target;
}

function runPath(ctx, id) {
  if (!ID.test(id ?? "")) throw new Error("An explicit handoff ID is required (not 'latest' or a path)");
  return plainPath(ctx.root, path.join(ctx.store, id));
}

function textField(value, name, max = 160) {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/u.test(value)) {
    throw new Error(`Invalid ${name}`);
  }
  return value.trim();
}

function json(file, max = 2 * 1024 * 1024) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max) throw new Error(`Invalid metadata file: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function metadata(ctx, id) {
  const dir = runPath(ctx, id);
  const meta = json(path.join(dir, "meta.json"), 8192);
  if (meta.version !== 1 || meta.id !== id || !["active", "ready", "consumed"].includes(meta.state)) {
    throw new Error(`Invalid handoff metadata: ${id}`);
  }
  textField(meta.sender, "sender");
  textField(meta.topic, "topic", 240);
  if (meta.threadId !== null) textField(meta.threadId, "threadId");
  if (!Number.isFinite(Date.parse(meta.startedAt)) || new Date(meta.startedAt).toISOString() !== meta.startedAt) {
    throw new Error("Invalid startedAt");
  }
  if (meta.state !== "active" && (
    !Number.isFinite(Date.parse(meta.createdAt)) || new Date(meta.createdAt).toISOString() !== meta.createdAt ||
    !HASH.test(meta.bodySha256 ?? "") || !HASH.test(meta.inventorySha256 ?? "")
  )) throw new Error("Invalid published handoff receipt");
  return { dir, meta };
}

function atomicJson(file, value) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function locked(ctx, action) {
  plainPath(ctx.root, ctx.store);
  fs.mkdirSync(ctx.store, { recursive: true });
  const lock = path.join(ctx.store, ".lock");
  let fd;
  try { fd = fs.openSync(lock, "wx"); } catch (error) {
    if (error.code === "EEXIST") throw new Error("Another handoff operation holds .lock; do not remove another agent's lock");
    throw error;
  }
  try { return action(); } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}

function assertUntracked(ctx, dir) {
  const relative = path.relative(ctx.root, dir).replaceAll(path.sep, "/");
  if (git(ctx.root, ["ls-files", "--", relative])) throw new Error("Refusing to manage tracked files in the handoff cache");
}

function inventory(ctx, dir) {
  plainPath(ctx.root, dir);
  const rows = [];
  function walk(folder) {
    const entries = fs.readdirSync(folder, { withFileTypes: true });
    const names = new Set(entries.map(entry => entry.name.toLowerCase()));
    // Includes linked worktrees (.git file), nested checkouts and bare repos.
    if (names.has(".git") || (names.has("head") && names.has("objects") && (names.has("refs") || names.has("packed-refs")))) {
      throw new Error("Nested Git repository is not disposable handoff cache");
    }
    for (const entry of entries) {
      const file = plainPath(ctx.root, path.join(folder, entry.name));
      const relative = path.relative(dir, file).replaceAll(path.sep, "/");
      if (folder === dir && ["meta.json", "inventory.json"].includes(entry.name)) {
        if (!entry.isFile()) throw new Error("Metadata must be a regular file");
        continue;
      }
      if (folder === dir && !["HANDOFF.md", "work"].includes(entry.name)) {
        throw new Error(`Unmanaged entry in handoff: ${entry.name}`);
      }
      if (entry.isDirectory()) {
        if (folder === dir && entry.name !== "work") throw new Error("HANDOFF.md must be a file");
        rows.push({ path: relative, kind: "directory" });
        walk(file);
      } else if (entry.isFile()) {
        if (folder === dir && entry.name === "work") throw new Error("work must be a directory");
        rows.push({ path: relative, kind: "file", sha256: digest(fs.readFileSync(file)) });
      } else throw new Error(`Special file is not managed: ${relative}`);
    }
  }
  walk(dir);
  return rows.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

/** No mkdir, cleanup or handoff-body reads: safe at read-only session start. */
export function listHandoffs(cwd = process.cwd()) {
  const ctx = context(cwd);
  if (!fs.existsSync(ctx.store)) return { handoffs: [], cleanupPending: [], warnings: [] };
  const handoffs = [], cleanupPending = [], warnings = [];
  for (const entry of fs.readdirSync(ctx.store, { withFileTypes: true })) {
    if (!ID.test(entry.name)) continue;
    try {
      const { meta } = metadata(ctx, entry.name);
      if (meta.state === "active") continue;
      const row = { id: meta.id, sender: meta.sender, threadId: meta.threadId, topic: meta.topic, createdAt: meta.createdAt };
      (meta.state === "ready" ? handoffs : cleanupPending).push(row);
    } catch (error) { warnings.push({ id: entry.name, error: error.message }); }
  }
  handoffs.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  return { handoffs, cleanupPending, warnings };
}

/** @param {{ cwd?: string, sender: string, threadId?: string | null, topic: string, now?: Date }} options */
export function startHandoff({ cwd = process.cwd(), sender, threadId = null, topic, now = new Date() }) {
  sender = textField(sender, "sender (use the actual chat title)");
  topic = textField(topic, "topic", 240);
  if (threadId !== null) threadId = textField(threadId, "threadId");
  const ctx = context(cwd);
  // The tool never creates a tracked or visible-to-Git scratch tree by accident.
  git(ctx.root, ["check-ignore", "-q", "--", `${STORE}/probe`]);
  return locked(ctx, () => {
    const id = `${now.toISOString().replaceAll(/[-:.]/g, "")}-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const dir = runPath(ctx, id);
    fs.mkdirSync(dir);
    fs.mkdirSync(path.join(dir, "work"));
    atomicJson(path.join(dir, "meta.json"), {
      version: 1, id, state: "active", sender, threadId, topic, startedAt: now.toISOString(), createdAt: null,
    });
    return { id, cacheDirectory: path.join(dir, "work") };
  });
}

export function publishHandoff({ cwd = process.cwd(), id, from, now = new Date() }) {
  const ctx = context(cwd);
  return locked(ctx, () => {
    const { dir, meta } = metadata(ctx, id);
    if (meta.state !== "active") throw new Error("Only an active run can be published; ready runs are immutable");
    const stat = fs.lstatSync(from);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BODY) throw new Error("Handoff must be a regular text file of at most 64 KiB");
    const body = fs.readFileSync(from, "utf8");
    if (!body.trim() || body.includes("\0")) throw new Error("Empty or binary handoff");
    assertUntracked(ctx, dir);
    inventory(ctx, dir); // Validate disposable contents before creating the immutable body.
    plainPath(ctx.root, path.join(dir, "HANDOFF.md"));
    fs.writeFileSync(path.join(dir, "HANDOFF.md"), body, { flag: "wx" });
    const snapshot = inventory(ctx, dir);
    atomicJson(path.join(dir, "inventory.json"), snapshot);
    atomicJson(path.join(dir, "meta.json"), {
      ...meta, state: "ready", createdAt: now.toISOString(), bodySha256: digest(body),
      inventorySha256: digest(JSON.stringify(snapshot)),
      gitHead: git(cwd, ["rev-parse", "HEAD"]), gitBranch: git(cwd, ["branch", "--show-current"]),
    });
    return { id, sender: meta.sender, createdAt: now.toISOString(), released: true };
  });
}

/** Call only after the user selects this exact handoff. Does not delete anything. */
export function readHandoff({ cwd = process.cwd(), id }) {
  const ctx = context(cwd);
  const { dir, meta } = metadata(ctx, id);
  if (meta.state !== "ready") throw new Error("Handoff is not ready for reading");
  const file = plainPath(ctx.root, path.join(dir, "HANDOFF.md"));
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size > MAX_BODY) throw new Error("Invalid handoff body");
  const body = fs.readFileSync(file, "utf8");
  if (digest(body) !== meta.bodySha256) throw new Error("Handoff changed after publication");
  return { id, sender: meta.sender, gitHead: meta.gitHead, gitBranch: meta.gitBranch, body, sha256: readingReceipt(id, meta.bodySha256) };
}

/** Explicit receipt after successful reading; no age-based deletion of unread work. */
export function acknowledgeHandoff({ cwd = process.cwd(), id, sha256 }) {
  if (!HASH.test(sha256 ?? "")) throw new Error("Pass the SHA-256 receipt returned by read");
  const ctx = context(cwd);
  return locked(ctx, () => {
    const { dir, meta } = metadata(ctx, id);
    if (meta.state === "active" || readingReceipt(id, meta.bodySha256) !== sha256) throw new Error("Handoff is active or the reading receipt does not match");
    assertUntracked(ctx, dir);
    const expected = json(plainPath(ctx.root, path.join(dir, "inventory.json")));
    if (!Array.isArray(expected) || digest(JSON.stringify(expected)) !== meta.inventorySha256) throw new Error("Inventory receipt changed");
    const current = inventory(ctx, dir);
    const unchanged = meta.state === "ready"
      ? JSON.stringify(current) === JSON.stringify(expected)
      : current.every(row => expected.some(old => JSON.stringify(old) === JSON.stringify(row)));
    if (!unchanged) throw new Error("Cache changed after release; preserve it and resolve ownership before cleanup");
    atomicJson(path.join(dir, "meta.json"), { ...meta, state: "consumed" });
    // Absolute, validated, tool-owned run only. Never follow links or sweep .cache.
    const work = plainPath(ctx.root, path.join(dir, "work"));
    fs.rmSync(work, { recursive: true, force: true });
    const body = plainPath(ctx.root, path.join(dir, "HANDOFF.md"));
    if (fs.existsSync(body)) fs.unlinkSync(body);
    const remaining = fs.readdirSync(dir);
    if (remaining.some(name => !["meta.json", "inventory.json"].includes(name))) throw new Error("New files arrived during cleanup; metadata retained");
    fs.unlinkSync(path.join(dir, "inventory.json"));
    fs.unlinkSync(path.join(dir, "meta.json"));
    fs.rmdirSync(dir);
    return { id, removed: true };
  });
}

export function runCli(args, cwd = process.cwd()) {
  const [command = "list", ...rest] = args;
  if (command === "list") {
    if (rest.length) throw new Error("list takes no arguments");
    return listHandoffs(cwd);
  }
  const id = command === "start" ? undefined : rest.shift();
  const allowed = { start: ["sender", "thread-id", "topic"], publish: ["from"], read: [], ack: ["sha256"] }[command];
  if (!allowed) throw new Error("Commands: list, start, publish <id>, read <id>, ack <id>");
  const flags = {};
  while (rest.length) {
    const key = rest.shift();
    const value = rest.shift();
    if (!key?.startsWith("--") || !allowed.includes(key.slice(2)) || !value || value.startsWith("--") || key in flags) throw new Error("Invalid or duplicate option");
    flags[key] = value;
  }
  if (command === "start") return startHandoff({ cwd, sender: flags["--sender"], threadId: flags["--thread-id"] ?? null, topic: flags["--topic"] });
  if (command === "publish") {
    if (!flags["--from"]) throw new Error("publish requires --from <summary.md>");
    return publishHandoff({ cwd, id, from: path.resolve(cwd, flags["--from"]) });
  }
  if (command === "read") return readHandoff({ cwd, id });
  return acknowledgeHandoff({ cwd, id, sha256: flags["--sha256"] });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(runCli(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(`[handoff] ${error.message}`); process.exitCode = 1; }
}
