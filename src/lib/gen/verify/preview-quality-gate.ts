/**
 * Shared quality gate executed through preview-host's isolated verify lane.
 * Default tier-2 gate: install + typecheck only. Build/lint available for
 * tier-3 / interactive / deploy paths via explicit `checks` override.
 */
import type { CodeFile } from "@/lib/gen/parser";
import {
  analyzeVisualQuality,
  isVisualQAEnabled,
  type VisualQAResult,
} from "./visual-qa";
import {
  TIER2_QUALITY_GATE_CHECKS,
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

export const QUALITY_GATE_SETUP_HINT =
  "Sätt SAJTMASKIN_PREVIEW_HOST_BASE_URL till preview-hostens root-URL så att appen kan nå verify-lanen (inte /preview). Använd SAJTMASKIN_PREVIEW_HOST_API_KEY om preview-host kräver auth.";

export const QUALITY_GATE_COMMANDS: Record<QualityGateCheck, string> = {
  typecheck: "npx tsc --noEmit",
  build: "npx next build",
  lint: "npx eslint . --max-warnings=0",
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
  });

  if (!verify.ok) {
    throw new Error(verify.message);
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
  return Array.isArray(checks) && checks.length > 0 ? checks : TIER2_QUALITY_GATE_CHECKS;
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

  const failedChecks = results
    .filter((result) => !result.passed)
    .map((result) => result.check);

  return `Automatic verification failed: ${failedChecks.join(", ")}.`;
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
    checks: params.checks ?? TIER2_QUALITY_GATE_CHECKS,
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
}): Promise<PostRepairGateDecision> {
  const repairChecks = resolveRepairQualityGateChecks(params.checks);
  const gate = await runQualityGateOnExportable({
    chatId: params.chatId,
    versionId: params.versionId,
    exportable: params.exportable,
    checks: repairChecks,
  });
  if (!gate) {
    if (params.hadQualityGateFailures) {
      return {
        promote: false,
        results: null,
        verifyLaneDurationMs: 0,
        firstFailureCheck: null,
        jobStartedAt: null,
        jobFinishedAt: null,
      };
    }
    return {
      promote: true,
      results: [],
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
