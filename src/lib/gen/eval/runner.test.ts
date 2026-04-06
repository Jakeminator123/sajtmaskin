import { describe, expect, it } from "vitest";
import { resolveEvalPassOutcome } from "./runner";
import type { CheckResult } from "./checks";

function makeCheck(
  name: string,
  passed: boolean,
  score: number,
  message = "",
): CheckResult {
  return { name, passed, score, message };
}

describe("resolveEvalPassOutcome", () => {
  it("fails when a critical readiness check fails even if total score is acceptable", () => {
    const result = resolveEvalPassOutcome({
      checks: [
        makeCheck("project-sanity", false, 0, "dependency risk"),
        makeCheck("tier2-readiness", true, 1, "ok"),
        makeCheck("responsive", true, 1, "ok"),
      ],
      shouldCompile: false,
      totalScore: 0.67,
    });

    expect(result.passed).toBe(false);
    expect(result.blockingChecks).toEqual(["project-sanity"]);
  });

  it("fails when SEO publish-readiness reports blocking metadata errors", () => {
    const result = resolveEvalPassOutcome({
      checks: [
        makeCheck("project-sanity", true, 1, "ok"),
        makeCheck("tier2-readiness", true, 1, "ok"),
        makeCheck(
          "seo-publish-readiness",
          false,
          0,
          "app/layout.tsx: Layouten saknar export av metadata för title/description.",
        ),
      ],
      shouldCompile: false,
      totalScore: 0.7,
    });

    expect(result.passed).toBe(false);
    expect(result.blockingChecks).toContain("seo-publish-readiness");
  });

  it("fails when syntax is required and syntax check fails", () => {
    const result = resolveEvalPassOutcome({
      checks: [
        makeCheck("project-sanity", true, 1, "ok"),
        makeCheck("tier2-readiness", true, 1, "ok"),
        makeCheck("syntax", false, 0, "syntax failed"),
      ],
      shouldCompile: true,
      totalScore: 0.7,
    });

    expect(result.passed).toBe(false);
    expect(result.blockingChecks).toContain("syntax");
  });

  it("fails when required structural checks fail even if total score is acceptable", () => {
    const result = resolveEvalPassOutcome({
      checks: [
        makeCheck("project-sanity", true, 1, "ok"),
        makeCheck("tier2-readiness", true, 1, "ok"),
        makeCheck("required-files", false, 0.5, "missing app/layout.tsx"),
        makeCheck("responsive", true, 1, "ok"),
      ],
      shouldCompile: false,
      totalScore: 0.88,
    });

    expect(result.passed).toBe(false);
    expect(result.blockingChecks).toContain("required-files");
  });

  it("passes when critical checks pass and score clears threshold", () => {
    const result = resolveEvalPassOutcome({
      checks: [
        makeCheck("project-sanity", true, 1, "ok"),
        makeCheck("tier2-readiness", true, 1, "ok"),
        makeCheck("no-bracket-placeholders", true, 1, "ok"),
        makeCheck("responsive", true, 0.8, "ok"),
      ],
      shouldCompile: false,
      totalScore: 0.95,
    });

    expect(result.passed).toBe(true);
    expect(result.blockingChecks).toEqual([]);
  });
});
