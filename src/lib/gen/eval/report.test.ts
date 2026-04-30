import { describe, expect, it } from "vitest";
import { formatEvalReport } from "./report";
import type { EvalReport, EvalResult } from "./runner";

function evalResult(overrides: Partial<EvalResult>): EvalResult {
  return {
    promptId: "coffee-shop",
    generationStatus: "passed",
    failureStage: null,
    generationTimeMs: 900,
    fileCount: 4,
    scaffoldId: "landing-page",
    variantId: "corporate-grid",
    promptSize: {
      totalChars: 40_000,
      totalEstimatedTokens: 12_000,
      dynamicContextChars: 10_000,
      droppedBlocks: 0,
      largestBlocks: [],
    },
    preflight: {
      errors: 0,
      warnings: 0,
      previewBlocked: false,
      previewBlockingReason: null,
    },
    droppedProtectedPaths: [],
    checks: [],
    totalScore: 0.6,
    passed: false,
    blockingChecks: ["tier2-readiness"],
    ...overrides,
  };
}

describe("formatEvalReport", () => {
  it("prints blocking failure summary when blockers exist", () => {
    const report: EvalReport = {
      timestamp: "2026-04-03T12:00:00.000Z",
      model: "gpt-5.4",
      results: [
        evalResult({}),
      ],
      summary: {
        total: 1,
        passed: 0,
        avgScore: 0.6,
        avgTimeMs: 900,
        blockingFailures: 1,
        blockingCheckCounts: {
          "tier2-readiness": 1,
        },
      },
    };

    const output = formatEvalReport(report);
    expect(output).toContain("Blocking failures: 1/1");
    expect(output).toContain("Top blockers: tier2-readiness (1)");
  });

  it("prints env preflight failures separately from generation timing", () => {
    const report: EvalReport = {
      timestamp: "2026-04-03T12:00:00.000Z",
      model: "gpt-5.4",
      results: [
        evalResult({
          generationStatus: "skipped",
          failureStage: "preflight_env",
          generationTimeMs: 0,
          preflight: {
            errors: 1,
            warnings: 0,
            previewBlocked: true,
            previewBlockingReason: "failed_env",
          },
          checks: [
            {
              name: "preflight_env",
              passed: false,
              message: "preflight=failed_env: missing database connection string",
              score: 0,
            },
          ],
          blockingChecks: ["preflight_env"],
        }),
      ],
      summary: {
        total: 1,
        passed: 0,
        avgScore: 0,
        avgTimeMs: 0,
        blockingFailures: 1,
        blockingCheckCounts: {
          preflight_env: 1,
        },
      },
    };

    const output = formatEvalReport(report);
    expect(output).toContain("failed_env");
    expect(output).toContain("skipped");
    expect(output).toContain("Top blockers: preflight_env (1)");
  });
});
