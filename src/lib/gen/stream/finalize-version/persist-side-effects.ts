/**
 * Post-persist side effects from `finalizeAndSaveVersion`: orchestration
 * snapshot persist, preflight log persist + prune, generation log, and
 * verification-failure marking. Telemetry persistence lives in
 * `./persist-telemetry.ts` (separate file because its param set is big
 * enough to push this module over the 400-line ceiling on its own).
 *
 * Each helper is best-effort — they log via `devLogAppend`/`console.warn`
 * and never throw up to the caller.
 *
 * Split out of `finalize-version.ts` (OMTAG-03 wave-rest) — no behavior
 * change.
 */

import type { BuildIntent } from "@/lib/builder/build-intent";
import type { ScaffoldRetrySuggestion } from "@/lib/gen/scaffolds/scaffold-aware-retry";
import { devLogAppend } from "@/lib/logging/devLog";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import {
  createEngineVersionErrorLogs,
  pruneStaleVersionErrorLogs,
} from "@/lib/db/services/version-errors";
import {
  buildPersistedOrchestrationSnapshot,
  mergePersistedOrchestrationSnapshots,
} from "@/lib/gen/orchestration-snapshot";
import type { FinalizePreflightIssue } from "../finalize-preflight";
import { buildFinalizePreflightLogBundle } from "../finalize-preflight-logs";
import { buildSyntaxFailureLog, buildVerifierFailureLogs } from "./failure-log";
import type {
  FinalizePreflightResult,
  FinalizeSyntaxResult,
} from "./types";

export async function persistOrchestrationSnapshot(params: {
  chatId: string;
  versionId: string;
  orchestrationStreamMeta: Record<string, unknown> | null | undefined;
  lineageHash: string | null | undefined;
  buildIntent: BuildIntent | undefined;
}): Promise<void> {
  const { chatId, versionId, orchestrationStreamMeta, lineageHash, buildIntent } = params;
  if (!orchestrationStreamMeta || typeof orchestrationStreamMeta !== "object") return;
  try {
    const snap = buildPersistedOrchestrationSnapshot({
      streamMeta: { ...orchestrationStreamMeta, lineageHash: lineageHash ?? undefined },
      versionId,
      chatId,
      buildIntent: buildIntent ?? null,
    });
    const previous = await chatRepo.getChatOrchestrationSnapshot(chatId);
    const merged = mergePersistedOrchestrationSnapshots(previous, snap);
    await chatRepo.updateChatOrchestrationSnapshot(chatId, merged);
    // P26: trace what we actually persisted so we can attribute later
    // variant-flippar to either missing snapshot.variantId, intent
    // classification or scaffold drift. Tysta info-loggar i prod;
    // devLogAppend gör det synligt i builder-UI.
    const persistedVariantId =
      typeof merged.variantId === "string" ? merged.variantId : null;
    const persistedScaffoldId =
      typeof merged.scaffoldId === "string" ? merged.scaffoldId : null;
    devLogAppend("in-progress", {
      type: "orchestration.snapshot.persisted",
      chatId,
      versionId,
      scaffoldId: persistedScaffoldId,
      variantId: persistedVariantId,
      hasVariantId: persistedVariantId !== null,
    });
  } catch (e) {
    // P26: persistering är kritiskt för variant-locken på följande
    // follow-up. Om det failar tappar vi continuity → variant flippar
    // → "projektet är oigenkännligt"-känsla. Höjer från warn till error
    // och rapporterar till devLog så det syns i builder-UI.
    console.error("[orchestration-snapshot] Failed to persist:", e);
    devLogAppend("in-progress", {
      type: "orchestration.snapshot.persist_failed",
      chatId,
      versionId,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

export interface PreflightLogPersistParams {
  chatId: string;
  versionId: string;
  preflightIssues: FinalizePreflightIssue[];
  preflightFileCount: number;
  previewBlockingReason: string | null;
  previewStart: FinalizePreflightResult["previewStart"];
  finalizedPreviewFileCount: number;
  scaffoldRetry: ScaffoldRetrySuggestion | null;
  routePlan: Parameters<typeof buildFinalizePreflightLogBundle>[0]["routePlan"];
  scaffoldSelection: Record<string, unknown> | null;
  syntaxResult: FinalizeSyntaxResult;
  verifierBlockingFindings: Array<{ id: string; detail: string }>;
  repairPassIndex: number;
  lineageHash: string | null | undefined;
  autoFixHeavyLoad: boolean;
  autoFixFixCount: number;
  autoFixWarningCount: number;
  autoFixDependencyCount: number;
}

export interface PreflightLogPersistResult {
  preflightErrors: Array<{ message: string }>;
  preflightWarnings: Array<{ message: string }>;
  hasPreviewBlockingPreflightErrors: boolean;
  hasVerificationBlockingPreflightErrors: boolean;
  preflightFailureSummary: string;
  logPassId: string;
}

export async function buildAndPersistPreflightLogs(
  params: PreflightLogPersistParams,
): Promise<PreflightLogPersistResult> {
  const {
    chatId,
    versionId,
    preflightIssues,
    preflightFileCount,
    previewBlockingReason,
    previewStart,
    finalizedPreviewFileCount,
    scaffoldRetry,
    routePlan,
    scaffoldSelection,
    syntaxResult,
    verifierBlockingFindings,
    repairPassIndex,
    lineageHash,
    autoFixHeavyLoad,
    autoFixFixCount,
    autoFixWarningCount,
    autoFixDependencyCount,
  } = params;
  const {
    preflightErrors,
    preflightWarnings,
    hasVerificationBlockingPreflightErrors,
    hasPreviewBlockingPreflightErrors,
    preflightLogs: rawPreflightLogs,
    preflightFailureSummary,
  } = buildFinalizePreflightLogBundle({
    chatId,
    versionId,
    preflightIssues,
    preflightFileCount,
    previewBlockingReason,
    previewStart,
    finalizedPreviewFileCount,
    scaffoldRetry,
    routePlan,
    scaffoldSelection,
  });
  const logPassId = `${versionId}:repair-${repairPassIndex}:${Date.now()}`;
  const withLogPassMeta = <T extends { meta?: Record<string, unknown> | null }>(log: T): T => ({
    ...log,
    meta: {
      ...(log.meta ?? {}),
      logPassId,
      repairPassIndex,
      lineageHash: lineageHash ?? null,
    },
  });
  const preflightLogs = rawPreflightLogs.map((log) => withLogPassMeta(log));
  const syntaxFailureLog = buildSyntaxFailureLog({
    chatId,
    versionId,
    syntaxResult,
    logPassId,
    repairPassIndex,
    lineageHash,
  });
  if (syntaxFailureLog) {
    preflightLogs.unshift(syntaxFailureLog);
  }
  const verifierFailureLogs = buildVerifierFailureLogs({
    chatId,
    versionId,
    blockingFindings: verifierBlockingFindings,
    logPassId,
    repairPassIndex,
    lineageHash,
  });
  if (verifierFailureLogs.length > 0) {
    preflightLogs.push(...verifierFailureLogs);
  }
  if (autoFixHeavyLoad) {
    preflightLogs.push({
      chatId,
      versionId,
      level: "warning",
      category: "autofix",
      message:
        "Deterministic autofix applied many repairs; generation quality may be unstable upstream.",
      meta: {
        event: "autofix_heavy_load",
        fixCount: autoFixFixCount,
        threshold: 5,
        warningCount: autoFixWarningCount,
        dependencyCount: autoFixDependencyCount,
        logPassId,
        repairPassIndex,
        lineageHash: lineageHash ?? null,
      },
    });
  }

  try {
    await createEngineVersionErrorLogs(preflightLogs);
    devLogAppend("in-progress", {
      type: "preflight.logs.persisted",
      chatId,
      versionId,
      logCount: preflightLogs.length,
    });
  } catch (logErr) {
    console.warn("[preflight] Failed to persist engine version error logs:", logErr);
    devLogAppend("in-progress", {
      type: "preflight.logs.persist-error",
      chatId,
      versionId,
      logCount: preflightLogs.length,
      message: logErr instanceof Error ? logErr.message : "Unknown preflight log persistence error",
    });
  }

  return {
    preflightErrors,
    preflightWarnings,
    hasPreviewBlockingPreflightErrors,
    hasVerificationBlockingPreflightErrors,
    preflightFailureSummary,
    logPassId,
  };
}

export async function pruneStaleLogsIfCleanRepair(params: {
  chatId: string;
  versionId: string;
  repairPassIndex: number;
  hasPreflightVerificationBlockingErrors: boolean;
}): Promise<void> {
  const {
    chatId,
    versionId,
    repairPassIndex,
    hasPreflightVerificationBlockingErrors,
  } = params;
  // SAJ-25 — pruneStaleVersionErrorLogs:
  //
  // When the same `versionId` is re-finalised (follow-up / repair pass) and
  // this pass has no deterministic preflight/syntax blockers, drop rows from
  // earlier passes whose `meta.repairPassIndex` is < currentRepairPassIndex.
  // Verifier-only findings remain visible for the current pass, but must not
  // keep stale older-pass rows alive and make the diagnostics UI look worse
  // than the latest pass actually is.
  //
  // Best-effort. Never throws. Was hardcoded ON via the now-removed
  // FEATURES.consistentRepairPassIndex flag (inlined 2026-04-28).
  if (repairPassIndex <= 0 || hasPreflightVerificationBlockingErrors) {
    return;
  }
  try {
    const droppedCount = await pruneStaleVersionErrorLogs(versionId, repairPassIndex);
    devLogAppend("in-progress", {
      type: "version_error_log_pruned",
      chatId,
      versionId,
      repairPassIndex,
      droppedCount,
      reason: "clean-followup",
    });
  } catch (pruneErr) {
    console.warn(
      "[finalize] pruneStaleVersionErrorLogs failed (non-fatal):",
      pruneErr,
    );
    devLogAppend("in-progress", {
      type: "version_error_log_pruned.error",
      chatId,
      versionId,
      repairPassIndex,
      message:
        pruneErr instanceof Error ? pruneErr.message : "Unknown prune error",
    });
  }
}

export async function persistGenerationLog(params: {
  chatId: string;
  versionId: string;
  model: string;
  tokenUsage?: { prompt?: number; completion?: number };
  startedAt: number;
  hasVerificationBlockingErrors: boolean;
  verificationFailureSummary: string;
  logNote: string | undefined;
}): Promise<void> {
  const {
    chatId,
    versionId,
    model,
    tokenUsage,
    startedAt,
    hasVerificationBlockingErrors,
    verificationFailureSummary,
    logNote,
  } = params;
  try {
    await chatRepo.logGeneration(
      chatId,
      model,
      {
        prompt: tokenUsage?.prompt,
        completion: tokenUsage?.completion,
      },
      Date.now() - startedAt,
      !hasVerificationBlockingErrors,
      hasVerificationBlockingErrors ? verificationFailureSummary : logNote,
    );
    devLogAppend("in-progress", {
      type: "generation-log.persisted",
      chatId,
      versionId,
      model,
    });
  } catch (generationLogErr) {
    console.warn("[generation-log] Failed to persist engine generation log:", generationLogErr);
    devLogAppend("in-progress", {
      type: "generation-log.persist-error",
      chatId,
      versionId,
      model,
      message:
        generationLogErr instanceof Error
          ? generationLogErr.message
          : "Unknown generation log persistence error",
    });
  }
}

export async function maybeFailVersionVerification(params: {
  chatId: string;
  versionId: string;
  verificationFailureSummary: string;
  preflightErrorsCount: number;
  verifierBlockingFindingCount: number;
}): Promise<Awaited<ReturnType<typeof chatRepo.failVersionVerification>> | null> {
  const {
    chatId,
    versionId,
    verificationFailureSummary,
    preflightErrorsCount,
    verifierBlockingFindingCount,
  } = params;
  try {
    const failedVersion = await chatRepo.failVersionVerification(
      versionId,
      verificationFailureSummary,
    );
    devLogAppend("in-progress", {
      type: "preflight.version.failed",
      chatId,
      versionId,
      errorCount: preflightErrorsCount,
      verifierBlockingFindingCount,
    });
    return failedVersion;
  } catch (verificationErr) {
    console.warn("[preflight] Failed to mark version failed after blocking errors:", verificationErr);
    devLogAppend("in-progress", {
      type: "preflight.version.fail-error",
      chatId,
      versionId,
      message:
        verificationErr instanceof Error
          ? verificationErr.message
          : "Unknown preflight verification update error",
    });
    return null;
  }
}
