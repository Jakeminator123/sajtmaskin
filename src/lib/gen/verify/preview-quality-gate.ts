/**
 * Shared quality gate executed through preview-host's isolated verify lane.
 * Default F2 design-preview gate: typecheck only (since 2026-04-23).
 * `build` is reserved for F3 (`integrationsBuild`).
 * Manifest `config/ai_models/manifest.json` (`qualityGateTiers`) is the
 * source of truth. Lint and other checks are available via explicit
 * `checks` override.
 */
import type { CodeFile } from "@/lib/gen/parser";
import {
  analyzeVisualQuality,
  isVisualQAEnabled,
  type VisualQAResult,
} from "./visual-qa";
import {
  DESIGN_PREVIEW_QUALITY_GATE_CHECKS,
  type QualityGateCheck,
} from "./quality-gate-checks";
import { runPreviewHostQualityGate } from "@/lib/gen/preview/preview-host-client";
import { getPreviewHostBaseUrl } from "@/lib/gen/preview/tier2-config";

export type QualityGateCheckResult = {
  check: string;
  passed: boolean;
  exitCode: number;
  output: string;
  durationMs?: number | null;
};

type QualityGateFileLike = {
  name: string;
  content: string;
};

export class QualityGateNotConfiguredError extends Error {
  constructor() {
    super("Quality gate not configured (missing SAJTMASKIN_PREVIEW_HOST_BASE_URL).");
    this.name = "QualityGateNotConfiguredError";
  }
}

/**
 * Thrown when the preview-host verify lane could not be reached or did not run
 * (network error / timeout / HTTP 4xx/5xx / disk-full) — i.e. the gate never
 * actually evaluated the generated code. This is deliberately distinct from a
 * real check failure (which comes back as `verify.ok === true` with
 * `passed:false` results): an unreachable gate must NOT mark the version
 * `failed` (a false-RED — reporting a verification verdict when nothing was
 * verified) and should surface as a retryable infra error, not a hard 500.
 */
export class QualityGateUnavailableError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message && message.trim() ? message : "Quality gate verify lane is unavailable.");
    this.name = "QualityGateUnavailableError";
    this.retryable = retryable;
  }
}

export const QUALITY_GATE_SETUP_HINT =
  "Sätt SAJTMASKIN_PREVIEW_HOST_BASE_URL till preview-hostens root-URL så att appen kan nå verify-lanen (inte /preview). Använd SAJTMASKIN_PREVIEW_HOST_API_KEY om preview-host kräver auth.";

/**
 * Quality-gate commands run on preview-host's verify-lane.
 *
 * `lint` uses `--max-warnings=20` (not `=0`) deliberately: errors ALWAYS
 * fail the gate (e.g. `react-hooks/set-state-in-effect`, `no-undef`),
 * while we tolerate a small pool of warnings (unused imports, minor a11y
 * hints) so single `@typescript-eslint/no-unused-vars` drops don't freeze
 * a whole generation. Raise the cap via env override if we ever want to
 * be stricter.
 */
export const QUALITY_GATE_COMMANDS: Record<QualityGateCheck, string> = {
  typecheck: "npx tsc --noEmit",
  build: "npx next build",
  lint: "npx eslint . --max-warnings=20",
};

function isSafeRelativePath(filePath: string): boolean {
  if (!filePath || filePath.includes("\0")) return false;
  if (filePath.startsWith("/") || filePath.startsWith("\\")) return false;
  if (filePath.includes("..")) return false;
  return /^[A-Za-z0-9._/@-]+$/.test(filePath);
}

export function isQualityGateConfigured(): boolean {
  return Boolean(getPreviewHostBaseUrl());
}

export function exportableToQualityGateFiles(files: CodeFile[]): QualityGateFileLike[] {
  return files
    .filter((file) => file.content != null && isSafeRelativePath(file.path))
    .map((file) => ({ name: file.path, content: file.content as string }));
}

export async function runQualityGateChecks(params: {
  chatId: string;
  versionId: string;
  files: QualityGateFileLike[];
  checks: readonly QualityGateCheck[];
  /**
   * Optional ABSOLUTE deadline (ms) by which the verify must have aborted,
   * threaded down to `runPreviewHostQualityGate`. Lets the budget-aware
   * manual-repair final gate bound the verify so it aborts before the route's
   * `maxDuration` (Codex P1 #286). Undefined = static `VERIFY_TIMEOUT_MS`
   * (back-compat).
   */
  verifyDeadlineEpochMs?: number;
}): Promise<{
  results: QualityGateCheckResult[];
  verifyLaneDurationMs: number;
  firstFailureCheck: string | null;
  jobStartedAt: string | null;
  jobFinishedAt: string | null;
}> {
  if (!isQualityGateConfigured()) {
    throw new QualityGateNotConfiguredError();
  }

  const filesJson = Object.fromEntries(
    params.files
      .filter((file) => isSafeRelativePath(file.name))
      .map((file) => [file.name, file.content]),
  );

  const verify = await runPreviewHostQualityGate({
    chatId: params.chatId,
    versionId: params.versionId,
    filesJson,
    checks: params.checks,
    verifyDeadlineEpochMs: params.verifyDeadlineEpochMs,
  });

  if (!verify.ok) {
    // `verify.ok === false` always means the gate could NOT run (unreachable
    // host / network / timeout / HTTP error / disk-full) — never "the code
    // failed a check" (those return `ok:true` with `passed:false` rows). Throw a
    // typed, retryable error so the route can avoid a false-RED `failed` verdict
    // + hard 500 and instead surface a retryable infra signal.
    throw new QualityGateUnavailableError(verify.message, verify.retryable);
  }

  return {
    results: verify.results,
    verifyLaneDurationMs: verify.durationMs,
    firstFailureCheck: verify.firstFailureCheck,
    jobStartedAt: verify.jobStartedAt,
    jobFinishedAt: verify.jobFinishedAt,
  };
}

export function qualityGateAllPassed(results: QualityGateCheckResult[]): boolean {
  return results.length > 0 && results.every((result) => result.passed);
}

export function resolveRepairQualityGateChecks(
  checks?: readonly QualityGateCheck[],
): readonly QualityGateCheck[] {
  return Array.isArray(checks) && checks.length > 0 ? checks : DESIGN_PREVIEW_QUALITY_GATE_CHECKS;
}

const MAX_GATE_DETAIL_LENGTH = 200;

/**
 * First meaningful (non-empty, trimmed) line of a check's raw output, capped to
 * keep failure summaries short. Lets callers surface the concrete error (e.g.
 * the tsc `Cannot find name 'X'` line) instead of only the check name.
 */
export function firstGateOutputLine(
  output: string | null | undefined,
  maxLength: number = MAX_GATE_DETAIL_LENGTH,
): string | null {
  if (!output) return null;
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    return line.length > maxLength ? `${line.slice(0, maxLength).trimEnd()}...` : line;
  }
  return null;
}

export function describeQualityGateVerification(
  results: QualityGateCheckResult[],
): string {
  if (qualityGateAllPassed(results)) {
    return "Automatic verification passed.";
  }

  if (results.length === 0) {
    return "Automatic verification could not run because no checks executed.";
  }

  const failedResults = results.filter((result) => !result.passed);
  const summary = `Automatic verification failed: ${failedResults
    .map((result) => result.check)
    .join(", ")}.`;

  // Append the concrete first error line from the failed check so the message
  // is actionable (e.g. the tsc error text) instead of just the check name.
  const firstDetail = failedResults
    .map((result) => firstGateOutputLine(result.output))
    .find((line): line is string => line !== null);

  return firstDetail ? `${summary} ${firstDetail}` : summary;
}

export function maybeAnalyzeVisualQAForPassedExportable(params: {
  exportable: CodeFile[];
  results: QualityGateCheckResult[] | null | undefined;
  onError?: (error: unknown) => void;
}): VisualQAResult | undefined {
  if (!params.results || !isVisualQAEnabled() || !qualityGateAllPassed(params.results)) {
    return undefined;
  }

  try {
    const files = exportableToQualityGateFiles(params.exportable);
    return analyzeVisualQuality(
      files.map((file) => ({ path: file.name, content: file.content })),
    );
  } catch (error) {
    params.onError?.(error);
    return undefined;
  }
}

export async function runQualityGateOnExportable(params: {
  chatId: string;
  versionId: string;
  exportable: CodeFile[];
  checks?: readonly QualityGateCheck[];
  /** Optional absolute verify abort deadline (ms); see `runQualityGateChecks`. */
  verifyDeadlineEpochMs?: number;
}): Promise<{
  results: QualityGateCheckResult[];
  verifyLaneDurationMs: number;
  firstFailureCheck: string | null;
  jobStartedAt: string | null;
  jobFinishedAt: string | null;
} | null> {
  if (!isQualityGateConfigured()) return null;
  const files = exportableToQualityGateFiles(params.exportable);
  return runQualityGateChecks({
    chatId: params.chatId,
    versionId: params.versionId,
    files,
    checks: params.checks ?? DESIGN_PREVIEW_QUALITY_GATE_CHECKS,
    verifyDeadlineEpochMs: params.verifyDeadlineEpochMs,
  });
}

export type PostRepairGateDecision =
  | {
      promote: true;
      results: QualityGateCheckResult[];
      verifyLaneDurationMs: number;
      firstFailureCheck: string | null;
      jobStartedAt: string | null;
      jobFinishedAt: string | null;
    }
  | {
      promote: false;
      results: QualityGateCheckResult[] | null;
      verifyLaneDurationMs: number;
      firstFailureCheck: string | null;
      jobStartedAt: string | null;
      jobFinishedAt: string | null;
    };

export async function shouldPromoteAfterRepair(params: {
  chatId: string;
  versionId: string;
  exportable: CodeFile[];
  hadQualityGateFailures: boolean;
  checks?: readonly QualityGateCheck[];
  /**
   * Optional ABSOLUTE deadline (ms) by which the verify must have aborted. The
   * manual-repair final gate passes a budget-derived value so a late verify
   * aborts before the route's `maxDuration` and the lease is always released
   * (Codex P1 #286). Undefined = static verify timeout (back-compat;
   * server-verify passes nothing).
   */
  verifyDeadlineEpochMs?: number;
}): Promise<PostRepairGateDecision> {
  const repairChecks = resolveRepairQualityGateChecks(params.checks);
  const gate = await runQualityGateOnExportable({
    chatId: params.chatId,
    versionId: params.versionId,
    exportable: params.exportable,
    checks: repairChecks,
    verifyDeadlineEpochMs: params.verifyDeadlineEpochMs,
  });
  if (!gate) {
    // Verify lane unavailable (quality gate not configured): we cannot prove the
    // repaired files are clean, so NEVER treat an unverified repair as green.
    // Previously the no-prior-failures branch returned `promote:true` with EMPTY
    // `results`, which read as a pass even though nothing was verified — a
    // false-green (B08). Fail closed in both cases (`results:null`, not `[]`, so
    // `qualityGateAllPassed` can never see it as a passing run).
    return {
      promote: false,
      results: null,
      verifyLaneDurationMs: 0,
      firstFailureCheck: null,
      jobStartedAt: null,
      jobFinishedAt: null,
    };
  }
  if (!qualityGateAllPassed(gate.results)) {
    return {
      promote: false,
      results: gate.results,
      verifyLaneDurationMs: gate.verifyLaneDurationMs,
      firstFailureCheck: gate.firstFailureCheck,
      jobStartedAt: gate.jobStartedAt,
      jobFinishedAt: gate.jobFinishedAt,
    };
  }
  return {
    promote: true,
    results: gate.results,
    verifyLaneDurationMs: gate.verifyLaneDurationMs,
    firstFailureCheck: gate.firstFailureCheck,
    jobStartedAt: gate.jobStartedAt,
    jobFinishedAt: gate.jobFinishedAt,
  };
}
