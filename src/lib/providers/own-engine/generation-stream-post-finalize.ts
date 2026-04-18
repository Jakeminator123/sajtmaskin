import * as chatRepo from "@/lib/db/chat-repository-pg";
import { devLogAppend, devLogFinalizeSite } from "@/lib/logging/devLog";
import type { BuildSpec } from "@/lib/gen/build-spec";
import { parseCodeProject, type CodeFile } from "@/lib/gen/parser";
import { logPreviewLifecycleTelemetry } from "@/lib/gen/preview/lifecycle-telemetry";
import { startPreviewSession } from "@/lib/gen/preview/preview-session";
import { getPreviewHostBaseUrl, isTier2PreviewConfigured } from "@/lib/gen/preview/tier2-config";
import type { FinalizeResult } from "@/lib/gen/stream/finalize-version";
import {
  resolvePostFinalizeServerVerifyDecision,
  shouldTriggerPostFinalizePreview,
} from "@/lib/gen/stream/post-finalize-policies";
import { getUnsignaledDetectedIntegrations } from "@/lib/gen/stream/shared-own-engine-helpers";
import { parseCodeFilesFromFilesJson } from "@/lib/gen/version-manager";
import { triggerServerVerification } from "@/lib/gen/verify/server-verify";
import type { BuilderIntegrationEnvelope } from "@/lib/gen/stream/builder-stream-contract";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { formatSSEEvent } from "@/lib/streaming";
import { debugLog, warnLog } from "@/lib/utils/debug";

export type PostFinalizeSse = {
  enc: TextEncoder;
  safeEnqueue: (data: Uint8Array) => void;
};

function resolvePreviewUrlHint(chatId: string, previewWillRun: boolean): string | null {
  if (!previewWillRun) return null;
  const baseUrl = getPreviewHostBaseUrl();
  if (!baseUrl) return null;

  try {
    const parsed = new URL(baseUrl);
    const normalizedPath = parsed.pathname.replace(/\/$/, "");
    parsed.pathname = `${normalizedPath}/${encodeURIComponent(chatId)}`;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return `${baseUrl.replace(/\/$/, "")}/${encodeURIComponent(chatId)}`;
  }
}

/**
 * After `finalizeAndSaveVersion`: integration hints, `done` SSE, credits, preview boot,
 * background server verification. Keeps `generation-stream.ts` readable.
 */
export async function runOwnEngineStreamPostFinalize(params: {
  sse: PostFinalizeSse;
  chatId: string;
  finalized: FinalizeResult;
  accumulatedContent: string;
  toolSignaledProviders: Set<string>;
  engineStartedAt: number;
  commitCredits: () => Promise<void>;
  buildSpec: BuildSpec;
  /** Stream ended without a normal `done` event; prefer parsing raw accumulated SSE text for preview files. */
  recoveredAfterStreamAbort?: boolean;
  /** 0 = first generation, 1+ = quality-gate-triggered repair pass. */
  repairPassIndex?: number;
}): Promise<void> {
  const {
    sse: { enc, safeEnqueue },
    chatId,
    finalized,
    accumulatedContent,
    toolSignaledProviders,
    engineStartedAt,
    commitCredits,
    buildSpec,
    recoveredAfterStreamAbort = false,
    repairPassIndex = 0,
  } = params;

  // Lager 4 av F2-mute (se .cursor/rules/env-flow-f2-mute.mdc):
  // post-finalize kod-scan av Stripe/Upstash/etc. emitterade tidigare
  // `integration`-SSE direkt till chatten utan lifecycle-gate. I F2
  // (design) hör de hemma i `env.env`-filen tyst, inte i chatten.
  // I F3 (integrations) får de fram som vanligt.
  const isIntegrationsStage = buildSpec.previewPolicy === "fidelity3";
  const newDetected = getUnsignaledDetectedIntegrations(
    accumulatedContent,
    toolSignaledProviders,
  );
  if (newDetected.length > 0) {
    if (isIntegrationsStage) {
      const integrationPayload: BuilderIntegrationEnvelope = { items: newDetected };
      safeEnqueue(enc.encode(formatSSEEvent("integration", integrationPayload)));
      devLogAppend("in-progress", {
        type: "engine.integration_signals",
        chatId,
        integrations: newDetected.map((d) => d.key),
        envVars: newDetected.flatMap((d) => d.envVars),
      });
    } else {
      warnLog(
        "engine",
        "F2 post-finalize: dropped detected-integrations from chat (F2-mute layer 4)",
        {
          chatId,
          integrations: newDetected.map((d) => d.key),
          envVarCount: newDetected.flatMap((d) => d.envVars).length,
        },
      );
    }
  }

  let parsedForPreview: CodeFile[] = [];
  let parsedFromFinalizeFilesJson = false;
  if (finalized.filesJson?.trim()) {
    try {
      const fromSaved = parseCodeFilesFromFilesJson(finalized.filesJson);
      if (fromSaved && fromSaved.length > 0) {
        parsedForPreview = fromSaved;
        parsedFromFinalizeFilesJson = true;
      }
    } catch {
      /* fallback below */
    }
  }
  if (parsedForPreview.length === 0 && finalized.contentForVersion?.trim()) {
    try {
      parsedForPreview = parseCodeProject(finalized.contentForVersion).files;
    } catch {
      /* no preview files */
    }
  }
  if (
    recoveredAfterStreamAbort &&
    parsedForPreview.length === 0 &&
    accumulatedContent.trim()
  ) {
    try {
      parsedForPreview = parseCodeProject(accumulatedContent).files;
    } catch {
      /* still no preview files */
    }
  }

  const previewBlocked = finalized.preflight.previewBlocked;
  const previewWillRun = shouldTriggerPostFinalizePreview({
    finalized,
    parsedFileCount: parsedForPreview.length,
  });
  const previewUrlHint = resolvePreviewUrlHint(chatId, previewWillRun);

  // `done` confirms that version persistence/finalize finished. Live preview is a separate
  // post-done phase and only becomes canonical on `preview-ready` (or explicit GET status/routes).
  safeEnqueue(
    enc.encode(
      formatSSEEvent("done", {
        chatId,
        versionId: finalized.version.id,
        messageId: finalized.messageId,
        ...previewUrlField(null),
        previewPending: previewWillRun,
        shimPreviewUrl: null,
        preflight: finalized.preflight,
        previewBlocked: finalized.preflight.previewBlocked,
        verificationBlocked: finalized.preflight.verificationBlocked,
        previewBlockingReason: finalized.preflight.previewBlockingReason,
        releaseState: finalized.version.release_state,
        verificationState: finalized.version.verification_state,
        verificationSummary: finalized.version.verification_summary,
        promotedAt: finalized.version.promoted_at,
        ...(previewUrlHint ? { previewUrlHint } : {}),
      }),
    ),
  );

  devLogAppend("in-progress", {
    type: "site.done",
    chatId,
    versionId: finalized.version.id,
    previewUrl: null,
    previewDeferred: previewWillRun,
    previewBlocked,
    durationMs: Date.now() - engineStartedAt,
  });
  devLogFinalizeSite();
  await commitCredits();

  if (isTier2PreviewConfigured() && previewWillRun) {
    safeEnqueue(enc.encode(formatSSEEvent("progress", { step: "preview", phase: "starting" })));

    try {
      const chatRow = await chatRepo.getChat(chatId);
      const appProjectId =
        typeof chatRow?.project_id === "string" && chatRow.project_id.trim()
          ? chatRow.project_id.trim()
          : null;
      const previewSessionStartedAt = Date.now();
      let previewSessionResult: Awaited<ReturnType<typeof startPreviewSession>>;
      try {
        previewSessionResult = await startPreviewSession(parsedForPreview, {
          appProjectId,
          chatId,
          previewPolicy: buildSpec.previewPolicy,
          verificationPolicy: buildSpec.verificationPolicy,
          versionIdForSession: finalized.version.id,
          // F3 previews must strip tier3-stub placeholders so missing real
          // env vars surface as a runtime failure instead of being silently
          // backfilled with `sk_test_...`-style stubs.
          lifecycleStage:
            buildSpec.previewPolicy === "fidelity3" ? "integrations" : "design",
          skipRepair: parsedFromFinalizeFilesJson,
          // filesJson from finalize is already scaffold-merged/repaired
          // so preview bootstrap can skip project scaffold rebuild.
          skipProjectScaffold: parsedFromFinalizeFilesJson,
        });
      } catch (previewStartError) {
        debugLog("preview", "Preview session started", {
          durationMs: Math.max(0, Date.now() - previewSessionStartedAt),
          chatId,
          versionId: finalized.version.id,
          appProjectId,
          ok: false,
          stage: "preview-start",
          message:
            previewStartError instanceof Error ? previewStartError.message : "Preview start failed",
        });
        throw previewStartError;
      }
      debugLog("preview", "Preview session started", {
        durationMs: Math.max(0, Date.now() - previewSessionStartedAt),
        chatId,
        versionId: finalized.version.id,
        appProjectId,
        ok: previewSessionResult.ok,
        ...(previewSessionResult.ok
          ? {
              startOutcome: previewSessionResult.result.startOutcome,
              previewTier: previewSessionResult.result.fidelityTier,
            }
          : {
              stage: previewSessionResult.error.stage,
              failureCode: previewSessionResult.error.failureCode,
            }),
      });
      if (previewSessionResult.ok) {
        const sr = previewSessionResult.result;
        logPreviewLifecycleTelemetry({
          kind: "preview_start_outcome",
          chatId,
          versionId: finalized.version.id,
          outcome: sr.startOutcome,
          previewPolicy: buildSpec.previewPolicy,
          verificationPolicy: buildSpec.verificationPolicy,
          tier2Provider: sr.tier2Meta?.tier2Provider,
        });
        logPreviewLifecycleTelemetry({
          kind: "preview_ready",
          chatId,
          versionId: finalized.version.id,
          sandboxId: sr.sandboxId,
          sandboxPreviewMode: sr.sandboxPreviewMode,
          fidelityTier: sr.fidelityTier,
          prodBuildVerified: sr.prodBuildVerified,
          startOutcome: sr.startOutcome,
          previewPolicy: buildSpec.previewPolicy,
          verificationPolicy: buildSpec.verificationPolicy,
          msSinceEngineStart: Math.max(0, Date.now() - engineStartedAt),
        });
        safeEnqueue(
          enc.encode(
            formatSSEEvent("preview-ready", {
              previewUrl: sr.sandboxUrl,
              previewSessionId: sr.sandboxId,
              previewMode: sr.sandboxPreviewMode,
              previewTier: sr.fidelityTier,
              ...(sr.prodBuildVerified !== undefined ? { prodBuildVerified: sr.prodBuildVerified } : {}),
              ...(sr.prodBuildLogSnippet ? { prodBuildLogSnippet: sr.prodBuildLogSnippet } : {}),
            }),
          ),
        );
        if (sr.sandboxUrl.trim()) {
          chatRepo.updateVersionPreviewUrl(finalized.version.id, sr.sandboxUrl).catch((error) => {
            warnLog("engine", "Failed to persist previewUrl after preview-ready", {
              chatId,
              versionId: finalized.version.id,
              previewUrl: sr.sandboxUrl,
              message: error instanceof Error ? error.message : "Unknown error",
            });
          });
        }
      } else {
        logPreviewLifecycleTelemetry({
          kind: "preview_failed",
          chatId,
          versionId: finalized.version.id,
          stage: previewSessionResult.error.stage,
          failureCode: previewSessionResult.error.failureCode,
          detail: previewSessionResult.error.message,
          previewPolicy: buildSpec.previewPolicy,
          verificationPolicy: buildSpec.verificationPolicy,
          msSinceEngineStart: Math.max(0, Date.now() - engineStartedAt),
        });
        warnLog("engine", "preview_failed", {
          chatId,
          versionId: finalized.version.id,
          stage: previewSessionResult.error.stage,
          message: previewSessionResult.error.message,
        });
        safeEnqueue(enc.encode(formatSSEEvent("build-error", { ...previewSessionResult.error })));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Preview start failed";
      logPreviewLifecycleTelemetry({
        kind: "preview_failed",
        chatId,
        versionId: finalized.version.id,
        stage: "preview-start",
        detail: message,
        previewPolicy: buildSpec.previewPolicy,
        verificationPolicy: buildSpec.verificationPolicy,
        msSinceEngineStart: Math.max(0, Date.now() - engineStartedAt),
      });
      warnLog("engine", "preview_failed", {
        chatId,
        versionId: finalized.version.id,
        stage: "preview-start",
        message,
      });
      safeEnqueue(
        enc.encode(
          formatSSEEvent("build-error", {
            stage: "preview-start" as const,
            message,
          }),
        ),
      );
    }
  }

  const serverVerifyDecision = resolvePostFinalizeServerVerifyDecision({
    buildSpec,
    finalized,
    repairPassIndex,
  });
  devLogAppend("in-progress", {
    type: "server-verify.policy",
    chatId,
    versionId: finalized.version.id,
    run: serverVerifyDecision.run,
    reason: serverVerifyDecision.reason,
    verificationPolicy: buildSpec.verificationPolicy,
    qualityTarget: buildSpec.qualityTarget,
    buildIntent: buildSpec.buildIntent,
    changeScope: buildSpec.changeScope,
  });

  if (serverVerifyDecision.run) {
    triggerServerVerification({
      chatId,
      versionId: finalized.version.id,
      onRepairAvailable: (payload) => {
        safeEnqueue(
          enc.encode(
            formatSSEEvent("version-repair-available", {
              versionId: payload.versionId,
              summary: payload.summary,
              repairAvailableAt: payload.repairAvailableAt,
            }),
          ),
        );
      },
    }).catch((err) => {
      console.warn("[engine] Background server verification failed:", err);
    });
  }
}
