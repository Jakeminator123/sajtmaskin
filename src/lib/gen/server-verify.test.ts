import { describe, expect, it } from "vitest";
import { resolveServerRepairEarlyStopReason } from "./server-repair-policy";
import {
  buildServerVerifyQualityGateMeta,
  buildServerVerifyRepairContextLines,
  buildServerRepairOutcomeMeta,
  compactVisualQAForQualityGateLog,
} from "./server-verify-log-meta";

describe("resolveServerRepairEarlyStopReason", () => {
  it("stops when the fixer produced no output", () => {
    expect(
      resolveServerRepairEarlyStopReason({
        fixerProducedOutput: false,
        errorsBefore: 3,
        errorsAfter: 3,
      }),
    ).toBe("fixer_noop");
  });

  it("stops when error count does not improve", () => {
    expect(
      resolveServerRepairEarlyStopReason({
        fixerProducedOutput: true,
        errorsBefore: 2,
        errorsAfter: 2,
      }),
    ).toBe("no_improvement");
  });

  it("continues when error count improves", () => {
    expect(
      resolveServerRepairEarlyStopReason({
        fixerProducedOutput: true,
        errorsBefore: 3,
        errorsAfter: 1,
      }),
    ).toBe("continue");
  });
});

describe("buildServerVerifyQualityGateMeta", () => {
  it("includes verify-lane timing and per-check duration metadata", () => {
    expect(
      buildServerVerifyQualityGateMeta({
        passed: false,
        results: [
          {
            check: "build",
            passed: false,
            exitCode: 1,
            output: "Build failed",
            durationMs: 1800,
          },
        ],
        verifyLaneDurationMs: 3200,
        firstFailureCheck: "build",
        jobStartedAt: "2026-04-03T12:00:00.000Z",
        jobFinishedAt: "2026-04-03T12:00:03.200Z",
      }),
    ).toEqual({
      passed: false,
      checks: [
        {
          check: "build",
          passed: false,
          exitCode: 1,
          durationMs: 1800,
        },
      ],
      durationMs: 3200,
      verifyLaneDurationMs: 3200,
      firstFailureCheck: "build",
      jobStartedAt: "2026-04-03T12:00:00.000Z",
      jobFinishedAt: "2026-04-03T12:00:03.200Z",
      serverOwned: true,
    });
  });

  it("includes repass metadata without inventing a passed flag", () => {
    expect(
      buildServerVerifyQualityGateMeta({
        results: null,
        verifyLaneDurationMs: 0,
        firstFailureCheck: null,
        jobStartedAt: null,
        jobFinishedAt: null,
        repass: true,
        method: "deterministic",
        promoted: false,
      }),
    ).toEqual({
      checks: null,
      durationMs: 0,
      verifyLaneDurationMs: 0,
      firstFailureCheck: null,
      jobStartedAt: null,
      jobFinishedAt: null,
      serverOwned: true,
      repass: true,
      method: "deterministic",
      promoted: false,
    });
  });

  it("includes compact visual QA when provided", () => {
    expect(
      buildServerVerifyQualityGateMeta({
        passed: true,
        results: [
          {
            check: "typecheck",
            passed: true,
            exitCode: 0,
            output: "",
            durationMs: 400,
          },
        ],
        verifyLaneDurationMs: 900,
        firstFailureCheck: null,
        jobStartedAt: "2026-04-03T12:00:00.000Z",
        jobFinishedAt: "2026-04-03T12:00:00.900Z",
        serverOwned: false,
        visualQA: {
          overallScore: 72,
          passed: true,
          screenshotCaptured: false,
          checks: [
            { check: "hero", passed: true, score: 80 },
            { check: "metadata", passed: false, score: 40 },
          ],
        },
      }),
    ).toEqual({
      passed: true,
      checks: [
        {
          check: "typecheck",
          passed: true,
          exitCode: 0,
          durationMs: 400,
        },
      ],
      durationMs: 900,
      verifyLaneDurationMs: 900,
      firstFailureCheck: null,
      jobStartedAt: "2026-04-03T12:00:00.000Z",
      jobFinishedAt: "2026-04-03T12:00:00.900Z",
      serverOwned: false,
      visualQA: {
        overallScore: 72,
        passed: true,
        screenshotCaptured: false,
        checks: [
          { check: "hero", passed: true, score: 80 },
          { check: "metadata", passed: false, score: 40 },
        ],
      },
    });
  });
});

describe("compactVisualQAForQualityGateLog", () => {
  it("strips detail strings and keeps scores", () => {
    expect(
      compactVisualQAForQualityGateLog({
        overallScore: 65,
        passed: true,
        screenshotCaptured: false,
        checks: [
          { check: "a", passed: true, score: 90, detail: "long detail text" },
          { check: "b", passed: false, score: 40, detail: "more detail" },
        ],
      }),
    ).toEqual({
      overallScore: 65,
      passed: true,
      screenshotCaptured: false,
      checks: [
        { check: "a", passed: true, score: 90 },
        { check: "b", passed: false, score: 40 },
      ],
    });
  });
});

describe("buildServerVerifyRepairContextLines", () => {
  it("includes verify summary lines before individual failed checks", () => {
    expect(
      buildServerVerifyRepairContextLines({
        failedOutputs: [
          {
            check: "build",
            exitCode: 1,
            output: "Build failed",
            durationMs: 1800,
          },
        ],
        verifyLaneDurationMs: 3200,
        firstFailureCheck: "build",
        jobStartedAt: "2026-04-03T12:00:00.000Z",
        jobFinishedAt: "2026-04-03T12:00:03.200Z",
      }),
    ).toEqual([
      "[verify] first failure: build",
      "[verify] total duration: 3200ms",
      "[verify] started: 2026-04-03T12:00:00.000Z",
      "[verify] finished: 2026-04-03T12:00:03.200Z",
      "[build] verify failed (exit 1, 1800ms)",
    ]);
  });

  it("omits optional fields while still describing failed checks", () => {
    expect(
      buildServerVerifyRepairContextLines({
        failedOutputs: [
          {
            check: "typecheck",
            exitCode: 2,
            output: "TypeScript failed",
            durationMs: null,
          },
        ],
        verifyLaneDurationMs: 0,
        firstFailureCheck: null,
        jobStartedAt: null,
        jobFinishedAt: null,
      }),
    ).toEqual(["[typecheck] verify failed (exit 2)"]);
  });
});

describe("buildServerRepairOutcomeMeta", () => {
  it("keeps verify-lane timing metadata on server-repair outcome logs", () => {
    expect(
      buildServerRepairOutcomeMeta({
        method: "llm",
        llmPasses: 2,
        repaired: false,
        remainingErrors: 3,
        earlyStopReason: "no_improvement",
        verifyLaneDurationMs: 3200,
        firstFailureCheck: "build",
        jobStartedAt: "2026-04-03T12:00:00.000Z",
        jobFinishedAt: "2026-04-03T12:00:03.200Z",
      }),
    ).toEqual({
      method: "llm",
      llmPasses: 2,
      repaired: false,
      remainingErrors: 3,
      earlyStopReason: "no_improvement",
      durationMs: 3200,
      verifyLaneDurationMs: 3200,
      firstFailureCheck: "build",
      jobStartedAt: "2026-04-03T12:00:00.000Z",
      jobFinishedAt: "2026-04-03T12:00:03.200Z",
      serverOwned: true,
    });
  });

  it("falls back to nullish verify metadata when no context exists", () => {
    expect(
      buildServerRepairOutcomeMeta({
        method: "deterministic",
        llmPasses: 0,
        repaired: true,
        verifyLaneDurationMs: 0,
        firstFailureCheck: null,
        jobStartedAt: null,
        jobFinishedAt: null,
      }),
    ).toEqual({
      method: "deterministic",
      llmPasses: 0,
      repaired: true,
      remainingErrors: undefined,
      earlyStopReason: undefined,
      durationMs: 0,
      verifyLaneDurationMs: 0,
      firstFailureCheck: null,
      jobStartedAt: null,
      jobFinishedAt: null,
      serverOwned: true,
    });
  });
});
