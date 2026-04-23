// TODO(plan-09): kandidat för borttagning — legacy "optimistic clear" fallback bakom verifierRerunAfterFix kan tas bort när flaggan förblir hardcoded ON.
/**
 * Verifier-pass phase for `runFinalizeFastPath`: runs the verifier,
 * optionally feeds blocking findings back to the LLM fixer, re-runs the
 * verifier on the fixed content (when `FEATURES.verifierRerunAfterFix`),
 * and emits error-log-RAG events along the way.
 *
 * Split out of `finalize-version.ts` (OMTAG-03 wave-rest) — no behavior
 * change.
 */

import type { BuildSpec } from "@/lib/gen/build-spec";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import { FEATURES } from "@/lib/config";
import { DEFAULT_MODEL_ID, type CanonicalModelId } from "@/lib/models/catalog";
import { resolvePhaseModel, resolvePhaseThinking } from "@/lib/models/phase-routing";
import { runLlmFixer } from "@/lib/gen/autofix/llm-fixer";
import {
  formatVerifierFindingsAsFixerErrors,
  runVerifierPass,
} from "@/lib/gen/verify/verifier-pass";
import { readRecurringPatternsForChat } from "@/lib/logging/generation-log-writer";
import { appendErrorLogEvent } from "@/lib/logging/error-log-rag";
import { devLogAppend } from "@/lib/logging/devLog";
import type { AutoFixResult } from "@/lib/gen/autofix/pipeline";
import { createFinalizeStepTelemetry } from "./step-telemetry";
import {
  VERIFIER_REPAIR_TIMEOUT_MS,
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
  } = params;
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
      // Samma DEFAULT_MODEL_ID-fallback som används i partial-file-repair
      // ovan — fixerModel ska aldrig vara undefined så phaseRouting alltid
      // följer manifestet (inte runLlmFixer:s interna default).
      const verifierFixerTier = resolvedTier ?? DEFAULT_MODEL_ID;
      const fixerModel = resolvePhaseModel(verifierFixerTier, "fixer").modelId;
      const fixerThinking = resolvePhaseThinking(verifierFixerTier, "fixer");
      const verifierFixAbort = new AbortController();
      const verifierFixTimeout = setTimeout(
        () => verifierFixAbort.abort(),
        VERIFIER_REPAIR_TIMEOUT_MS,
      );
      let fixerImproved = false;
      try {
        const repaired = await runLlmFixer(contentForVersion, fixerErrors, {
          model: fixerModel,
          thinking: fixerThinking?.thinking,
          reasoningEffort: fixerThinking?.reasoningEffort,
          recurringPatterns: readRecurringPatternsForChat(chatId),
          abortSignal: verifierFixAbort.signal,
        });
        let rerunBlockingCount: number | null = null;
        let rerunDurationMs: number | null = null;
        if (repaired.success && repaired.fixedContent) {
          const reFixed = await runAutoFix(repaired.fixedContent);
          contentForVersion = reFixed.fixedContent;
          fixerImproved = true;

          // Repair-loop hardening B (gated on FEATURES.verifierRerunAfterFix):
          //
          // Re-run the verifier ONCE on the fixed content to confirm the
          // LLM actually addressed the blocking finding. Without this we
          // optimistically cleared `verifierBlockingFindings` and could
          // tell the UI "fixed" when nothing was fixed. Capped at one
          // re-run + a 30 s timeout so latency stays bounded.
          if (FEATURES.verifierRerunAfterFix) {
            const rerunStartedAt = Date.now();
            const rerunAbort = new AbortController();
            const rerunTimeout = setTimeout(
              () => rerunAbort.abort(),
              VERIFIER_REPAIR_TIMEOUT_MS,
            );
            try {
              const rerunFindings = await runVerifierPass(contentForVersion, {
                resolvedTier: verifierTier,
              });
              rerunDurationMs = Date.now() - rerunStartedAt;
              rerunBlockingCount = rerunFindings.blocking.length;
              // Trust the rerun: if the fixer truly fixed it the count is
              // 0; if not the version stays verifier-blocked with the
              // *current* findings (not the stale ones).
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
              // Fall back to the optimistic clear so we do not regress
              // behaviour when the rerun cannot complete.
              verifierBlockingFindings = [];
            } finally {
              clearTimeout(rerunTimeout);
            }
          } else {
            // Legacy optimistic clear (no rerun) — kept behind feature
            // flag during rollout to avoid regressing latency budgets.
            verifierBlockingFindings = [];
          }
        }
        devLogAppend("in-progress", {
          type: "verifier-pass.fixer",
          chatId,
          findingsBefore: findings.blocking.length,
          findingsAfterRerun: rerunBlockingCount,
          rerunDurationMs,
          fixerImproved,
          success: repaired.success,
          partial: repaired.partial,
          scaffoldId: resolvedScaffold?.id ?? null,
        });
        // Phase 3.1 producer — emit a "fixed" / "noop" row per blocking
        // finding so future RAG queries see what worked.
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
              result:
                rerunBlockingCount === 0
                  ? "fixed"
                  : rerunBlockingCount === null
                    ? "fixed"
                    : "still-failing",
              chatId,
              versionId: null,
              scaffoldId: resolvedScaffold?.id ?? null,
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
      } finally {
        clearTimeout(verifierFixTimeout);
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
