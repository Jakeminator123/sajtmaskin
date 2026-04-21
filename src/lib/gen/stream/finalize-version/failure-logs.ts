/**
 * Builders for `engine_version_error_logs` rows produced by finalize.
 *
 * Extracted from `src/lib/gen/stream/finalize-version.ts` 2026-04-21.
 */

import type { validateAndFix } from "../../autofix/validate-and-fix";

type FinalizeSyntaxResult = Awaited<ReturnType<typeof validateAndFix>>;

export function buildSyntaxFailureLog(params: {
  chatId: string;
  versionId: string;
  syntaxResult: FinalizeSyntaxResult;
  logPassId: string;
  repairPassIndex: number;
  lineageHash?: string | null;
}) {
  const { chatId, versionId, syntaxResult, logPassId, repairPassIndex, lineageHash } = params;
  if (syntaxResult.status === "passed") return null;

  const message =
    syntaxResult.status === "pipeline-error"
      ? "Syntax validation pipeline failed before preflight could trust the generated files."
      : "Syntax validation left blocking errors before preflight/preview.";

  return {
    chatId,
    versionId,
    level: "error" as const,
    category: "syntax",
    message,
    meta: {
      syntaxStatus: syntaxResult.status,
      errorsBefore: syntaxResult.errorsBefore,
      errorsAfter: syntaxResult.errorsAfter,
      fixerUsed: syntaxResult.fixerUsed,
      fixerImproved: syntaxResult.fixerImproved,
      pipelineError: syntaxResult.pipelineError,
      earlyStopReason: syntaxResult.earlyStopReason,
      logPassId,
      repairPassIndex,
      lineageHash: lineageHash ?? null,
    },
  };
}

export function buildVerifierFailureLogs(params: {
  chatId: string;
  versionId: string;
  blockingFindings: Array<{ id: string; detail: string }>;
  logPassId: string;
  repairPassIndex: number;
  lineageHash?: string | null;
}) {
  const { chatId, versionId, blockingFindings, logPassId, repairPassIndex, lineageHash } = params;
  return blockingFindings.map((finding) => ({
    chatId,
    versionId,
    level: "error" as const,
    category: "quality-gate:verifier-blocking",
    message: finding.detail,
    meta: {
      verifierFindingId: finding.id,
      logPassId,
      repairPassIndex,
      lineageHash: lineageHash ?? null,
    },
  }));
}
