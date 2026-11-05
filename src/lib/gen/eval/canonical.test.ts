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
  toCanonicalJson,
  type CanonicalEvalDeps,
  type CanonicalEvalResult,
} from "./canonical";
import type { FollowUpEvalResult } from "./follow-up-context";
import type { ScaffoldEvalReport } from "@/lib/gen/scaffolds/scaffold-eval";
import type { EvalReport } from "./runner";
import type { AuditLatencyReport } from "./audit-latency";

describe("parseCanonicalEvalArgs", () => {
  it("requires an explicit URL list for paid audit latency", () => {
    expect(parseCanonicalEvalArgs(["--audit-latency=https://example.com,https://example.org", "--json", "--dump-files=all"])).toMatchObject({
      mode: "audit-latency", auditUrls: ["https://example.com", "https://example.org"], json: true, dumpMode: "all", force: false,
    });
    expect(parseCanonicalEvalArgs(["--audit-latency", "https://example.com"]).auditUrls).toEqual(["https://example.com"]);
    for (const flags of [["--audit-latency"], ["--audit-latency="], ["--audit-latency", "--json"], ["--audit-latency=a,b,c"]]) {
      expect(() => parseCanonicalEvalArgs(flags)).toThrow(/one or two explicit URLs/);
    }
  });

  it.each(["--codegen", "--smoke", "--full", "--prompts=coffee-shop", "--force"])("cannot combine audit latency with %s", (flag) => {
    expect(() => parseCanonicalEvalArgs(["--audit-latency=https://example.com", flag])).toThrow(/cannot be combined/);
  });
  it("defaults to the free lanes — no codegen, no env gate", () => {
    expect(parseCanonicalEvalArgs([])).toMatchObject({
      mode: "free",
      json: false,
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

  it("rejects the removed gate flags instead of implying a paid run", () => {
    expect(() => parseCanonicalEvalArgs(["--gate"])).toThrow(/removed/);
    expect(() => parseCanonicalEvalArgs(["--save-baseline"])).toThrow(/removed/);
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

describe("opt-in audit latency lane", () => {
  const auditReport: AuditLatencyReport = {
    timestamp: "2026-11-03T00:00:00.000Z", outcome: "pass", preflight: "ready",
    suiteAborted: false, abortedAfter: null, skippedRuns: [],
    cases: [], artifactDir: null, qualityAcceptance: "manual_review_required",
  };

  function deps(scaffoldPass = true) {
    return {
      ...fakeEvalDeps({ followupPass: true, scaffoldPass, runCodegen: vi.fn() }),
      runAuditLatency: vi.fn(async () => auditReport),
    };
  }

  it("keeps the normal free JSON contract and never calls either paid lane", async () => {
    const dependencies = deps();
    const { result } = await runCanonicalEval({ mode: "free", deps: dependencies, print: () => undefined });
    expect(dependencies.runAuditLatency).not.toHaveBeenCalled();
    expect(dependencies.runCodegen).not.toHaveBeenCalled();
    expect(Object.keys(toCanonicalJson(result).lanes as object)).toEqual(["followup", "scaffold", "codegen"]);
  });

  it("blocks all paid audits after a failed free lane", async () => {
    const dependencies = deps(false);
    const { result } = await runCanonicalEval({ mode: "audit-latency", auditUrls: ["https://example.com"], deps: dependencies, print: () => undefined });
    expect(dependencies.runAuditLatency).not.toHaveBeenCalled();
    expect(dependencies.runCodegen).not.toHaveBeenCalled();
    expect(result.outcome).toBe("fail");
    expect(result.lanes.auditLatency).toMatchObject({ outcome: "skipped", skipReason: "blocked_by_failed_free_lane", report: null });
  });

  it("runs the audit lane alone after free lanes pass and preserves provider/infra precedence", async () => {
    const dependencies = deps();
    dependencies.runAuditLatency.mockResolvedValue({ ...auditReport, outcome: "provider_error" });
    const { result } = await runCanonicalEval({ mode: "audit-latency", auditUrls: ["https://example.com"], dumpMode: "all", deps: dependencies, print: () => undefined });
    expect(dependencies.runCodegen).not.toHaveBeenCalled();
    expect(dependencies.runAuditLatency).toHaveBeenCalledOnce();
    expect(dependencies.runAuditLatency).toHaveBeenCalledWith(expect.objectContaining({ urls: ["https://example.com"], dumpMode: "all" }));
    expect(result.lanes.codegen).toMatchObject({ outcome: "skipped", skipReason: "audit_latency_mode" });
    expect(toCanonicalJson(result)).toMatchObject({ outcome: "PROVIDER_ERROR", exitCode: 2, lanes: { auditLatency: { outcome: "PROVIDER_ERROR", skipReason: null } } });
    expect(resolveCanonicalOutcome({ followup: "pass", scaffold: "pass", codegen: "skipped", auditLatency: "infra_error" })).toBe("infra_error");
  });

  it("rejects unsafe URLs and programmatic force/prompts before even running free lanes", async () => {
    const dependencies = deps();
    dependencies.runFollowUp = vi.fn();
    for (const options of [{ force: true }, { promptIds: ["coffee-shop"] }, { auditUrls: ["http://127.0.0.1"] }]) {
      await expect(runCanonicalEval({ mode: "audit-latency", auditUrls: ["https://example.com"], ...options, deps: dependencies })).rejects.toThrow();
    }
    expect(dependencies.runFollowUp).not.toHaveBeenCalled();
    expect(dependencies.runAuditLatency).not.toHaveBeenCalled();
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
