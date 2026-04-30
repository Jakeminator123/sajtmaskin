/**
 * Verifier-pass phase for `runFinalizeFastPath`: runs the verifier,
 * feeds blocking findings back to the LLM fixer, and re-runs the
 * verifier once on the fixed content to confirm the fix actually
 * addressed the blocking finding. Emits error-log-RAG events along
 * the way.
 *
 * Success semantics (`verifier-pass.fixer` log row):
 *   `success` is TRUE only when the LLM repair-gate succeeded AND the
 *   re-run shows strictly fewer blocking findings than the initial
 *   pass. A re-run that crashes (count remains `null`) or shows
 *   `>= initial` blockers counts as `success: false` — earlier code
 *   copied `repaired.success` as-is, which produced false-positive
 *   `success: true` rows when findings actually grew (postmortem
 *   2026-04-28 run `20260428-041927-freeform`).
 */

import type { BuildSpec } from "@/lib/gen/build-spec";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import type { CanonicalModelId } from "@/lib/models/catalog";
import { RepairLedger, runLlmRepairGate } from "@/lib/gen/autofix/llm-repair-gate";
import {
  extractFilePathsFromVerifierFindings,
  formatVerifierFindingsAsFixerErrors,
  runVerifierPass,
} from "@/lib/gen/verify/verifier-pass";
import { appendErrorLogEvent } from "@/lib/logging/error-log-rag";
import { devLogAppend } from "@/lib/logging/devLog";
import type { AutoFixResult } from "@/lib/gen/autofix/pipeline";
import { createFinalizeStepTelemetry } from "./step-telemetry";
import {
  VERIFIER_REPAIR_TIMEOUT_MS,
  VERIFIER_RERUN_TIMEOUT_MS,
  type FinalizeProgressCallback,
  type FinalizeStepTelemetry,
} from "./types";

export interface VerifierPhaseResult {
  contentForVersion: string;
  verifierBlockingFindings: Array<{ id: string; detail: string }>;
  stepTelemetry: FinalizeStepTelemetry;
}

export async function runVerifierPhase(params: {
  enabled: boolean;
  reason: string;
  chatId: string;
  model: string;
  resolvedTier?: CanonicalModelId;
  verifierTier: CanonicalModelId;
  buildSpec?: BuildSpec | null;
  resolvedScaffold: ScaffoldManifest | null;
  repairPassIndex: number;
  contentForVersion: string;
  onProgress?: FinalizeProgressCallback;
  runAutoFix: (content: string) => Promise<AutoFixResult>;
  repairLedger?: RepairLedger;
  repairScopeId?: string;
}): Promise<VerifierPhaseResult> {
  const {
    enabled,
    reason,
    chatId,
    model,
    resolvedTier,
    verifierTier,
    resolvedScaffold,
    repairPassIndex,
    onProgress,
    runAutoFix,
    repairLedger: providedRepairLedger,
    repairScopeId,
  } = params;
  const repairLedger = providedRepairLedger ?? new RepairLedger();
  let contentForVersion = params.contentForVersion;
  let verifierBlockingFindings: Array<{ id: string; detail: string }> = [];

  if (!enabled) {
    onProgress?.("verifier", { phase: "skipped", reason });
    return {
      contentForVersion,
      verifierBlockingFindings,
      stepTelemetry: createFinalizeStepTelemetry(Date.now(), "skipped", { reason }),
    };
  }

  const verifierStartedAt = Date.now();
  onProgress?.("verifier", { phase: "start" });
  let stepTelemetry: FinalizeStepTelemetry = createFinalizeStepTelemetry(
    verifierStartedAt,
    "error",
  );
  try {
    const findings = await runVerifierPass(contentForVersion, { resolvedTier: verifierTier });
    verifierBlockingFindings = findings.blocking.slice(0, 5);
    devLogAppend("in-progress", {
      type: "verifier-pass",
      chatId,
      blocking: findings.blocking.length,
      quality: findings.quality.length,
      blockingFindings: findings.blocking.slice(0, 5),
      qualityFindings: findings.quality.slice(0, 5),
      scaffoldId: resolvedScaffold?.id ?? null,
      resolvedTier: resolvedTier ?? null,
    });
    // Phase 3.1 producer — feed the RAG NDJSON so retriever can surface
    // these to future generations on similar inputs.
    const ragGenerationMode =
      params.buildSpec?.generationMode === "followUp"
        ? "followup"
        : params.buildSpec?.generationMode === "init"
          ? "init"
          : repairPassIndex > 0
            ? "followup"
            : null;
    const ragCapabilityIds = params.buildSpec?.capabilityFlags?.signals ?? [];
    const ragRoutePath = params.buildSpec?.routeRealization?.primaryRoutePath ?? null;
    for (const finding of findings.blocking.slice(0, 5)) {
      appendErrorLogEvent({
        phase: "post-gen",
        subphase: "verifier-pass",
        creator: "verifier",
        severity: "error",
        fault: finding.id,
        faultText: finding.detail,
        fixText: null,
        modelTier: resolvedTier ?? null,
        model,
        provider: "own-engine",
        repairPassIndex,
        result: "still-failing",
        chatId,
        versionId: null, // version not minted yet at this point
        scaffoldId: resolvedScaffold?.id ?? null,
        routePath: ragRoutePath,
        capabilityIds: ragCapabilityIds,
        generationMode: ragGenerationMode,
        lineageHash: null, // not threaded into runFinalizeFastPath today
      });
    }
    onProgress?.("verifier", {
      phase: "done",
      durationMs: Date.now() - verifierStartedAt,
      blockingCount: findings.blocking.length,
      qualityCount: findings.quality.length,
    });
    stepTelemetry = createFinalizeStepTelemetry(verifierStartedAt, "done", {
      trigger: reason,
      blockingCount: findings.blocking.length,
      qualityCount: findings.quality.length,
    });

    // Close the verifier feedback loop: when there are blocking findings,
    // feed them straight back into the LLM fixer with the same prompt
    // shape used for syntax/typecheck repairs. Previously these findings
    // were only logged + used to set `verificationBlocked` — paying for
    // the verifier model with no chance for a quick auto-fix.
    if (findings.blocking.length > 0) {
      const verifierFixStartedAt = Date.now();
      onProgress?.("verifier", {
        phase: "fixing",
        findingsCount: findings.blocking.length,
      });
      const fixerErrors = formatVerifierFindingsAsFixerErrors({
        blocking: findings.blocking,
      });
      // SAJ-61 c5: feed the structured file list to the repair gate so
      // the LLM treats the named files as required outputs (the merge
      // keeps unchanged files anyway, but `requiredFiles` lets the
      // fixer prompt focus on them and the partial-file detector
      // notice if any get truncated).
      const requiredFiles = extractFilePathsFromVerifierFindings({
        blocking: findings.blocking,
      });
      let fixerImproved = false;
      try {
        const repairGate = await runLlmRepairGate({
          content: contentForVersion,
          errors: fixerErrors,
          chatId,
          timeoutMs: VERIFIER_REPAIR_TIMEOUT_MS,
          resolvedTier,
          ...(requiredFiles.length > 0 ? { requiredFiles } : {}),
          scopeId: repairScopeId,
          phase: "verifier",
          ledger: repairLedger,
        });
        const repaired = repairGate.result;
        let rerunBlockingCount: number | null = null;
        let rerunDurationMs: number | null = null;
        if (repaired.success && repaired.fixedContent) {
          const reFixed = await runAutoFix(repaired.fixedContent);
          contentForVersion = reFixed.fixedContent;

          // Re-run the verifier ONCE on the fixed content to confirm the
          // LLM actually addressed the blocking finding. Without this we
          // optimistically cleared `verifierBlockingFindings` and could
          // tell the UI "fixed" when nothing was fixed. Capped at one
          // re-run + a 30 s timeout so latency stays bounded.
          //
          // Hardcoded ON since omtag-04 (2026-04-23). Throw → keep the
          // pre-fix findings (rerunBlockingCount stays null, treated as
          // unverified, not fixed).
          const rerunStartedAt = Date.now();
          const rerunAbort = new AbortController();
          const rerunTimeout = setTimeout(
            () => rerunAbort.abort(),
            VERIFIER_RERUN_TIMEOUT_MS,
          );
          try {
            const rerunFindings = await runVerifierPass(contentForVersion, {
              resolvedTier: verifierTier,
              abortSignal: rerunAbort.signal,
            });
            rerunDurationMs = Date.now() - rerunStartedAt;
            rerunBlockingCount = rerunFindings.blocking.length;
            verifierBlockingFindings = rerunFindings.blocking.slice(0, 5);
            devLogAppend("in-progress", {
              type: "verifier_rerun_after_fix",
              chatId,
              before: findings.blocking.length,
              after: rerunFindings.blocking.length,
              durationMs: rerunDurationMs,
              scaffoldId: resolvedScaffold?.id ?? null,
            });
          } catch (rerunErr) {
            console.warn(
              "[verifier-pass] Re-run after fix failed (non-fatal):",
              rerunErr,
            );
            devLogAppend("in-progress", {
              type: "verifier_rerun_after_fix.error",
              chatId,
              message:
                rerunErr instanceof Error
                  ? rerunErr.message
                  : "Unknown verifier rerun error",
            });
            // Intentionally leave `verifierBlockingFindings` unchanged
            // (pre-fix findings stay so the version remains correctly
            // marked verifier-blocked).
          } finally {
            clearTimeout(rerunTimeout);
          }
        }
        // Postmortem 2026-04-28 run `20260428-041927-freeform`:
        // `success` was previously copied straight from `repaired.success`
        // (the LLM-merge succeeded), which made `success: true` rows fire
        // even when re-run findings GREW from 2 → 3. Anchor `success` (and
        // `fixerImproved`) on the rerun count instead so telemetry matches
        // observable reality.
        const fixerOutcomeSuccess =
          repaired.success &&
          rerunBlockingCount !== null &&
          rerunBlockingCount < findings.blocking.length;
        fixerImproved = fixerOutcomeSuccess;
        devLogAppend("in-progress", {
          type: "verifier-pass.fixer",
          chatId,
          findingsBefore: findings.blocking.length,
          findingsAfterRerun: rerunBlockingCount,
          rerunDurationMs,
          fixerImproved,
          success: fixerOutcomeSuccess,
          partial: repaired.partial,
          repairGateSuccess: repaired.success,
          scaffoldId: resolvedScaffold?.id ?? null,
        });
        // Phase 3.1 producer — emit a "fixed" / "still-failing" row per
        // blocking finding so future RAG queries see what worked.
        // `rerunBlockingCount === null` (rerun crashed) is unverified, not
        // fixed — earlier code mapped it to "fixed" which lied to RAG.
        if (fixerImproved) {
          for (const finding of findings.blocking.slice(0, 5)) {
            appendErrorLogEvent({
              phase: "post-gen",
              subphase: "verifier-fixer",
              creator: "llm-verifier-fixer",
              fixer: "llm-verifier-fixer",
              severity: "warning",
              fault: finding.id,
              faultText: finding.detail,
              fixText: "verifier-fixer rewrote the offending file(s)",
              modelTier: resolvedTier ?? null,
              model,
              provider: "own-engine",
              repairPassIndex,
              result: rerunBlockingCount === 0 ? "fixed" : "still-failing",
              chatId,
              versionId: null,
              scaffoldId: resolvedScaffold?.id ?? null,
              routePath: ragRoutePath,
              capabilityIds: ragCapabilityIds,
              generationMode: ragGenerationMode,
              lineageHash: null,
            });
          }
        }
        onProgress?.("verifier", {
          phase: "fixed",
          durationMs: Date.now() - verifierFixStartedAt,
          findingsBefore: findings.blocking.length,
          fixerImproved,
        });
      } catch (verifierFixErr) {
        console.warn(
          "[verifier-pass] Fixer pass failed, keeping advisory blockers:",
          verifierFixErr,
        );
        devLogAppend("in-progress", {
          type: "verifier-pass.fixer-error",
          chatId,
          message:
            verifierFixErr instanceof Error
              ? verifierFixErr.message
              : "Unknown verifier fixer error",
        });
      }
      stepTelemetry = createFinalizeStepTelemetry(verifierStartedAt, "done", {
        trigger: reason,
        blockingCount: findings.blocking.length,
        qualityCount: findings.quality.length,
        fixerUsed: true,
        fixerImproved,
        findingsBefore: findings.blocking.length,
        findingsAfter: verifierBlockingFindings.length,
      });
    }
  } catch (verifierErr) {
    console.warn("[verifier-pass] Non-fatal error, skipping:", verifierErr);
    onProgress?.("verifier", { phase: "error" });
    stepTelemetry = createFinalizeStepTelemetry(verifierStartedAt, "error");
  }

  return {
    contentForVersion,
    verifierBlockingFindings,
    stepTelemetry,
  };
}
