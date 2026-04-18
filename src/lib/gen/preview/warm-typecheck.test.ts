import { describe, expect, it } from "vitest";
import {
  formatTypecheckDiagnosticsForRepair,
  runPreVmTypecheck,
} from "./warm-typecheck";

describe("runPreVmTypecheck", () => {
  it("skips when feature flag is off and force is not set", async () => {
    const original = process.env.SAJTMASKIN_PRE_VM_TYPECHECK;
    delete process.env.SAJTMASKIN_PRE_VM_TYPECHECK;
    try {
      const result = await runPreVmTypecheck({
        scaffoldId: "landing-page",
        files: [{ path: "app/page.tsx", content: "export default () => null", language: "tsx" }],
      });
      expect(result.skipped).toBe("feature_flag_disabled");
      expect(result.ok).toBe(true);
      expect(result.diagnostics).toEqual([]);
    } finally {
      if (original !== undefined) {
        process.env.SAJTMASKIN_PRE_VM_TYPECHECK = original;
      }
    }
  });

  it("skips when no files are provided even with force=true", async () => {
    const result = await runPreVmTypecheck({
      scaffoldId: "landing-page",
      files: [],
      force: true,
    });
    expect(result.skipped).toBe("no_files");
    expect(result.ok).toBe(true);
  });

  it("returns cache_cold when override directory has no node_modules", async () => {
    const result = await runPreVmTypecheck({
      scaffoldId: "landing-page",
      files: [{ path: "app/page.tsx", content: "export default () => null", language: "tsx" }],
      force: true,
      cacheDirOverride: "/nonexistent/path/that/does/not/exist",
    });
    expect(result.skipped).toBe("cache_cold");
    expect(result.ok).toBe(true);
  });
});

describe("formatTypecheckDiagnosticsForRepair", () => {
  it("formats diagnostics as `path:line:col code: message`", () => {
    const lines = formatTypecheckDiagnosticsForRepair([
      {
        filePath: "app/page.tsx",
        line: 12,
        column: 5,
        code: "TS2304",
        message: "Cannot find name 'useFooBar'.",
      },
    ]);
    expect(lines).toEqual(["app/page.tsx:12:5 TS2304: Cannot find name 'useFooBar'."]);
  });
});
