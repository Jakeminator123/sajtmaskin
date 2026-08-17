import { describe, expect, it } from "vitest";
import {
  canonicalExitCode,
  codegenLaneFromRun,
  followupLaneFromResults,
  parseCanonicalEvalArgs,
  resolveCanonicalOutcome,
  shouldSaveBaseline,
  toCanonicalJson,
  type CanonicalEvalResult,
} from "./canonical";
import type { FollowUpEvalResult } from "./follow-up-context";

describe("parseCanonicalEvalArgs", () => {
  it("defaults to the free lanes — no codegen, no env gate", () => {
    expect(parseCanonicalEvalArgs([])).toMatchObject({
      mode: "free",
      json: false,
      gate: false,
      saveBaseline: false,
      promptIds: null,
    });
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

describe("lane + json projection", () => {
  it("does not invent a combined percentage across lanes", () => {
    const followup = followupLaneFromResults([
      { id: "a", passed: true } as FollowUpEvalResult,
      { id: "b", passed: false } as FollowUpEvalResult,
    ]);
    expect(followup.outcome).toBe("fail");
    expect(followup.passed).toBe(1);

    const codegen = codegenLaneFromRun("skipped", null, 0);
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
    expect((json.lanes as { codegen: { outcome: string } }).codegen.outcome).toBe("SKIPPED");
  });
});
