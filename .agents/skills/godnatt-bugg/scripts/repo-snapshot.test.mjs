import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { captureRepoSnapshot } from "./repo-snapshot.mjs";

describe("repo snapshot", () => {
  it("is deterministic when no repository state changes", () => {
    const before = captureRepoSnapshot();
    const after = captureRepoSnapshot();

    assert.deepEqual(after, before);
    assert.match(before.head, /^[a-f0-9]{40}$/u);
    assert.match(before.refsSha256, /^[a-f0-9]{64}$/u);
    assert.match(before.reflogSha256, /^[a-f0-9]{64}$/u);
    assert.match(before.worktreesSha256, /^[a-f0-9]{64}$/u);
  });

  it("detects mutation of a non-head ref such as a tag", () => {
    const repo = mkdtempSync(join(tmpdir(), "godnatt-snapshot-repo-"));
    const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

    try {
      git("init");
      git("config", "user.name", "Godnatt snapshot test");
      git("config", "user.email", "snapshot@example.invalid");
      writeFileSync(join(repo, "proof.txt"), "snapshot proof\n", "utf8");
      git("add", "proof.txt");
      git("commit", "-m", "snapshot fixture");

      const before = captureRepoSnapshot(repo);
      git("tag", "snapshot-probe");
      const after = captureRepoSnapshot(repo);

      assert.notEqual(after.refsSha256, before.refsSha256);
      assert.equal(after.head, before.head);
      assert.equal(after.statusSha256, before.statusSha256);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
