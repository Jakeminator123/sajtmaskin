import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { captureRepoSnapshot, compareRepoSnapshots } from "./repo-snapshot.mjs";

function fixture() {
  const repo = mkdtempSync(join(tmpdir(), "godnatt-snapshot-repo-"));
  const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git("init");
  git("config", "user.name", "Godnatt snapshot test");
  git("config", "user.email", "snapshot@example.invalid");
  writeFileSync(join(repo, "proof.txt"), "snapshot proof\n", "utf8");
  git("add", "proof.txt");
  git("commit", "-m", "snapshot fixture");
  return { repo, git };
}

describe("repo snapshot", () => {
  it("is deterministic when no repository state changes", () => {
    const { repo } = fixture();
    try {
      const before = captureRepoSnapshot(repo);
      const after = captureRepoSnapshot(repo);

      assert.deepEqual(after, before);
      assert.match(before.head, /^[a-f0-9]{40}$/u);
      assert.match(before.refsSha256, /^[a-f0-9]{64}$/u);
      assert.match(before.reflogSha256, /^[a-f0-9]{64}$/u);
      assert.match(before.worktreesSha256, /^[a-f0-9]{64}$/u);
      assert.equal(compareRepoSnapshots(before, after).kind, "unchanged");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("detects mutation of a non-head ref such as a tag", () => {
    const { repo, git } = fixture();

    try {
      const before = captureRepoSnapshot(repo);
      git("tag", "snapshot-probe");
      const after = captureRepoSnapshot(repo);

      assert.notEqual(after.refsSha256, before.refsSha256);
      assert.equal(after.head, before.head);
      assert.equal(after.statusSha256, before.statusSha256);
      const comparison = compareRepoSnapshots(before, after);
      assert.equal(comparison.kind, "external-change");
      assert.deepEqual(comparison.externalRefs, ["refs/tags/snapshot-probe"]);
      assert.equal(comparison.requiresInspection, true);
      assert.deepEqual(comparison.passChanges, []);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
  for (const change of ["tracked", "staged", "untracked", "untracked-content"]) {
    it(`detects ${change} file changes in an existing sibling worktree`, () => {
      const { repo, git } = fixture();
      const sibling = mkdtempSync(join(tmpdir(), "godnatt-snapshot-sibling-"));
      try {
        git("worktree", "add", "-b", "fix/sibling", sibling);
        if (change === "untracked-content") writeFileSync(join(sibling, "new.txt"), "before\n", "utf8");
        const before = captureRepoSnapshot(repo);
        writeFileSync(join(sibling, change.startsWith("untracked") ? "new.txt" : "proof.txt"), "after\n", "utf8");
        if (change === "staged") execFileSync("git", ["add", "proof.txt"], { cwd: sibling });
        const after = captureRepoSnapshot(repo);
        assert.equal(after.head, before.head);
        assert.equal(after.refsSha256, before.refsSha256);
        assert.equal(after.worktreesSha256, before.worktreesSha256);
        assert.equal(after.statusSha256, before.statusSha256);
        const result = compareRepoSnapshots(before, after);
        assert.equal(result.kind, "external-change");
        assert.deepEqual(result.passChanges, []);
        assert.equal(result.externalWorktrees.length, 1);
        assert.equal(result.requiresInspection, true);
      } finally {
        rmSync(sibling, { recursive: true, force: true });
        rmSync(repo, { recursive: true, force: true });
      }
    });
  }
  it("ignores sibling gitignored files but detects writes in the pass itself", () => {
    const { repo, git } = fixture();
    const sibling = mkdtempSync(join(tmpdir(), "godnatt-snapshot-sibling-"));
    try {
      writeFileSync(join(repo, ".gitignore"), ".env\n", "utf8");
      git("add", ".gitignore");
      git("commit", "-m", "ignore local secrets");
      git("worktree", "add", "-b", "fix/sibling", sibling);
      const before = captureRepoSnapshot(repo);
      writeFileSync(join(sibling, ".env"), "ignored fixture\n", "utf8");
      const afterIgnored = captureRepoSnapshot(repo);
      assert.deepEqual(afterIgnored, before);
      writeFileSync(join(repo, "proof.txt"), "pass change\n", "utf8");
      assert.equal(compareRepoSnapshots(before, captureRepoSnapshot(repo)).kind, "pass-mutation");
    } finally {
      rmSync(sibling, { recursive: true, force: true });
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("snapshot comparison is fail-closed", () => {
  const shaA = "a".repeat(40);
  const shaB = "b".repeat(40);
  const hashA = "a".repeat(64);
  const hashB = "b".repeat(64);
  const initial = {
    version: 2, repoRoot: "/pass", head: shaA, branch: "fix/pass",
    refs: { "refs/heads/fix/pass": shaA, "refs/heads/other": shaA },
    worktrees: { "/pass": `HEAD ${shaA}\nbranch refs/heads/fix/pass`, "/other": `HEAD ${shaA}\nbranch refs/heads/other` },
    siblingWorktrees: { "/other": hashA },
    refsSha256: hashA, reflogSha256: hashA, worktreesSha256: hashA,
    statusSha256: hashA, stagedDiffSha256: hashA, unstagedDiffSha256: hashA,
    headReflogSha256: hashA, untracked: [],
  };
  it("stops changes in the pass ref even if the working HEAD has not moved", () => {
    const after = { ...initial, refs: { ...initial.refs, "refs/heads/fix/pass": shaB }, refsSha256: hashB };
    assert.equal(compareRepoSnapshots(initial, after).kind, "unclassified-change");
  });
  it("stops a change in the pass working files", () => {
    const after = { ...initial, unstagedDiffSha256: hashB };
    assert.equal(compareRepoSnapshots(initial, after).kind, "pass-mutation");
  });
  it("reports a different worktree as external rather than accusing the reviewer", () => {
    const after = { ...initial, worktrees: { ...initial.worktrees, "/other": "HEAD b" }, worktreesSha256: hashB };
    const result = compareRepoSnapshots(initial, after);
    assert.equal(result.kind, "external-change");
    assert.deepEqual(result.externalWorktrees, ["/other"]);
    assert.equal(result.requiresInspection, true);
  });
  it("never treats an unexplained reflog change as clean", () => {
    const after = { ...initial, reflogSha256: hashB };
    assert.equal(compareRepoSnapshots(initial, after).kind, "unclassified-change");
  });
  it("keeps legacy global-only snapshots conservative", () => {
    const before = { ...initial, version: 1 };
    const after = { ...before, refsSha256: hashB };
    assert.equal(compareRepoSnapshots(before, after).kind, "unclassified-change");
    assert.equal(compareRepoSnapshots(before, before).kind, "unclassified-change");
  });
  it("requires complete readable fingerprints of every sibling worktree", () => {
    for (const siblingWorktrees of [{}, { "/other": { error: "access denied" } },
      { "/other": hashA, "/unregistered": hashA }, { "/other": "invalid" }]) {
      const incomplete = { ...initial, siblingWorktrees };
      assert.equal(compareRepoSnapshots(incomplete, incomplete).kind, "unclassified-change");
    }
  });
  it("recognizes the pass worktree with Windows slash and case differences", () => {
    const before = { ...initial, repoRoot: "C:\\Users\\Jakem\\pass",
      worktrees: { "C:/Users/Jakem/pass": initial.worktrees["/pass"] }, siblingWorktrees: {} };
    const after = { ...before, head: shaB, refs: { ...before.refs, "refs/heads/fix/pass": shaB },
      worktrees: { "c:/users/jakem/pass": `HEAD ${shaB}\nbranch refs/heads/fix/pass` }, worktreesSha256: hashB };
    const result = compareRepoSnapshots(before, after);
    assert.equal(result.kind, "pass-mutation");
    assert.deepEqual(result.externalWorktrees, []);
    assert.ok(result.passChanges.includes("pass-worktree"));
  });
  it("does not report Windows path spelling alone as a mutation", () => {
    const before = { ...initial, repoRoot: "C:\\Users\\Jakem\\pass",
      worktrees: { "C:/Users/Jakem/pass": initial.worktrees["/pass"] }, siblingWorktrees: {} };
    const after = { ...before, repoRoot: "c:/users/jakem/pass",
      worktrees: { "c:/users/jakem/pass": initial.worktrees["/pass"] } };
    assert.equal(compareRepoSnapshots(before, after).kind, "unchanged");
  });
  it("does not interpret incomplete structured snapshots as clean", () => {
    const after = { ...initial, refs: undefined };
    const result = compareRepoSnapshots(initial, after);
    assert.equal(result.kind, "unclassified-change");
    assert.equal(result.requiresInspection, true);
  });
  it("rejects unknown snapshot versions and unreadable untracked files", () => {
    for (const invalid of [
      { ...initial, version: 3 },
      { ...initial, untracked: [{ path: "proof.txt", error: "access denied" }] },
      { ...initial, refs: {} },
    ]) {
      const result = compareRepoSnapshots(invalid, invalid);
      assert.equal(result.kind, "unclassified-change");
      assert.equal(result.requiresInspection, true);
    }
  });
  it("rejects internally inconsistent HEAD, ref and worktree records", () => {
    for (const invalid of [
      { ...initial, head: shaB },
      { ...initial, branch: null },
      { ...initial, worktrees: { ...initial.worktrees, "/pass": `HEAD ${shaB}\nbranch refs/heads/fix/pass` } },
      { ...initial, worktrees: { ...initial.worktrees, "/pass": `HEAD ${shaA}\nbranch refs/heads/other` } },
    ]) {
      assert.equal(compareRepoSnapshots(invalid, invalid).kind, "unclassified-change");
    }
  });
  it("supports consistent detached preflight but not a registered branch assertion", () => {
    const detached = { ...initial, branch: null,
      worktrees: { ...initial.worktrees, "/pass": `HEAD ${shaA}\ndetached` } };
    assert.equal(compareRepoSnapshots(detached, detached).kind, "unchanged");
    assert.equal(compareRepoSnapshots(detached, detached, { passBranch: "fix/pass" }).kind, "unclassified-change");
  });
  for (const field of Object.keys(initial)) {
    it(`rejects missing ${field} on either or both sides`, () => {
      const incomplete = { ...initial };
      delete incomplete[field];
      for (const [before, after] of [[initial, incomplete], [incomplete, initial], [incomplete, incomplete]]) {
        const result = compareRepoSnapshots(before, after);
        assert.equal(result.kind, "unclassified-change");
        assert.equal(result.requiresInspection, true);
      }
    });
  }
});
