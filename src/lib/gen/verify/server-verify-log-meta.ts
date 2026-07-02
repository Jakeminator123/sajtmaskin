import type { QualityGateCheckResult } from "./preview-quality-gate";
import type { VisualQAResult } from "./visual-qa";
import type { RepairErrorManifest } from "./repair-loop";

/**
 * Fas 0 — kanonisk repair-outcome-taxonomi. En enda enum som ersätter de
 * tidigare spretiga fritext-strängarna ("Server repair incomplete ...") och
 * de förvirrande "0 errors remain"-fallen. Skrivs som `meta.outcome` på
 * server-repair-loggar och grupperas av `scripts/db/control-stats.mjs`.
 *
 * Gammal→ny-mappning (dokumenteras i docs/schemas/quality-gate.md):
 *   - "Server repair succeeded (…)."                         → `repaired`
 *   - "…syntax clean but quality gate still failing…"        → `syntax_clean_gate_failed`
 *   - "…N esbuild syntax errors remain…"                     → `syntax_errors_remain`
 *   - "…time budget exceeded…"                               → `time_budget_exceeded`
 *   - "…0 errors remain…" (gate failade ändå)                → `syntax_clean_gate_failed` (fix)
 *   - no-context-skip                                        → `no_context`
 */
export type ServerRepairOutcome =
  | "repaired"
  | "syntax_clean_gate_failed"
  | "syntax_errors_remain"
  | "time_budget_exceeded"
  | "no_improvement"
  | "fixer_noop"
  | "no_context";

type ResolveServerRepairOutcomeParams = {
  method: "deterministic" | "llm";
  repaired: boolean;
  remainingErrors?: number;
  /**
   * Explicit signal att esbuild-syntaxen är ren men typecheck/build failade.
   * Om utelämnad härleds den ur `remainingErrors === 0 && !repaired` så att
   * en gate-only-fail aldrig loggas som ett vilseledande "0 errors remain".
   */
  syntaxCleanGateFailed?: boolean;
  earlyStopReason?: "fixer_noop" | "no_improvement" | "time_budget_exceeded" | null;
  /** Repair-loopen hade ingen actionable felkontext att jobba med. */
  noContext?: boolean;
};

/**
 * Härleder den kanoniska outcome-enumen + ett läsbart meddelande ur de
 * signaler både `server-verify.ts` och `repair/route.ts` redan har. En ägare
 * per signal (`workflow.mdc`): båda callsites bygger meddelandet härifrån i
 * stället för egna ternärer.
 */
export function resolveServerRepairOutcome(
  params: ResolveServerRepairOutcomeParams,
): { outcome: ServerRepairOutcome; message: string } {
  const { method, repaired, remainingErrors, syntaxCleanGateFailed, earlyStopReason, noContext } =
    params;
  const stopSuffix = earlyStopReason ? `, ${earlyStopReason}` : "";
  const remainingLabel =
    typeof remainingErrors === "number" ? `${remainingErrors}` : "?";

  if (repaired) {
    return { outcome: "repaired", message: `Server repair succeeded (${method}).` };
  }
  if (noContext) {
    return {
      outcome: "no_context",
      message: `Server repair skipped (${method}, no actionable error context).`,
    };
  }
  if (syntaxCleanGateFailed === true) {
    return {
      outcome: "syntax_clean_gate_failed",
      message: `Server repair incomplete (${method}, syntax clean but quality gate still failing${stopSuffix}).`,
    };
  }
  if (earlyStopReason === "time_budget_exceeded") {
    const remainingSuffix =
      typeof remainingErrors === "number" && remainingErrors > 0
        ? ` with ${remainingErrors} esbuild syntax error(s) remaining`
        : "";
    return {
      outcome: "time_budget_exceeded",
      message: `Server repair stopped (${method}, time budget exceeded${remainingSuffix}).`,
    };
  }
  // Derived syntax-clean: esbuild rent men gate failade ändå. Fixar det
  // historiska "0 errors remain"-fallet där route-loggen såg ut som success.
  if (typeof remainingErrors === "number" && remainingErrors === 0) {
    return {
      outcome: "syntax_clean_gate_failed",
      message: `Server repair incomplete (${method}, syntax clean but quality gate still failing${stopSuffix}).`,
    };
  }
  if (typeof remainingErrors === "number" && remainingErrors > 0) {
    return {
      outcome: "syntax_errors_remain",
      message: `Server repair incomplete (${method}, ${remainingLabel} esbuild syntax error(s) remain${stopSuffix}).`,
    };
  }
  if (earlyStopReason === "fixer_noop") {
    return {
      outcome: "fixer_noop",
      message: `Server repair incomplete (${method}, fixer produced no change).`,
    };
  }
  // Default: non-silent honest fallback (aldrig `null`/tyst).
  return {
    outcome: "no_improvement",
    message: `Server repair incomplete (${method}, no improvement${stopSuffix}).`,
  };
}

export type ServerVerifyFailedOutput = {
  check: string;
  exitCode: number;
  output: string;
  durationMs?: number | null;
};

/** Compact visual QA for persisted logs (no long detail strings). */
export type QualityGateVisualQaLogMeta = {
  overallScore: number;
  passed: boolean;
  screenshotCaptured: boolean;
  checks: Array<{ check: string; passed: boolean; score: number }>;
};

export function compactVisualQAForQualityGateLog(
  result: VisualQAResult,
): QualityGateVisualQaLogMeta {
  return {
    overallScore: result.overallScore,
    passed: result.passed,
    screenshotCaptured: result.screenshotCaptured,
    checks: result.checks.map((c) => ({
      check: c.check,
      passed: c.passed,
      score: c.score,
    })),
  };
}

type BuildServerVerifyQualityGateMetaParams = {
  results?: QualityGateCheckResult[] | null;
  passed?: boolean;
  verifyLaneDurationMs: number;
  firstFailureCheck: string | null;
  jobStartedAt: string | null;
  jobFinishedAt: string | null;
  serverOwned?: boolean;
  repass?: boolean;
  method?: "deterministic" | "llm";
  promoted?: boolean;
  visualQA?: QualityGateVisualQaLogMeta | null;
  errorManifest?: RepairErrorManifest | null;
};

export function buildServerVerifyQualityGateMeta(
  params: BuildServerVerifyQualityGateMetaParams,
) {
  const {
    results,
    passed,
    verifyLaneDurationMs,
    firstFailureCheck,
    jobStartedAt,
    jobFinishedAt,
    serverOwned = true,
    repass,
    method,
    promoted,
    visualQA,
    errorManifest,
  } = params;

  return {
    ...(typeof passed === "boolean" ? { passed } : {}),
    checks:
      results?.map((result) => ({
        check: result.check,
        passed: result.passed,
        exitCode: result.exitCode,
        durationMs: result.durationMs ?? null,
      })) ?? null,
    durationMs: verifyLaneDurationMs,
    verifyLaneDurationMs,
    firstFailureCheck,
    jobStartedAt,
    jobFinishedAt,
    serverOwned,
    ...(typeof repass === "boolean" ? { repass } : {}),
    ...(method ? { method } : {}),
    ...(typeof promoted === "boolean" ? { promoted } : {}),
    ...(visualQA ? { visualQA } : {}),
    ...(errorManifest ? { errorManifest } : {}),
  };
}

type BuildServerVerifyRepairContextLinesParams = {
  failedOutputs: ServerVerifyFailedOutput[];
  verifyLaneDurationMs: number;
  firstFailureCheck: string | null;
  jobStartedAt: string | null;
  jobFinishedAt: string | null;
};

export function buildServerVerifyRepairContextLines(
  params: BuildServerVerifyRepairContextLinesParams,
) {
  const lines: string[] = [];

  if (params.firstFailureCheck) {
    lines.push(`[verify] first failure: ${params.firstFailureCheck}`);
  }
  if (Number.isFinite(params.verifyLaneDurationMs) && params.verifyLaneDurationMs > 0) {
    lines.push(`[verify] total duration: ${params.verifyLaneDurationMs}ms`);
  }
  if (params.jobStartedAt) {
    lines.push(`[verify] started: ${params.jobStartedAt}`);
  }
  if (params.jobFinishedAt) {
    lines.push(`[verify] finished: ${params.jobFinishedAt}`);
  }

  for (const failure of params.failedOutputs) {
    const details = [`exit ${failure.exitCode}`];
    if (typeof failure.durationMs === "number" && Number.isFinite(failure.durationMs) && failure.durationMs >= 0) {
      details.push(`${failure.durationMs}ms`);
    }
    lines.push(`[${failure.check}] verify failed (${details.join(", ")})`);
  }

  return lines;
}

type BuildServerRepairOutcomeMetaParams = {
  method: "deterministic" | "llm";
  llmPasses: number;
  repaired: boolean;
  remainingErrors?: number;
  /**
   * Source of the `remainingErrors` count. esbuild = parse/syntax pass,
   * quality_gate = tsc/build/eslint result. Without this label, callers
   * can't tell why "0 errors remain" sometimes coexists with a failed
   * promotion (a syntax-clean run still failed quality gate).
   */
  remainingErrorsSource?: "esbuild_syntax" | "quality_gate";
  /** True when esbuild syntax is clean but typecheck/build still failed. */
  syntaxCleanGateFailed?: boolean;
  earlyStopReason?: "fixer_noop" | "no_improvement" | "time_budget_exceeded" | null;
  verifyLaneDurationMs: number;
  firstFailureCheck: string | null;
  jobStartedAt: string | null;
  jobFinishedAt: string | null;
  serverOwned?: boolean;
  errorManifest?: RepairErrorManifest | null;
};

export function buildServerRepairOutcomeMeta(
  params: BuildServerRepairOutcomeMetaParams,
) {
  const {
    method,
    llmPasses,
    repaired,
    remainingErrors,
    remainingErrorsSource,
    syntaxCleanGateFailed,
    earlyStopReason,
    verifyLaneDurationMs,
    firstFailureCheck,
    jobStartedAt,
    jobFinishedAt,
    serverOwned = true,
    errorManifest,
  } = params;

  // Fas 0: kanonisk outcome-enum härledd ur samma signaler. Skrivs som
  // `meta.outcome` så control-stats kan `GROUP BY meta->>'outcome'`.
  const { outcome } = resolveServerRepairOutcome({
    method,
    repaired,
    remainingErrors,
    syntaxCleanGateFailed,
    earlyStopReason,
  });

  return {
    method,
    llmPasses,
    repaired,
    outcome,
    remainingErrors,
    ...(remainingErrorsSource ? { remainingErrorsSource } : {}),
    ...(typeof syntaxCleanGateFailed === "boolean" ? { syntaxCleanGateFailed } : {}),
    earlyStopReason,
    durationMs: verifyLaneDurationMs,
    verifyLaneDurationMs,
    firstFailureCheck,
    jobStartedAt,
    jobFinishedAt,
    serverOwned,
    ...(errorManifest ? { errorManifest } : {}),
  };
}
