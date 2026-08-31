import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  describeCheckoutDrift,
  parseWrappedCommand,
  snapshotCheckout,
} from "./assert-git-checkout-unchanged.mjs";

function git(cwd: string, args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function seedRepo() {
  const cwd = mkdtempSync(join(tmpdir(), "git-checkout-guard-"));
  git(cwd, ["init"]);
  git(cwd, ["config", "user.name", "Test"]);
  git(cwd, ["config", "user.email", "test@example.com"]);
  writeFileSync(join(cwd, "README.md"), "one\n");
  git(cwd, ["add", "README.md"]);
  git(cwd, ["commit", "-m", "init"]);
  return cwd;
}

describe("assert-git-checkout-unchanged", () => {
  it("parses the wrapped command after --", () => {
    expect(parseWrappedCommand(["--", "node", "-e", "0"])).toEqual(["node", "-e", "0"]);
    expect(parseWrappedCommand(["node", "-e", "0"])).toBeNull();
    expect(parseWrappedCommand(["--"])).toBeNull();
  });

  it("reports no drift when the checkout is untouched", () => {
    const cwd = seedRepo();
    try {
      const before = snapshotCheckout(cwd);
      expect(describeCheckoutDrift(before, snapshotCheckout(cwd))).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("detects a commit in the source checkout", () => {
    const cwd = seedRepo();
    try {
      const before = snapshotCheckout(cwd);
      writeFileSync(join(cwd, "README.md"), "two\n");
      git(cwd, ["add", "README.md"]);
      git(cwd, ["commit", "-m", "leak"]);
      const drift = describeCheckoutDrift(before, snapshotCheckout(cwd));
      expect(drift.some((line) => line.startsWith("HEAD"))).toBe(true);
      expect(drift.some((line) => line.includes("heads/tags"))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("exits nonzero when a wrapped command rewrites HEAD", () => {
    const cwd = seedRepo();
    try {
      const script = join(process.cwd(), "scripts/dev/assert-git-checkout-unchanged.mjs");
      const run = spawnSync(
        process.execPath,
        [
          script,
          "--",
          "git",
          "-c",
          "user.name=Test",
          "-c",
          "user.email=test@example.com",
          "commit",
          "--allow-empty",
          "-m",
          "leak",
        ],
        { cwd, encoding: "utf8" },
      );
      expect(run.status).toBe(1);
      expect(run.stderr).toContain("käll-checkoutens Git-state");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
