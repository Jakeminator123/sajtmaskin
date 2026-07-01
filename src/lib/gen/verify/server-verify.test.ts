import { describe, expect, it } from "vitest";
import {
  isRepairBudgetExhausted,
  resolveFinalGateVerifyBudget,
  resolvePostRepairFinalize,
  resolveServerRepairEarlyStopReason,
} from "./server-repair-policy";
import {
  buildServerVerifyQualityGateMeta,
  buildServerVerifyRepairContextLines,
  buildServerRepairOutcomeMeta,
  compactVisualQAForQualityGateLog,
} from "./server-verify-log-meta";
import {
  DESIGN_PREVIEW_QUALITY_GATE_CHECKS,
  INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS,
  isTypecheckOnlyAdvisory,
  resolvePostRepairGateChecks,
} from "./quality-gate-checks";
import {
  buildGroupedRepairErrorContext,
  buildRepairErrorContextLines,
} from "./repair-loop";

describe("isTypecheckOnlyAdvisory (F2 render-first #330 — shared route/server-verify rule)", () => {
  const fail = (check: string) => ({ check, passed: false });
  const pass = (check: string) => ({ check, passed: true });

  it("is advisory when F2 and the only failing check is typecheck", () => {
    expect(
      isTypecheckOnlyAdvisory({
        isDesignPreview: true,
        gatePassed: false,
        buildOriginated: false,
        results: [fail("typecheck")],
      }),
    ).toBe(true);
  });

  it("is NOT advisory for F3 (integrations) — stays hard", () => {
    expect(
      isTypecheckOnlyAdvisory({
        isDesignPreview: false,
        gatePassed: false,
        buildOriginated: false,
        results: [fail("typecheck")],
      }),
    ).toBe(false);
  });

  it("is NOT advisory when a build/lint check also fails", () => {
    expect(
      isTypecheckOnlyAdvisory({
        isDesignPreview: true,
        gatePassed: false,
        buildOriginated: false,
        results: [pass("typecheck"), fail("build")],
      }),
    ).toBe(false);
  });

  it("is NOT advisory for a build-originated re-verify (build must stay hard)", () => {
    expect(
      isTypecheckOnlyAdvisory({
        isDesignPreview: true,
        gatePassed: false,
        buildOriginated: true,
        results: [fail("typecheck")],
      }),
    ).toBe(false);
  });

  it("is NOT advisory when the gate actually passed (not applicable)", () => {
    expect(
      isTypecheckOnlyAdvisory({
        isDesignPreview: true,
        gatePassed: true,
        buildOriginated: false,
        results: [pass("typecheck")],
      }),
    ).toBe(false);
  });

  it("is NOT advisory when there are no failing checks", () => {
    expect(
      isTypecheckOnlyAdvisory({
        isDesignPreview: true,
        gatePassed: false,
        buildOriginated: false,
        results: [pass("typecheck")],
      }),
    ).toBe(false);
  });
});

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

  it("stops with time budget exceeded when the fixer times out", () => {
    expect(
      resolveServerRepairEarlyStopReason({
        fixerProducedOutput: false,
        errorsBefore: 3,
        errorsAfter: 3,
        timedOut: true,
      }),
    ).toBe("time_budget_exceeded");
  });

  it("stops as no_improvement when the fixer ran but produced byte-identical content", () => {
    expect(
      resolveServerRepairEarlyStopReason({
        fixerProducedOutput: true,
        errorsBefore: 0,
        errorsAfter: 0,
        contentChanged: false,
        gateFailureSignals: 5,
      }),
    ).toBe("no_improvement");
  });

  it("continues in gate-only failure mode (errorsBefore=0, gate failures, content changed)", () => {
    expect(
      resolveServerRepairEarlyStopReason({
        fixerProducedOutput: true,
        errorsBefore: 0,
        errorsAfter: 0,
        contentChanged: true,
        gateFailureSignals: 5,
      }),
    ).toBe("continue");
  });

  it("preserves legacy no_improvement when esbuild was already counting errors", () => {
    expect(
      resolveServerRepairEarlyStopReason({
        fixerProducedOutput: true,
        errorsBefore: 2,
        errorsAfter: 2,
        contentChanged: true,
        gateFailureSignals: 5,
      }),
    ).toBe("no_improvement");
  });
});

describe("isRepairBudgetExhausted (#284 follow-up — wall-clock graceful stop)", () => {
  const deadlineEpochMs = 1_000_000;

  it("never bounds the loop when no deadline is set (back-compat)", () => {
    expect(
      isRepairBudgetExhausted({
        deadlineEpochMs: undefined,
        nowMs: Number.MAX_SAFE_INTEGER,
        nextStepMaxMs: 999_999,
      }),
    ).toBe(false);
  });

  it("allows a step that still fits before the deadline", () => {
    expect(
      isRepairBudgetExhausted({
        deadlineEpochMs,
        nowMs: deadlineEpochMs - 200_000,
        nextStepMaxMs: 100_000,
      }),
    ).toBe(false);
  });

  it("stops a step whose worst-case duration would overrun the deadline", () => {
    // A second LLM pass (fixer + retry) that cannot finish before the route's
    // maxDuration must NOT be started — that is the multi-pass hard-kill case.
    expect(
      isRepairBudgetExhausted({
        deadlineEpochMs,
        nowMs: deadlineEpochMs - 50_000,
        nextStepMaxMs: 100_000,
      }),
    ).toBe(true);
  });

  it("treats an exact fit as allowed (boundary is non-strict)", () => {
    expect(
      isRepairBudgetExhausted({
        deadlineEpochMs,
        nowMs: deadlineEpochMs - 100_000,
        nextStepMaxMs: 100_000,
      }),
    ).toBe(false);
  });

  it("with nextStepMaxMs=0 stops only once past the deadline", () => {
    expect(
      isRepairBudgetExhausted({
        deadlineEpochMs,
        nowMs: deadlineEpochMs,
        nextStepMaxMs: 0,
      }),
    ).toBe(false);
    expect(
      isRepairBudgetExhausted({
        deadlineEpochMs,
        nowMs: deadlineEpochMs + 1,
        nextStepMaxMs: 0,
      }),
    ).toBe(true);
  });

});

// #286 Option A — dynamic, deadline-based verify gate. Resolves BOTH:
//   - Codex P1: a late verify must abort before the route's maxDuration so
//     `finally { releaseVersionLease }` runs. The gate returns an ABSOLUTE
//     deadline; the abort timeout is derived from it at the fetch site
//     (`deadline - Date.now()`), so async prep before the fetch is subtracted.
//   - Bugbot HIGH: the previous full-timeout *reserve* ≈ the loop budget, so the
//     final gate ALWAYS skipped and a manual LLM repair never promoted. The gate
//     must RUN whenever enough budget remains, skipping only under a small floor.
// The "never exceeds the static cap" invariant (c) is enforced at the fetch site
// by `resolvePreviewHostVerifyTimeoutMs` — see preview-host-client.test.ts.
describe("resolveFinalGateVerifyBudget (#286 Option A — dynamic verify deadline)", () => {
  const deadlineEpochMs = 1_000_000;
  const floorMs = 60_000;
  const releaseMarginMs = 5_000;

  it("runs with the static timeout (no deadline) when no bound is set (back-compat)", () => {
    // The server-verify loop passes no deadline — it must keep running the final
    // gate with the client's own static verify timeout (no deadline returned).
    const result = resolveFinalGateVerifyBudget({
      deadlineEpochMs: undefined,
      nowMs: Number.MAX_SAFE_INTEGER,
      floorMs,
      releaseMarginMs,
    });
    expect(result.skip).toBe(false);
    expect(result.verifyDeadlineEpochMs).toBeUndefined();
  });

  it("(a) RUNS with a margin-reserved deadline when partial budget remains", () => {
    // 200s left, well above the 60s floor: the gate must RUN (this is the bug the
    // old always-skip reserve caused). The deadline reserves the release margin
    // and is independent of how much budget is left, so prep is subtracted later.
    const result = resolveFinalGateVerifyBudget({
      deadlineEpochMs,
      nowMs: deadlineEpochMs - 200_000,
      floorMs,
      releaseMarginMs,
    });
    expect(result.skip).toBe(false);
    expect(result.verifyDeadlineEpochMs).toBe(deadlineEpochMs - releaseMarginMs);
    // The returned deadline must be strictly before the route's repair deadline
    // so the verify aborts with margin to release the lease.
    expect(result.verifyDeadlineEpochMs!).toBeLessThan(deadlineEpochMs);
  });

  it("(b) SKIPS gracefully only once remaining budget drops to/under the floor", () => {
    // Just above the floor → still runs.
    expect(
      resolveFinalGateVerifyBudget({
        deadlineEpochMs,
        nowMs: deadlineEpochMs - (floorMs + 1),
        floorMs,
        releaseMarginMs,
      }).skip,
    ).toBe(false);
    // Exactly at the floor → skip (non-strict boundary).
    expect(
      resolveFinalGateVerifyBudget({
        deadlineEpochMs,
        nowMs: deadlineEpochMs - floorMs,
        floorMs,
        releaseMarginMs,
      }).skip,
    ).toBe(true);
    // Below the floor → skip.
    expect(
      resolveFinalGateVerifyBudget({
        deadlineEpochMs,
        nowMs: deadlineEpochMs - 10_000,
        floorMs,
        releaseMarginMs,
      }).skip,
    ).toBe(true);
  });
});

describe("resolvePostRepairFinalize (#260 P2 — repair-vs-edit finalize)", () => {
  it("skips finalize on a stale-base no-op so a concurrent edit B is never failed", () => {
    // A stale-base no-op means a user edit advanced files_json past snapshot A.
    // The version must NOT be failed regardless of the esbuild error count —
    // failing it would finalize the user's newer edit B from a stale repair(A).
    expect(
      resolvePostRepairFinalize({ staleBaseNoOp: true, remainingErrors: 0 }),
    ).toBe("skip_stale_base");
    expect(
      resolvePostRepairFinalize({ staleBaseNoOp: true, remainingErrors: 3 }),
    ).toBe("skip_stale_base");
  });

  it("fails syntax-clean when not stale and no esbuild errors remain", () => {
    expect(
      resolvePostRepairFinalize({ staleBaseNoOp: false, remainingErrors: 0 }),
    ).toBe("fail_syntax_clean");
  });

  it("fails incomplete when esbuild syntax errors remain and not stale", () => {
    expect(
      resolvePostRepairFinalize({ staleBaseNoOp: false, remainingErrors: 2 }),
    ).toBe("fail_incomplete");
  });
});

describe("DESIGN_PREVIEW_QUALITY_GATE_CHECKS", () => {
  it("runs typecheck only for F2 design-preview verification (2026-04-23)", () => {
    // F2 relies on pre-VM warm-tsc + warm-eslint in the Sajtmaskin backend
    // to catch TS/lint errors before files ship to preview-host. On the VM
    // we keep only `typecheck` as a cheap safety net in case the warm cache
    // is cold. See `quality-gate-checks.ts` for rationale + revert path.
    // F3 (`integrationsBuild`) still runs the full `typecheck + build + lint`
    // — that's asserted separately in `manifest-parity.test.ts`.
    expect(DESIGN_PREVIEW_QUALITY_GATE_CHECKS).toEqual(["typecheck"]);
  });
});

describe("resolvePostRepairGateChecks (#260 P2 — build-origin false-green)", () => {
  it("keeps the typecheck-only design-preview lane for non-build repairs", () => {
    expect(resolvePostRepairGateChecks(false)).toEqual(DESIGN_PREVIEW_QUALITY_GATE_CHECKS);
  });

  it("escalates to include `build` when the repair originated from a build failure", () => {
    // A build/preview-start repair must not re-gate with typecheck only: `tsc`
    // can pass while `next build` is still broken, which would false-green a
    // non-building version into `repair_available`/`passed`.
    const checks = resolvePostRepairGateChecks(true);
    expect(checks).toContain("build");
    expect(checks).toContain("typecheck");
  });

  it("keeps F2 behaviour when previewPolicy is fidelity2 (typecheck-only for non-build repairs)", () => {
    expect(resolvePostRepairGateChecks(false, "fidelity2")).toEqual(
      DESIGN_PREVIEW_QUALITY_GATE_CHECKS,
    );
  });

  it("#291 P1: re-gates an F3 repair on the full integrations lane even for a non-build (typecheck) failure", () => {
    // An F3/integrations repair that preserves/re-adds a tier-3 backend SDK
    // import must not be promoted after tsc-only — it has to pass the documented
    // integrations lane (typecheck + build + lint).
    const checks = resolvePostRepairGateChecks(false, "fidelity3");
    expect(checks).toEqual(INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS);
    expect(checks).toContain("build");
    expect(checks).toContain("lint");
    expect(checks).toContain("typecheck");
  });

  it("#291 P1: F3 integrations lane is independent of the build-origin flag", () => {
    expect(resolvePostRepairGateChecks(true, "fidelity3")).toEqual(
      INTEGRATIONS_BUILD_QUALITY_GATE_CHECKS,
    );
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

describe("buildGroupedRepairErrorContext", () => {
  it("groups diagnostics per file and prioritizes dependency hubs", () => {
    const grouped = buildGroupedRepairErrorContext(
      [
        {
          check: "typecheck",
          exitCode: 2,
          output: [
            "src/lib/config.ts(12,5): error TS2304: Cannot find name 'SiteConfig'.",
            "src/lib/config.ts(15,9): error TS2339: Property 'theme' does not exist on type '{}'.",
            "src/app/page.tsx(3,1): error TS2724: '@/lib/config' has no exported member named 'siteConfig'.",
          ].join("\n"),
        },
      ],
      {
        projectContent: [
          '```ts file="src/lib/config.ts"',
          "export const siteConfig = {};",
          "```",
          '```tsx file="src/app/page.tsx"',
          'import { siteConfig } from "@/lib/config";',
          "export default function Page() {",
          "  return <main>{siteConfig.theme}</main>;",
          "}",
          "```",
        ].join("\n"),
      },
    );

    expect(grouped.errorManifest.length).toBe(2);
    expect(grouped.errorManifest[0]?.file).toBe("src/lib/config.ts");
    expect(grouped.errorManifest[0]?.importedByCount).toBeGreaterThanOrEqual(1);
    expect(grouped.contextLines.some((line) => line.startsWith("File: src/lib/config.ts"))).toBe(
      true,
    );
  });
});

describe("buildRepairErrorContextLines", () => {
  it("returns grouped file-first context instead of flat log snippets", () => {
    const lines = buildRepairErrorContextLines([
      {
        check: "typecheck",
        exitCode: 2,
        output: "src/app/page.tsx(4,12): error TS2322: Type 'number' is not assignable to type 'string'.",
      },
    ]);

    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]?.startsWith("File: src/app/page.tsx")).toBe(true);
    expect(lines.some((line) => line.includes("Type 'number' is not assignable"))).toBe(true);
  });
});
