import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
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

function seedNestedRepo(cwd: string, name: string) {
  const nested = join(cwd, name);
  mkdirSync(nested);
  git(nested, ["init"]);
  git(nested, ["config", "user.name", "Test"]);
  git(nested, ["config", "user.email", "test@example.com"]);
  writeFileSync(join(nested, "inside.txt"), "one\n");
  git(nested, ["add", "inside.txt"]);
  git(nested, ["commit", "-m", "nested init"]);
  return nested;
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

  it("detects rewritten content in an already-dirty tracked file", () => {
    const cwd = seedRepo();
    try {
      writeFileSync(join(cwd, "README.md"), "two\n");
      const before = snapshotCheckout(cwd);
      writeFileSync(join(cwd, "README.md"), "three\n");
      const after = snapshotCheckout(cwd);

      expect(after.status).toBe(before.status);
      expect(describeCheckoutDrift(before, after)).toContain("index/worktree/status ändrades");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("detects rewritten staged content with the same porcelain status", () => {
    const cwd = seedRepo();
    try {
      writeFileSync(join(cwd, "README.md"), "two\n");
      git(cwd, ["add", "README.md"]);
      const before = snapshotCheckout(cwd);
      writeFileSync(join(cwd, "README.md"), "three\n");
      git(cwd, ["add", "README.md"]);
      const after = snapshotCheckout(cwd);

      expect(after.status).toBe(before.status);
      expect(describeCheckoutDrift(before, after)).toContain("index/worktree/status ändrades");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("detects rewritten content in an existing untracked file", () => {
    const cwd = seedRepo();
    try {
      writeFileSync(join(cwd, "notes.txt"), "one\n");
      const before = snapshotCheckout(cwd);
      writeFileSync(join(cwd, "notes.txt"), "two\n");
      const after = snapshotCheckout(cwd);

      expect(after.status).toBe(before.status);
      expect(describeCheckoutDrift(before, after)).toContain("index/worktree/status ändrades");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("detects rewritten content inside an untracked embedded repository", () => {
    const cwd = seedRepo();
    try {
      const nested = seedNestedRepo(cwd, "nested");
      writeFileSync(join(nested, "inside.txt"), "two\n");
      const before = snapshotCheckout(cwd);
      writeFileSync(join(nested, "inside.txt"), "three\n");
      const after = snapshotCheckout(cwd);

      expect(after.status).toBe(before.status);
      expect(describeCheckoutDrift(before, after)).toContain("index/worktree/status ändrades");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("detects rewritten tracked content inside an already-dirty gitlink", () => {
    const cwd = seedRepo();
    try {
      const nested = seedNestedRepo(cwd, "nested");
      git(cwd, ["add", "nested"]);
      git(cwd, ["commit", "-m", "add gitlink"]);
      writeFileSync(join(nested, "inside.txt"), "two\n");
      const before = snapshotCheckout(cwd);
      writeFileSync(join(nested, "inside.txt"), "three\n");
      const after = snapshotCheckout(cwd);

      expect(after.status).toBe(before.status);
      expect(describeCheckoutDrift(before, after)).toContain("index/worktree/status ändrades");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("detects semantic index-flag changes", () => {
    for (const flag of ["--assume-unchanged", "--skip-worktree"]) {
      const cwd = seedRepo();
      try {
        const before = snapshotCheckout(cwd);
        git(cwd, ["update-index", flag, "README.md"]);
        const after = snapshotCheckout(cwd);

        expect(after.status).toBe(before.status);
        expect(describeCheckoutDrift(before, after)).toContain("index/worktree/status ändrades");
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    }
  });

  it.skipIf(process.platform === "win32")(
    "detects worktree mode changes even when Git ignores filemode",
    () => {
      const cwd = seedRepo();
      try {
        git(cwd, ["config", "core.filemode", "false"]);
        const path = join(cwd, "README.md");
        const before = snapshotCheckout(cwd);
        chmodSync(path, (statSync(path).mode & 0o7777) ^ 0o100);
        const after = snapshotCheckout(cwd);

        expect(after.status).toBe(before.status);
        expect(describeCheckoutDrift(before, after)).toContain("index/worktree/status ändrades");
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(process.platform === "win32")("keeps non-UTF-8 Git paths byte-safe", () => {
    const cwd = seedRepo();
    try {
      const path = Buffer.concat([Buffer.from(cwd), Buffer.from("/"), Buffer.from([0xff])]);
      writeFileSync(path, "one\n");
      git(cwd, ["add", "--all"]);
      git(cwd, ["commit", "-m", "add byte path"]);
      writeFileSync(path, "two\n");
      const before = snapshotCheckout(cwd);
      writeFileSync(path, "three\n");
      const after = snapshotCheckout(cwd);

      expect(after.status).toBe(before.status);
      expect(describeCheckoutDrift(before, after)).toContain("index/worktree/status ändrades");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")("distinguishes special untracked file types", () => {
    const cwd = seedRepo();
    try {
      const path = join(cwd, "special");
      symlinkSync("missing-target", path);
      const before = snapshotCheckout(cwd);
      rmSync(path);
      writeFileSync(path, "replacement\n");
      const after = snapshotCheckout(cwd);

      expect(after.status).toBe(before.status);
      expect(describeCheckoutDrift(before, after)).toContain("index/worktree/status ändrades");
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

  it("ignores a branch advance in a sibling worktree", () => {
    const cwd = seedRepo();
    const sibling = `${cwd}-sibling`;
    try {
      git(cwd, ["worktree", "add", "-b", "sibling", sibling]);
      const before = snapshotCheckout(cwd);
      git(sibling, ["commit", "--allow-empty", "-m", "sibling advance"]);
      expect(describeCheckoutDrift(before, snapshotCheckout(cwd))).toEqual([]);
    } finally {
      rmSync(sibling, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("still detects HEAD drift while a sibling worktree is registered", () => {
    const cwd = seedRepo();
    const sibling = `${cwd}-sibling`;
    try {
      git(cwd, ["worktree", "add", "-b", "sibling", sibling]);
      const before = snapshotCheckout(cwd);
      writeFileSync(join(cwd, "README.md"), "two\n");
      git(cwd, ["add", "README.md"]);
      git(cwd, ["commit", "-m", "source advance"]);
      const drift = describeCheckoutDrift(before, snapshotCheckout(cwd));
      expect(drift.some((line) => line.startsWith("HEAD"))).toBe(true);
    } finally {
      rmSync(sibling, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("still detects a tag leak while a sibling worktree is registered", () => {
    const cwd = seedRepo();
    const sibling = `${cwd}-sibling`;
    try {
      git(cwd, ["worktree", "add", "-b", "sibling", sibling]);
      const before = snapshotCheckout(cwd);
      git(cwd, ["tag", "test-leak"]);
      expect(describeCheckoutDrift(before, snapshotCheckout(cwd))).toContain("heads/tags ändrades");
    } finally {
      rmSync(sibling, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("still detects an unowned branch leak while a sibling worktree is registered", () => {
    const cwd = seedRepo();
    const sibling = `${cwd}-sibling`;
    try {
      git(cwd, ["worktree", "add", "-b", "sibling", sibling]);
      const before = snapshotCheckout(cwd);
      git(cwd, ["branch", "test-leak"]);
      expect(describeCheckoutDrift(before, snapshotCheckout(cwd))).toContain("heads/tags ändrades");
    } finally {
      rmSync(sibling, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("detects a tag leak when refs are exclusive", () => {
    const cwd = seedRepo();
    try {
      const before = snapshotCheckout(cwd);
      git(cwd, ["tag", "test-leak"]);
      expect(describeCheckoutDrift(before, snapshotCheckout(cwd))).toContain("heads/tags ändrades");
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
