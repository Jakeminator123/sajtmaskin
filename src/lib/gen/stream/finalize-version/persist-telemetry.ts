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
  /**
   * SAJ-59: explicit signal for "preflight had verification-blocking errors"
   * — used to populate `qualityGateResult` with `preflight_failed` vs
   * `verifier_failed` distinct values. Without it we can't tell whether
   * `hasVerificationBlockingErrors` came from preflight or verifier-only.
   * Defaults to `hasVerificationBlockingErrors && !verifierBlocked` if the
   * caller doesn't pass it (back-compat).
   */
  hasPreflightVerificationErrors?: boolean;
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
  /**
   * Fas 0 telemetri-hygien: id:n för de dossiers som faktiskt valdes för
   * denna generation. Persisteras i `meta.selectedDossierIds` (ingen ny
   * kolumn — `control-stats.mjs` läser redan `meta->...`). En tom lista
   * skrivs INTE så meta hålls rent och historiska rader förblir jämförbara.
   */
  selectedDossierIds?: string[] | null;
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
    selectedDossierIds,
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

    // Fas 0 telemetri-hygien: dossier-val. Skriv bara när något valdes så
    // att `meta` inte fylls med tomma arrayer (historiska rader utan nyckeln
    // ska förbli jämförbara med "ingen dossier").
    if (selectedDossierIds && selectedDossierIds.length > 0) {
      telemetryMeta.selectedDossierIds = selectedDossierIds;
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
      // SAJ-59: distinguish preflight-block from verifier-only block.
      // Previously a verifier-only failure (e.g. ESLint via verifier-LLM,
      // not a preflight error) was persisted as `preflight_failed`, which
      // is misleading for backoffice/analytics queries that filter on
      // `quality_gate_result`. Tri-state now:
      //   - `preflight_failed` : preflight verification blocked
      //   - `verifier_failed`  : preflight passed, verifier blocked the row
      //   - `preflight_passed` : both clean
      qualityGateResult: (() => {
        if (!hasVerificationBlockingErrors) return "preflight_passed";
        const preflightVerificationFailed =
          params.hasPreflightVerificationErrors ?? !verifierBlocked;
        return preflightVerificationFailed ? "preflight_failed" : "verifier_failed";
      })(),
      durationMs: Date.now() - startedAt,
      promptTokens: tokenUsage?.prompt ?? null,
      completionTokens: tokenUsage?.completion ?? null,
      fileCount: preflightFileCount,
      // SAJ-57 (KNOWN GAP): `scaffoldRetryUsed` should mark "this generation
      // followed an earlier `scaffoldRetrySuggested` pivot". The signal does
      // not exist at this layer — `persist-telemetry` only sees the row that
      // SUGGESTS the retry, not the next generation that ACTS on it. As a
      // result both downstream consumers (`getHistoricalRetrySuccess` per
      // SAJ-38, and `scaffold-scoring.retryCount`) read this column and
      // currently always get `false`. A correct fix needs upstream context
      // (chat repair pipeline) to flag "this generation is a retry attempt"
      // and pass that flag in here. Leaving hardcoded `false` to avoid
      // false-positive signal until that wiring exists; do NOT change to
      // `Boolean(scaffoldRetry)` — that would mean "row that suggested",
      // which inverts the column's semantics for consumers.
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
