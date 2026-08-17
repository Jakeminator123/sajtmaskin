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
      evaluated: 2,
      skipped: 0,
      providerErrors: 0,
      infraErrors: 0,
      suiteAborted: false,
      notRun: 0,
      abortedAfterPromptId: null,
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

  it("reports blocking checks as available for a baseline that tracks them", () => {
    const comparison = compareWithBaseline(makeReport(), makeBaseline());
    expect(comparison.blockingCheckComparison).toBe("available");
  });

  /**
   * Regression lock for the 2026-08-17 weekly run: exhausted OpenAI credits made
   * every prompt end as `skipped`, and the comparison read those zeroes as a
   * 14-prompt `PASS -> FAIL` collapse plus a −23.6 % score drop. A prompt that
   * never reached the checks has nothing to compare.
   */
  it("ignores prompts that never reached the checks instead of scoring them as regressions", () => {
    const report = makeReport();
    report.results[0] = evalResult({
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
          message: "OpenAI-kvoten slut. [insufficient_quota]",
          score: 0,
        },
      ],
    });

    const comparison = compareWithBaseline(report, makeBaseline());

    expect(comparison.passRegressions).toEqual([]);
    expect(comparison.regressions.map((r) => r.promptId)).toEqual([]);
    expect(comparison.gateResult).toBe("pass");
  });

  it("does not invent an aggregate regression when a high-scoring prompt is skipped", () => {
    const baseline = makeBaseline();
    baseline.results[0] = { ...baseline.results[0], totalScore: 0.95, passed: true };
    baseline.results[1] = { ...baseline.results[1], totalScore: 0.5, passed: false };
    baseline.summary = { ...baseline.summary, avgScore: 0.725 };

    const report = makeReport();
    report.results[0] = evalResult({
      promptId: "coffee-shop",
      generationStatus: "skipped",
      failureStage: "provider_error",
      totalScore: 0,
      passed: false,
      blockingChecks: [],
    });
    report.results[1] = evalResult({
      promptId: "dashboard",
      totalScore: 0.5,
      passed: false,
      blockingChecks: ["syntax"],
    });
    // Evaluated-only average is 0.5. Compared with baseline.summary.avgScore
    // (0.725) that would be a −31 % drop and a false gate fail.
    report.summary = { ...report.summary, evaluated: 1, skipped: 1, avgScore: 0.5 };

    const comparison = compareWithBaseline(report, baseline);

    expect(comparison.overallDelta).toBeCloseTo(0);
    expect(comparison.regressions).toEqual([]);
    expect(comparison.gateResult).toBe("pass");
  });

  describe("legacy baseline saved before blocking-check tracking (2026-04-03)", () => {
    /**
     * The shape of `eval-baseline.json` as saved 2026-03-18: no
     * `blockingChecks` per result and no blocking fields in `summary`.
     */
    function makeLegacyBaseline(): EvalBaseline {
      return {
        timestamp: "2026-03-18T03:03:00.947Z",
        model: "gpt-5.3-codex",
        results: [
          { promptId: "coffee-shop", totalScore: 0.94, passed: true, fileCount: 5, generationTimeMs: 58_831 },
          { promptId: "dashboard", totalScore: 0.88, passed: true, fileCount: 6, generationTimeMs: 60_000 },
        ],
        summary: { total: 2, passed: 2, avgScore: 0.91, avgTimeMs: 59_415 },
      };
    }

    it("does NOT manufacture new blocking checks out of a missing field", () => {
      // Regression lock: `blockingChecks ?? []` used to make every current
      // blocker look newly added, which turned an invalid-API-key run into a
      // page of "New Blocking Checks" across every scenario.
      const comparison = compareWithBaseline(makeReport(), makeLegacyBaseline());

      expect(comparison.blockingCheckComparison).toBe("unavailable-legacy-baseline");
      expect(comparison.blockingCheckRegressions).toEqual([]);
      expect(comparison.blockingCheckImprovements).toEqual([]);
    });

    it("still reports the score and PASS/FAIL deltas, which ARE comparable", () => {
      const comparison = compareWithBaseline(makeReport(), makeLegacyBaseline());

      expect(comparison.passRegressions).toEqual([
        { promptId: "coffee-shop", baselinePassed: true, currentPassed: false },
      ]);
      expect(comparison.regressions.map((r) => r.promptId)).toEqual(["coffee-shop", "dashboard"]);
      expect(comparison.gateResult).toBe("fail");
    });

    it("does not escalate to warning on the blocking diff alone", () => {
      // A run that only *gained* blockers, with scores and PASS/FAIL held
      // steady, must stay `pass` against a legacy baseline — the blocker delta
      // is unknown, and unknown is not a regression.
      const report = makeReport();
      report.results[0] = { ...report.results[0], passed: true, totalScore: 0.94, blockingChecks: ["tier2-readiness"] };
      report.results[1] = { ...report.results[1], passed: true, totalScore: 0.88, blockingChecks: ["required-files"] };
      report.summary = { ...report.summary, passed: 2, avgScore: 0.91 };

      const comparison = compareWithBaseline(report, makeLegacyBaseline());

      expect(comparison.blockingCheckRegressions).toEqual([]);
      expect(comparison.gateResult).toBe("pass");
    });
  });
});
