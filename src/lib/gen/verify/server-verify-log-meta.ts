import type { QualityGateCheckResult } from "./preview-quality-gate";
import type { VisualQAResult } from "./visual-qa";
import type { RepairErrorManifest } from "./repair-loop";

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
    earlyStopReason,
    verifyLaneDurationMs,
    firstFailureCheck,
    jobStartedAt,
    jobFinishedAt,
    serverOwned = true,
    errorManifest,
  } = params;

  return {
    method,
    llmPasses,
    repaired,
    remainingErrors,
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
