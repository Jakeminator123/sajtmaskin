import { describe, expect, it, vi } from "vitest";
import {
  SCAFFOLD_LANE_MIN_KEYWORD_TOP1_PERCENT,
  canonicalExitCode,
  codegenLaneFromRun,
  followupLaneFromResults,
  parseCanonicalEvalArgs,
  resolveCanonicalOutcome,
  resolveCodegenPlan,
  runCanonicalEval,
  scaffoldLaneFromReport,
  shouldSaveBaseline,
  toCanonicalJson,
  type CanonicalEvalDeps,
  type CanonicalEvalResult,
} from "./canonical";
import type { FollowUpEvalResult } from "./follow-up-context";
import type { ScaffoldEvalReport } from "@/lib/gen/scaffolds/scaffold-eval";
import type { EvalReport } from "./runner";

describe("parseCanonicalEvalArgs", () => {
  it("defaults to the free lanes — no codegen, no env gate", () => {
    expect(parseCanonicalEvalArgs([])).toMatchObject({
      mode: "free",
      json: false,
      gate: false,
      saveBaseline: false,
      force: false,
      promptIds: null,
    });
  });

  it("parses --force without implying a paid run", () => {
    expect(parseCanonicalEvalArgs(["--force"])).toMatchObject({
      mode: "free",
      force: true,
    });
    expect(parseCanonicalEvalArgs(["--codegen", "--force"]).force).toBe(true);
  });

  it("maps --codegen and legacy --smoke to the paid smoke subset", () => {
    expect(parseCanonicalEvalArgs(["--codegen"]).mode).toBe("codegen-smoke");
    expect(parseCanonicalEvalArgs(["--smoke"]).mode).toBe("codegen-smoke");
  });

  it("maps --full to all prompts, even if --codegen is also present", () => {
    expect(parseCanonicalEvalArgs(["--full", "--codegen"]).mode).toBe("codegen-full");
  });

  it("treats leftover --gate / --save-baseline as the full paid suite", () => {
    expect(parseCanonicalEvalArgs(["--gate"]).mode).toBe("codegen-full");
    expect(parseCanonicalEvalArgs(["--save-baseline"]).mode).toBe("codegen-full");
  });

  it("treats --prompts as a paid codegen request", () => {
    const parsed = parseCanonicalEvalArgs(["--prompts=arcade-with-klarna"]);
    expect(parsed.mode).toBe("codegen-smoke");
    expect(parsed.promptIds).toEqual(["arcade-with-klarna"]);
  });

  it("rejects an empty --prompts value instead of falling back to free mode", () => {
    expect(() => parseCanonicalEvalArgs(["--prompts"])).toThrow(/requires at least one prompt id/);
    expect(() => parseCanonicalEvalArgs(["--prompts="])).toThrow(/requires at least one prompt id/);
    expect(() => parseCanonicalEvalArgs(["--prompts=,"])).toThrow(/requires at least one prompt id/);
  });
});

describe("resolveCanonicalOutcome / canonicalExitCode", () => {
  it("lets a codegen provider error outrank free-lane results", () => {
    expect(
      resolveCanonicalOutcome({
        followup: "pass",
        scaffold: "pass",
        codegen: "provider_error",
      }),
    ).toBe("provider_error");
    expect(canonicalExitCode("provider_error")).toBe(2);
  });

  it("fails the run when a free lane fails and codegen was skipped", () => {
    expect(
      resolveCanonicalOutcome({
        followup: "fail",
        scaffold: "pass",
        codegen: "skipped",
      }),
    ).toBe("fail");
    expect(canonicalExitCode("fail")).toBe(1);
  });

  it("passes when free lanes pass and codegen is skipped", () => {
    expect(
      resolveCanonicalOutcome({
        followup: "pass",
        scaffold: "pass",
        codegen: "skipped",
      }),
    ).toBe("pass");
    expect(canonicalExitCode("pass")).toBe(0);
  });
});

describe("shouldSaveBaseline", () => {
  it("does not save a baseline when a free lane already failed", () => {
    expect(
      shouldSaveBaseline({
        saveBaseline: true,
        gateFailed: false,
        codegenBlocked: false,
        followup: "fail",
        scaffold: "pass",
      }),
    ).toBe(false);
    expect(
      shouldSaveBaseline({
        saveBaseline: true,
        gateFailed: false,
        codegenBlocked: false,
        followup: "pass",
        scaffold: "pass",
      }),
    ).toBe(true);
  });
});

function scaffoldReport(
  summary: Partial<ScaffoldEvalReport["summary"]> = {},
): ScaffoldEvalReport {
  return {
    timestamp: "2026-08-17T00:00:00.000Z",
    results: [],
    summary: {
      total: 65,
      keywordTop1Accuracy: 96.92,
      semanticTop1Accuracy: 96.92,
      semanticTop3Accuracy: 96.92,
      genericFallbackRate: 0,
      semanticUnavailableRate: 0,
      appAuthMisclassificationRate: 0,
      previewWhiteRate: null,
      ...summary,
    },
  };
}

describe("scaffoldLaneFromReport", () => {
  const reportPath = "data/scaffold-eval/reports/scaffold-selection-latest.json";

  it("passes when keyword top-1 meets the owner policy, even if semantic ranking degraded", () => {
    const lane = scaffoldLaneFromReport(
      scaffoldReport({
        keywordTop1Accuracy: SCAFFOLD_LANE_MIN_KEYWORD_TOP1_PERCENT,
        semanticTop1Accuracy: 12,
        semanticUnavailableRate: 100,
      }),
      reportPath,
    );

    expect(lane.outcome).toBe("pass");
  });

  it("fails when keyword top-1 is below the owner policy", () => {
    const lane = scaffoldLaneFromReport(
      scaffoldReport({ keywordTop1Accuracy: 12 }),
      reportPath,
    );

    expect(lane.outcome).toBe("fail");
  });
});

describe("lane + json projection", () => {
  it("does not invent a combined percentage across lanes", () => {
    const followup = followupLaneFromResults([
      { id: "a", passed: true } as FollowUpEvalResult,
      { id: "b", passed: false } as FollowUpEvalResult,
    ]);
    expect(followup.outcome).toBe("fail");
    expect(followup.passed).toBe(1);

    const codegen = codegenLaneFromRun("skipped", null, 0, { skipReason: "free_mode" });
    const result: CanonicalEvalResult = {
      timestamp: "2026-08-17T00:00:00.000Z",
      mode: "free",
      outcome: "fail",
      lanes: {
        followup,
        scaffold: {
          name: "scaffold",
          outcome: "pass",
          keywordTop1Accuracy: 80,
          semanticTop1Accuracy: 70,
          semanticTop3Accuracy: 90,
          reportPath: "data/scaffold-eval/reports/scaffold-selection-latest.json",
        },
        codegen,
      },
    };

    const json = toCanonicalJson(result);
    expect(json.outcome).toBe("FAIL");
    expect(json.exitCode).toBe(1);
    expect(json).not.toHaveProperty("avgScore");
    expect((json.lanes as { codegen: { outcome: string; skipReason: string } }).codegen.outcome).toBe(
      "SKIPPED",
    );
    expect(
      (json.lanes as { codegen: { skipReason: string } }).codegen.skipReason,
    ).toBe("free_mode");
  });
});

function fakePassingCodegenReport(): EvalReport {
  return {
    timestamp: "2026-08-17T00:00:00.000Z",
    model: "test",
    results: [],
    summary: {
      total: 1,
      passed: 1,
      evaluated: 1,
      skipped: 0,
      providerErrors: 0,
      infraErrors: 0,
      suiteAborted: false,
      notRun: 0,
      abortedAfterPromptId: null,
      avgScore: 1,
      avgTimeMs: 1,
      blockingFailures: 0,
      blockingCheckCounts: {},
    },
  };
}

function fakeEvalDeps(options: {
  followupPass: boolean;
  scaffoldPass: boolean;
  runCodegen: () => Promise<EvalReport>;
}): CanonicalEvalDeps {
  return {
    runFollowUp: async () =>
      [{ id: "copy-hero-title", passed: options.followupPass } as FollowUpEvalResult],
    runScaffold: async () => ({
      report: scaffoldReport({
        keywordTop1Accuracy: options.scaffoldPass
          ? SCAFFOLD_LANE_MIN_KEYWORD_TOP1_PERCENT
          : 12,
      }),
      reportPath: "data/scaffold-eval/reports/scaffold-selection-latest.json",
    }),
    runCodegen: options.runCodegen,
  };
}

describe("resolveCodegenPlan / paid lane block", () => {
  it("blocks paid codegen when a free lane failed, unless --force", () => {
    expect(
      resolveCodegenPlan({ mode: "codegen-smoke", freeLaneFailed: true, force: false }),
    ).toEqual({ run: false, skipReason: "blocked_by_failed_free_lane" });
    expect(
      resolveCodegenPlan({ mode: "codegen-smoke", freeLaneFailed: true, force: true }),
    ).toEqual({ run: true, forced: true });
    expect(
      resolveCodegenPlan({ mode: "codegen-smoke", freeLaneFailed: false, force: false }),
    ).toEqual({ run: true, forced: false });
    expect(
      resolveCodegenPlan({ mode: "free", freeLaneFailed: false, force: false }),
    ).toEqual({ run: false, skipReason: "free_mode" });
  });

  it("does not call codegen when a free lane failed in a paid mode", async () => {
    const runCodegen = vi.fn(async () => fakePassingCodegenReport());
    const { result } = await runCanonicalEval({
      mode: "codegen-smoke",
      print: () => undefined,
      deps: fakeEvalDeps({ followupPass: true, scaffoldPass: false, runCodegen }),
    });

    expect(runCodegen).not.toHaveBeenCalled();
    expect(result.lanes.codegen.outcome).toBe("skipped");
    expect(result.lanes.codegen.skipReason).toBe("blocked_by_failed_free_lane");
    expect(result.lanes.codegen.forced).toBe(false);
    expect(result.outcome).toBe("fail");
    expect(canonicalExitCode(result.outcome)).toBe(1);
    expect(toCanonicalJson(result).lanes).toMatchObject({
      codegen: { outcome: "SKIPPED", skipReason: "blocked_by_failed_free_lane", forced: false },
    });
  });

  it("runs codegen when --force is set after a failed free lane", async () => {
    const runCodegen = vi.fn(async () => fakePassingCodegenReport());
    const { result } = await runCanonicalEval({
      mode: "codegen-smoke",
      force: true,
      print: () => undefined,
      deps: fakeEvalDeps({ followupPass: true, scaffoldPass: false, runCodegen }),
    });

    expect(runCodegen).toHaveBeenCalledOnce();
    expect(result.lanes.codegen.outcome).toBe("pass");
    expect(result.lanes.codegen.skipReason).toBeNull();
    expect(result.lanes.codegen.forced).toBe(true);
    expect(result.outcome).toBe("fail");
    expect(canonicalExitCode(result.outcome)).toBe(1);
  });

  it("runs codegen as before when free lanes pass", async () => {
    const runCodegen = vi.fn(async () => fakePassingCodegenReport());
    const { result } = await runCanonicalEval({
      mode: "codegen-smoke",
      print: () => undefined,
      deps: fakeEvalDeps({ followupPass: true, scaffoldPass: true, runCodegen }),
    });

    expect(runCodegen).toHaveBeenCalledOnce();
    expect(result.lanes.codegen.outcome).toBe("pass");
    expect(result.lanes.codegen.skipReason).toBeNull();
    expect(result.lanes.codegen.forced).toBe(false);
    expect(result.outcome).toBe("pass");
    expect(canonicalExitCode(result.outcome)).toBe(0);
  });
});
