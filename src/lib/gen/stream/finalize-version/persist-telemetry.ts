/**
 * Telemetry record persistence — best-effort wrapper around
 * `createGenerationTelemetryRecord` with the full input set that the
 * finalize pipeline assembles.
 *
 * Split out of `finalize-version.ts` (OMTAG-03 wave-rest) — no behavior
 * change.
 */

import type { BuildIntent } from "@/lib/builder/build-intent";
import type { BuildSpec } from "@/lib/gen/build-spec";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import type { ScaffoldRetrySuggestion } from "@/lib/gen/scaffolds/scaffold-aware-retry";
import { createGenerationTelemetryRecord } from "@/lib/db/services/generation-telemetry";
import { isCanonicalModelId, type CanonicalModelId } from "@/lib/models/catalog";
import { getPhaseRoutingSummary } from "@/lib/models/phase-routing";
import type {
  FinalizeStepTelemetryMap,
  FinalizeSyntaxResult,
} from "./types";

export async function persistTelemetryRecord(params: {
  chatId: string;
  versionId: string;
  resolvedScaffold: ScaffoldManifest | null;
  scaffoldSelection: Record<string, unknown> | null;
  model: string;
  buildIntent: BuildIntent | undefined;
  repairPassIndex: number;
  runAutofix: boolean;
  syntaxResult: FinalizeSyntaxResult;
  preflightErrors: Array<{ message: string }>;
  preflightWarnings: Array<{ message: string }>;
  hasPreviewBlockingPreflightErrors: boolean;
  hasVerificationBlockingErrors: boolean;
  previewBlockingReason: string | null;
  startedAt: number;
  tokenUsage?: { prompt?: number; completion?: number };
  preflightFileCount: number;
  scaffoldRetry: ScaffoldRetrySuggestion | null;
  finalizePath: { runDeepPath: boolean; reason: string };
  finalizeStepTelemetry: FinalizeStepTelemetryMap;
  autoFixFixCount: number;
  autoFixWarningCount: number;
  autoFixDependencyCount: number;
  autoFixHeavyLoad: boolean;
  verifierBlocked: boolean;
  verifierBlockingFindings: Array<{ id: string; detail: string }>;
  preflightIssueCount: number;
  finalizedPreviewFileCount: number;
  unresolvedImportFallbackUsed: boolean;
  buildSpec?: BuildSpec | null;
  resolvedTier?: CanonicalModelId;
  orchestrationStreamMeta: Record<string, unknown> | null | undefined;
}): Promise<string | null> {
  const {
    chatId,
    versionId,
    resolvedScaffold,
    scaffoldSelection,
    model,
    buildIntent,
    repairPassIndex,
    runAutofix,
    syntaxResult,
    preflightErrors,
    preflightWarnings,
    hasPreviewBlockingPreflightErrors,
    hasVerificationBlockingErrors,
    previewBlockingReason,
    startedAt,
    tokenUsage,
    preflightFileCount,
    scaffoldRetry,
    finalizePath,
    finalizeStepTelemetry,
    autoFixFixCount,
    autoFixWarningCount,
    autoFixDependencyCount,
    autoFixHeavyLoad,
    verifierBlocked,
    verifierBlockingFindings,
    preflightIssueCount,
    finalizedPreviewFileCount,
    unresolvedImportFallbackUsed,
    buildSpec,
    resolvedTier,
    orchestrationStreamMeta,
  } = params;
  try {
    const telemetryMeta: Record<string, unknown> = {
      finalizePath: finalizePath.runDeepPath ? "full" : "light",
      finalizePathReason: finalizePath.reason,
      postStreamSteps: finalizeStepTelemetry,
      repairPassIndex,
      autofix: {
        fixCount: autoFixFixCount,
        warningCount: autoFixWarningCount,
        dependencyCount: autoFixDependencyCount,
        heavyLoad: autoFixHeavyLoad,
      },
      preflight: {
        previewBlocked: hasPreviewBlockingPreflightErrors,
        verificationBlocked: hasVerificationBlockingErrors,
        verifierBlocked,
        verifierBlockingFindingCount: verifierBlockingFindings.length,
        issueCount: preflightIssueCount,
        previewFileCount: finalizedPreviewFileCount,
        unresolvedImportFallbackUsed,
      },
    };
    if (buildSpec) {
      telemetryMeta.buildSpec = {
        generationMode: buildSpec.generationMode,
        changeScope: buildSpec.changeScope,
        qualityTarget: buildSpec.qualityTarget,
        previewPolicy: buildSpec.previewPolicy,
        verificationPolicy: buildSpec.verificationPolicy,
        contextPolicy: buildSpec.contextPolicy,
        scaffoldId: buildSpec.scaffoldId,
        stylePack: buildSpec.stylePack,
      };
    }
    if (resolvedTier && isCanonicalModelId(resolvedTier)) {
      telemetryMeta.phaseRouting = getPhaseRoutingSummary(resolvedTier);
    }
    const tls = orchestrationStreamMeta?.templateLibrarySearch;
    if (tls && typeof tls === "object") {
      telemetryMeta.templateLibrarySearch = tls;
    }

    const scaffoldSelectionMethod =
      scaffoldSelection && typeof scaffoldSelection.selectionMethod === "string"
        ? scaffoldSelection.selectionMethod
        : null;
    const scaffoldSelectionConfidence =
      scaffoldSelection && typeof scaffoldSelection.selectionConfidence === "string"
        ? scaffoldSelection.selectionConfidence
        : null;
    const briefInfluencedSelection =
      scaffoldSelection?.briefContextApplied === true;

    const telemetryRecord = await createGenerationTelemetryRecord({
      chatId,
      versionId,
      scaffoldId: resolvedScaffold?.id ?? null,
      scaffoldSelectionMethod,
      scaffoldSelectionConfidence,
      briefInfluencedSelection,
      model,
      buildIntent: buildIntent ?? null,
      retryCount: repairPassIndex,
      autofixApplied: runAutofix,
      syntaxFixerUsed: syntaxResult.fixerUsed,
      preflightErrorCount: preflightErrors.length,
      preflightWarningCount: preflightWarnings.length,
      previewSuccess: !hasPreviewBlockingPreflightErrors,
      previewBlockingReason,
      qualityGateResult: hasVerificationBlockingErrors
        ? "preflight_failed"
        : "preflight_passed",
      durationMs: Date.now() - startedAt,
      promptTokens: tokenUsage?.prompt ?? null,
      completionTokens: tokenUsage?.completion ?? null,
      fileCount: preflightFileCount,
      scaffoldRetryUsed: false,
      scaffoldRetrySuggested: scaffoldRetry?.suggestedScaffoldId ?? null,
      meta: telemetryMeta,
    });
    return telemetryRecord && typeof telemetryRecord.id === "string"
      ? telemetryRecord.id
      : null;
  } catch (telemetryErr) {
    console.warn("[telemetry] Failed to write generation telemetry:", telemetryErr);
    return null;
  }
}
