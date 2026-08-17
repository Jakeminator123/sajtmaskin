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
    finalProjectFiles: 10,
    generatedSurfaceFiles: 4,
    scaffoldId: "landing-page",
    variantId: "corporate-grid",
    promptSize: {
      totalChars: 40_000,
      totalEstimatedTokens: 12_000,
      staticCoreChars: 30_000,
      staticCoreEstimatedTokens: 9_375,
      dynamicContextChars: 10_000,
      dynamicContextEstimatedTokens: 3_125,
      dynamicBudgetUsedTokens: 3_125,
      dynamicBudgetBudgetTokens: 30_000,
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
        evaluated: 1,
        skipped: 0,
        providerErrors: 0,
        infraErrors: 0,
        suiteAborted: false,
        notRun: 0,
        abortedAfterPromptId: null,
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
        evaluated: 0,
        skipped: 1,
        providerErrors: 0,
        infraErrors: 1,
        suiteAborted: false,
        notRun: 0,
        abortedAfterPromptId: null,
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

  it("prints prompt budget breakdown and largest block details", () => {
    const report: EvalReport = {
      timestamp: "2026-04-03T12:00:00.000Z",
      model: "gpt-5.4",
      results: [
        evalResult({
          promptSize: {
            totalChars: 91_000,
            totalEstimatedTokens: 28_438,
            staticCoreChars: 49_000,
            staticCoreEstimatedTokens: 15_313,
            dynamicContextChars: 42_000,
            dynamicContextEstimatedTokens: 13_125,
            dynamicBudgetUsedTokens: 13_125,
            dynamicBudgetBudgetTokens: 30_000,
            droppedBlocks: 1,
            largestBlocks: [
              {
                title: "Selected Dossier Instructions",
                chars: 8_900,
                estimatedTokens: 2_782,
                kept: true,
                required: false,
              },
            ],
          },
        }),
      ],
      summary: {
        total: 1,
        passed: 0,
        evaluated: 1,
        skipped: 0,
        providerErrors: 0,
        infraErrors: 0,
        suiteAborted: false,
        notRun: 0,
        abortedAfterPromptId: null,
        avgScore: 0.6,
        avgTimeMs: 900,
        blockingFailures: 1,
        blockingCheckCounts: {
          "tier2-readiness": 1,
        },
      },
    };

    const output = formatEvalReport(report);
    expect(output).toContain("28.4k tok/over");
    expect(output).toContain("static=49k");
    expect(output).toContain("budget=13125/30000t");
    expect(output).toContain("Surface/Final");
    expect(output).toContain("files=surface:4 final:10");
    expect(output).toContain("Selected Dossier Instructions 8900c/~2782t");
  });

  it("prints suite abort and not-run count instead of treating remaining prompts as FAIL", () => {
    const report: EvalReport = {
      timestamp: "2026-08-17T12:00:00.000Z",
      model: "gpt-5.5",
      results: [
        evalResult({
          promptId: "coffee-shop",
          generationStatus: "skipped",
          failureStage: "provider_error",
          totalScore: 0,
          passed: false,
          blockingChecks: [],
          checks: [
            {
              name: "provider_error",
              passed: false,
              message: "OpenAI-krediten är slut. [credit_balance_exhausted]",
              score: 0,
            },
          ],
        }),
        evalResult({
          promptId: "dashboard",
          generationStatus: "skipped",
          failureStage: "suite_aborted",
          totalScore: 0,
          passed: false,
          blockingChecks: [],
          checks: [
            {
              name: "suite_aborted",
              passed: false,
              message: "Suite aborted after coffee-shop: remaining prompts were not submitted.",
              score: 0,
            },
          ],
        }),
      ],
      summary: {
        total: 2,
        passed: 0,
        evaluated: 0,
        skipped: 2,
        providerErrors: 1,
        infraErrors: 0,
        suiteAborted: true,
        notRun: 1,
        abortedAfterPromptId: "coffee-shop",
        avgScore: 0,
        avgTimeMs: 0,
        blockingFailures: 0,
        blockingCheckCounts: {},
      },
    };

    const output = formatEvalReport(report);
    expect(output).toContain("Suite aborted after coffee-shop");
    expect(output).toContain("1 prompt(s) were never submitted");
    expect(output).toContain("not run 1");
    expect(output).toContain("ABORTED");
    expect(output).not.toMatch(/\| FAIL\s+\|/);
  });
});
