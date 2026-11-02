// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acknowledgeHandoff, listHandoffs, publishHandoff, readHandoff, runCli, startHandoff,
} from "./agent-handoff.mjs";

const fixtures: string[] = [];
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true }).trim();
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-handoff-"));
  fixtures.push(root);
  git(root, "init", "--quiet");
  fs.writeFileSync(path.join(root, ".gitignore"), ".cache/\n");
  git(root, "add", ".gitignore");
  git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "fixture");
  return root;
}
function start(root: string, sender = "Agent X", now = new Date("2026-01-01T00:00:00Z")) {
  return startHandoff({ cwd: root, sender, threadId: "chat-x", topic: "A bounded task", now });
}
function publish(root: string, run: ReturnType<typeof start>, date = "2026-01-02T00:00:00Z") {
  const from = path.join(run.cacheDirectory, "summary.md");
  fs.writeFileSync(from, "# Current task\nSafe handoff contents\n");
  publishHandoff({ cwd: root, id: run.id, from, now: new Date(date) });
  return readHandoff({ cwd: root, id: run.id });
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of fixtures.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("metadata-first handoffs and owned cache cleanup", () => {
  it("does nothing on an empty checkout and never creates the store while listing", () => {
    const root = fixture();
    expect(listHandoffs(root)).toEqual({ handoffs: [], cleanupPending: [], warnings: [] });
    expect(fs.existsSync(path.join(root, ".cache"))).toBe(false);
  });

  it("lists published metadata newest first without reading handoff bodies or work", () => {
    const root = fixture();
    const firstStarted = start(root, "MERGAREN");
    const secondStarted = start(root, "Other agent", new Date("2026-01-02T00:00:00Z"));
    start(root, "Still working");
    publish(root, secondStarted, "2026-01-03T00:00:00Z");
    publish(root, firstStarted, "2026-01-04T00:00:00Z");
    const spy = vi.spyOn(fs, "readFileSync");
    const result = listHandoffs(root);
    expect(result.handoffs.map(row => row.sender)).toEqual(["MERGAREN", "Other agent"]);
    expect(result.handoffs[0].createdAt).toBe("2026-01-04T00:00:00.000Z");
    expect(spy.mock.calls.every(([file]) => String(file).endsWith("meta.json"))).toBe(true);
    expect(JSON.stringify(result)).not.toContain("Safe handoff contents");
  });

  it("read preserves the cache; acknowledgement removes only the selected released run", () => {
    const root = fixture();
    const run = start(root);
    const other = start(root, "Other agent");
    const receipt = publish(root, run);
    publish(root, other);
    const refs = git(root, "show-ref");
    expect(fs.existsSync(run.cacheDirectory)).toBe(true);
    expect(receipt.body).toContain("Current task");
    expect(acknowledgeHandoff({ cwd: root, id: run.id, sha256: receipt.sha256 })).toEqual({ id: run.id, removed: true });
    expect(fs.existsSync(path.dirname(run.cacheDirectory))).toBe(false);
    expect(listHandoffs(root).handoffs.map(row => row.id)).toEqual([other.id]);
    expect(git(root, "show-ref")).toBe(refs);
  });

  it("refuses active runs, an incorrect receipt, and implicit latest/path selection", () => {
    const root = fixture();
    const run = start(root);
    expect(() => readHandoff({ cwd: root, id: run.id })).toThrow("not ready");
    expect(() => acknowledgeHandoff({ cwd: root, id: run.id, sha256: "0".repeat(64) })).toThrow("active");
    publish(root, run);
    expect(() => acknowledgeHandoff({ cwd: root, id: run.id, sha256: "0".repeat(64) })).toThrow("receipt");
    for (const id of ["latest", "../other", path.resolve(root)]) {
      expect(() => readHandoff({ cwd: root, id })).toThrow("explicit handoff ID");
    }
    expect(fs.existsSync(run.cacheDirectory)).toBe(true);
  });

  it("binds the reading receipt to the selected ID even when two handoffs have identical text", () => {
    const root = fixture();
    const first = start(root, "First");
    const second = start(root, "Second");
    const firstRead = publish(root, first);
    const from = path.join(second.cacheDirectory, "summary.md");
    fs.writeFileSync(from, firstRead.body);
    publishHandoff({ cwd: root, id: second.id, from });
    expect(() => acknowledgeHandoff({ cwd: root, id: second.id, sha256: firstRead.sha256 })).toThrow("receipt");
    expect(fs.existsSync(second.cacheDirectory)).toBe(true);
    const secondRead = readHandoff({ cwd: root, id: second.id });
    expect(firstRead.body).toBe(secondRead.body);
    expect(firstRead.sha256).not.toBe(secondRead.sha256);
  });

  it.each(["checkout", "worktree", "bare"])("protects nested Git metadata before publication: %s", (kind) => {
    const root = fixture();
    const run = start(root);
    const nested = path.join(run.cacheDirectory, "nested");
    fs.mkdirSync(nested);
    if (kind === "worktree") fs.writeFileSync(path.join(nested, ".git"), `gitdir: ${path.join(root, ".git")}\n`);
    else git(nested, "init", "--quiet", ...(kind === "bare" ? ["--bare"] : []));
    expect(() => publish(root, run)).toThrow("Nested Git repository");
    expect(fs.existsSync(path.join(nested, kind === "bare" ? "HEAD" : ".git"))).toBe(true);
  });

  it.each(["add", "modify", "remove"])("preserves the released cache when its files change: %s", (change) => {
    const root = fixture();
    const run = start(root);
    const file = path.join(run.cacheDirectory, "result.txt");
    fs.writeFileSync(file, "original");
    const receipt = publish(root, run);
    if (change === "add") fs.writeFileSync(path.join(run.cacheDirectory, "new.txt"), "someone else");
    if (change === "modify") fs.writeFileSync(file, "new result");
    if (change === "remove") fs.unlinkSync(file);
    expect(() => acknowledgeHandoff({ cwd: root, id: run.id, sha256: receipt.sha256 })).toThrow("changed after release");
    expect(fs.existsSync(path.join(path.dirname(run.cacheDirectory), "HANDOFF.md"))).toBe(true);
  });

  it("rejects a modified handoff body and immutable publication", () => {
    const root = fixture();
    const run = start(root);
    publish(root, run);
    fs.appendFileSync(path.join(path.dirname(run.cacheDirectory), "HANDOFF.md"), "changed");
    expect(() => readHandoff({ cwd: root, id: run.id })).toThrow("changed after publication");
    expect(() => publishHandoff({ cwd: root, id: run.id, from: path.join(run.cacheDirectory, "summary.md") })).toThrow("immutable");
  });

  it("protects tracked files even if someone force-adds an ignored cache", () => {
    const root = fixture();
    const run = start(root);
    const receipt = publish(root, run);
    git(root, "add", "--force", path.relative(root, path.join(run.cacheDirectory, "summary.md")));
    expect(() => acknowledgeHandoff({ cwd: root, id: run.id, sha256: receipt.sha256 })).toThrow("tracked files");
    expect(fs.existsSync(run.cacheDirectory)).toBe(true);
  });

  it("never follows a cache junction into another folder", () => {
    const root = fixture();
    const run = start(root);
    const receipt = publish(root, run);
    const external = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-external-"));
    fixtures.push(external);
    fs.writeFileSync(path.join(external, "keep.txt"), "untouched");
    fs.symlinkSync(external, path.join(run.cacheDirectory, "linked"), "junction");
    expect(() => acknowledgeHandoff({ cwd: root, id: run.id, sha256: receipt.sha256 })).toThrow("Link/junction");
    expect(fs.readFileSync(path.join(external, "keep.txt"), "utf8")).toBe("untouched");
  });

  it("rejects a linked store and a foreign lock without altering them", () => {
    const root = fixture();
    const external = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-store-"));
    fixtures.push(external);
    fs.mkdirSync(path.join(root, ".cache"));
    fs.symlinkSync(external, path.join(root, ".cache/agent-handoffs"), "junction");
    expect(() => listHandoffs(root)).toThrow("Link/junction");
    fs.unlinkSync(path.join(root, ".cache/agent-handoffs"));
    const run = start(root);
    const lock = path.join(root, ".cache/agent-handoffs/.lock");
    fs.writeFileSync(lock, "foreign");
    expect(() => publish(root, run)).toThrow("Another handoff operation");
    expect(fs.readFileSync(lock, "utf8")).toBe("foreign");
  });

  it("uses the same queue from a linked Git worktree", () => {
    const root = fixture();
    const worktreeParent = fs.mkdtempSync(path.join(os.tmpdir(), "handoff-worktree-"));
    fixtures.push(worktreeParent);
    const worktree = path.join(worktreeParent, "checkout");
    git(root, "worktree", "add", "--quiet", "-b", "other", worktree);
    const run = start(worktree);
    expect(run.cacheDirectory.startsWith(path.join(root, ".cache"))).toBe(true);
    publish(worktree, run);
    expect(listHandoffs(root).handoffs[0].id).toBe(run.id);
  });

  it("keeps the reading receipt and permits retry after partial cleanup failure", () => {
    const root = fixture();
    const run = start(root);
    fs.writeFileSync(path.join(run.cacheDirectory, "disposable.txt"), "work");
    const receipt = publish(root, run);
    const original = fs.rmSync;
    vi.spyOn(fs, "rmSync").mockImplementationOnce(() => {
      fs.unlinkSync(path.join(run.cacheDirectory, "disposable.txt"));
      throw new Error("locked by Windows");
    });
    expect(() => acknowledgeHandoff({ cwd: root, id: run.id, sha256: receipt.sha256 })).toThrow("locked by Windows");
    expect(listHandoffs(root).cleanupPending[0].id).toBe(run.id);
    expect(fs.existsSync(path.join(path.dirname(run.cacheDirectory), "HANDOFF.md"))).toBe(true);
    vi.mocked(fs.rmSync).mockImplementation(original);
    expect(acknowledgeHandoff({ cwd: root, id: run.id, sha256: receipt.sha256 }).removed).toBe(true);
  });

  it("reports malformed metadata without hiding other available handoffs", () => {
    const root = fixture();
    const bad = start(root);
    const good = start(root);
    publish(root, good);
    fs.writeFileSync(path.join(path.dirname(bad.cacheDirectory), "meta.json"), "{broken");
    expect(listHandoffs(root).handoffs[0].id).toBe(good.id);
    expect(listHandoffs(root).warnings).toHaveLength(1);
  });

  it("validates CLI options and refuses unknown automatic selections", () => {
    const root = fixture();
    expect(runCli(["list"], root).handoffs).toEqual([]);
    expect(() => runCli(["read", "latest"], root)).toThrow("explicit handoff ID");
    expect(() => runCli(["start", "--sender", "a", "--sender", "b"], root)).toThrow("duplicate");
    expect(() => runCli(["ack", "anything", "--apply"], root)).toThrow("option");
  });
});
