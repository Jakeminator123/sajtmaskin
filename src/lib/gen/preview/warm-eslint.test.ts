import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runPreVmEslint,
  formatEslintIssuesForRepair,
} from "./warm-eslint";

// Use PID + random suffix to avoid collisions across test-workers and parallel
// runs (esp. on Windows CI where tmpdir is shared and the full gen suite
// exercises ~90+ files concurrently).
function makeCacheDir(name: string): string {
  const unique = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = join(tmpdir(), "sajtmaskin-test-warm-eslint", `${name}-${unique}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("runPreVmEslint", () => {
  const originalFlag = process.env.SAJTMASKIN_BLOCKING_ESLINT;

  beforeEach(() => {
    delete process.env.SAJTMASKIN_BLOCKING_ESLINT;
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.SAJTMASKIN_BLOCKING_ESLINT;
    } else {
      process.env.SAJTMASKIN_BLOCKING_ESLINT = originalFlag;
    }
  });

  it("skips when feature flag is disabled (default)", async () => {
    const result = await runPreVmEslint({
      scaffoldId: "landing-page",
      files: [{ path: "app/page.tsx", content: "export default () => null;", language: "tsx" }],
    });
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe("feature_flag_disabled");
    expect(result.issues).toEqual([]);
  });

  it("skips with no_files when file list is empty", async () => {
    const result = await runPreVmEslint({
      scaffoldId: "landing-page",
      files: [],
      force: true,
    });
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe("no_files");
  });

  it("reports cache_cold when cache dir has no node_modules / eslint config", async () => {
    const cacheDir = makeCacheDir("cold-cache");
    try {
      const result = await runPreVmEslint({
        scaffoldId: "landing-page",
        files: [{ path: "app/page.tsx", content: "export default () => null;", language: "tsx" }],
        force: true,
        cacheDirOverride: cacheDir,
      });
      expect(result.ok).toBe(true);
      expect(result.skipped).toBe("cache_cold");
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it("reports cache_cold when node_modules exists but no eslint.config.* file", async () => {
    const cacheDir = makeCacheDir("partial-cache");
    mkdirSync(join(cacheDir, "node_modules"), { recursive: true });
    try {
      const result = await runPreVmEslint({
        scaffoldId: "landing-page",
        files: [{ path: "app/page.tsx", content: "export default () => null;", language: "tsx" }],
        force: true,
        cacheDirOverride: cacheDir,
      });
      expect(result.ok).toBe(true);
      expect(result.skipped).toBe("cache_cold");
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it("runs when cache is warm with eslint.config.mjs (spawn may fail fail-open)", async () => {
    const cacheDir = makeCacheDir("warm-cache");
    mkdirSync(join(cacheDir, "node_modules"), { recursive: true });
    writeFileSync(join(cacheDir, "eslint.config.mjs"), "export default [];", "utf8");
    try {
      const result = await runPreVmEslint({
        scaffoldId: "landing-page",
        files: [{ path: "app/page.tsx", content: "export default () => null;", language: "tsx" }],
        force: true,
        cacheDirOverride: cacheDir,
      });
      // Without a real eslint install the spawn will typically fail the gate
      // with `eslint_unavailable` (exit != 0 + no parseable output). The
      // contract: fail-open, never throw, never block the finalize pipeline.
      expect(result.ok).toBe(true);
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });
});

describe("formatEslintIssuesForRepair", () => {
  it("formats issues with file:line:col + rule suffix", () => {
    const lines = formatEslintIssuesForRepair([
      {
        file: "components/Overlay.tsx",
        line: 42,
        column: 5,
        severity: "error",
        ruleId: "react-hooks/set-state-in-effect",
        message: "Calling setState synchronously within an effect",
      },
      {
        file: "lib/utils.ts",
        line: null,
        column: null,
        severity: "warning",
        ruleId: null,
        message: "Unused import",
      },
    ]);
    expect(lines[0]).toContain("components/Overlay.tsx:42:5");
    expect(lines[0]).toContain("error:");
    expect(lines[0]).toContain("[react-hooks/set-state-in-effect]");
    expect(lines[1]).toContain("lib/utils.ts");
    expect(lines[1]).toContain("warning:");
    expect(lines[1]).not.toContain("[");
  });

  it("caps at 40 issues", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({
      file: `file${i}.ts`,
      line: i,
      column: 1,
      severity: "error" as const,
      ruleId: null,
      message: "err",
    }));
    expect(formatEslintIssuesForRepair(many)).toHaveLength(40);
  });
});
