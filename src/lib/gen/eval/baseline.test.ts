import { describe, expect, it } from "vitest";
import type { EvalBaseline } from "./baseline";
import { compareWithBaseline } from "./baseline";
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

function makeBaseline(): EvalBaseline {
  return {
    timestamp: "2026-04-03T00:00:00.000Z",
    model: "gpt-5.4",
    results: [
      {
        promptId: "coffee-shop",
        totalScore: 0.8,
        passed: true,
        blockingChecks: [],
        fileCount: 4,
        generationTimeMs: 1000,
      },
      {
        promptId: "dashboard",
        totalScore: 0.5,
        passed: false,
        blockingChecks: ["syntax"],
        fileCount: 6,
        generationTimeMs: 1200,
      },
    ],
    summary: {
      total: 2,
      passed: 1,
      avgScore: 0.65,
      avgTimeMs: 1100,
      blockingFailures: 1,
      blockingCheckCounts: {
        syntax: 1,
      },
    },
  };
}

function makeReport(): EvalReport {
  return {
    timestamp: "2026-04-03T01:00:00.000Z",
    model: "gpt-5.4",
    results: [
      evalResult({
        promptId: "coffee-shop",
        generationTimeMs: 900,
        fileCount: 4,
        totalScore: 0.6,
        passed: false,
        blockingChecks: ["tier2-readiness"],
      }),
      evalResult({
        promptId: "dashboard",
        generationTimeMs: 1100,
        fileCount: 6,
        totalScore: 0.7,
        passed: true,
        blockingChecks: [],
      }),
    ],
    summary: {
      total: 2,
      passed: 1,
      avgScore: 0.65,
      avgTimeMs: 1000,
      blockingFailures: 1,
      blockingCheckCounts: {
        "tier2-readiness": 1,
      },
    },
  };
}

describe("compareWithBaseline", () => {
  it("treats PASS to FAIL flips as hard regressions", () => {
    const comparison = compareWithBaseline(makeReport(), makeBaseline());
    expect(comparison.passRegressions).toEqual([
      {
        promptId: "coffee-shop",
        baselinePassed: true,
        currentPassed: false,
      },
    ]);
    expect(comparison.gateResult).toBe("fail");
  });

  it("tracks FAIL to PASS as improvements", () => {
    const comparison = compareWithBaseline(makeReport(), makeBaseline());
    expect(comparison.passImprovements).toEqual([
      {
        promptId: "dashboard",
        baselinePassed: false,
        currentPassed: true,
      },
    ]);
  });

  it("tracks newly introduced blocking checks as warning-level regressions even without PASS -> FAIL", () => {
    const report = makeReport();
    report.results[0] = {
      ...report.results[0],
      passed: true,
      totalScore: 0.8,
      blockingChecks: [],
    };
    report.results[1] = {
      ...report.results[1],
      passed: false,
      totalScore: 0.55,
      blockingChecks: ["syntax", "tier2-readiness"],
    };

    const comparison = compareWithBaseline(report, makeBaseline());
    expect(comparison.blockingCheckRegressions).toEqual([
      {
        promptId: "dashboard",
        added: ["tier2-readiness"],
      },
    ]);
    expect(comparison.gateResult).toBe("warning");
  });

  it("tracks removed blocking checks as improvements", () => {
    const report = makeReport();
    report.results[1] = {
      ...report.results[1],
      passed: false,
      totalScore: 0.55,
      blockingChecks: [],
    };

    const comparison = compareWithBaseline(report, makeBaseline());
    expect(comparison.blockingCheckImprovements).toEqual([
      {
        promptId: "dashboard",
        removed: ["syntax"],
      },
    ]);
  });
});
