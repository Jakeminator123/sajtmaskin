import * as chatRepo from "@/lib/db/chat-repository-pg";
import { devLogAppend, devLogFinalizeSite } from "@/lib/logging/devLog";
import type { BuildSpec } from "@/lib/gen/build-spec";
import { parseCodeProject, type CodeFile } from "@/lib/gen/parser";
import { logPreviewLifecycleTelemetry } from "@/lib/gen/preview/lifecycle-telemetry";
import { startPreviewSession } from "@/lib/gen/preview/preview-session";
import { isTier2PreviewConfigured } from "@/lib/gen/preview/tier2-config";
import type { FinalizeResult } from "@/lib/gen/stream/finalize-version";
import {
  resolvePostFinalizeServerVerifyDecision,
  shouldTriggerPostFinalizePreview,
} from "@/lib/gen/stream/post-finalize-policies";
import { getUnsignaledDetectedIntegrations } from "@/lib/gen/stream/shared-own-engine-helpers";
import { parseCodeFilesFromFilesJson } from "@/lib/gen/version-manager";
import { triggerServerVerification } from "@/lib/gen/server-verify";
import type { BuilderIntegrationEnvelope } from "@/lib/gen/stream/builder-stream-contract";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { formatSSEEvent } from "@/lib/streaming";
import { warnLog } from "@/lib/utils/debug";

export type PostFinalizeSse = {
  enc: TextEncoder;
  safeEnqueue: (data: Uint8Array) => void;
};

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
  } = params;

  const newDetected = getUnsignaledDetectedIntegrations(
    accumulatedContent,
    toolSignaledProviders,
  );
  if (newDetected.length > 0) {
    const integrationPayload: BuilderIntegrationEnvelope = { items: newDetected };
    safeEnqueue(enc.encode(formatSSEEvent("integration", integrationPayload)));
    devLogAppend("in-progress", {
      type: "engine.integration_signals",
      chatId,
      integrations: newDetected.map((d) => d.key),
      envVars: newDetected.flatMap((d) => d.envVars),
    });
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
      const previewSessionResult = await startPreviewSession(parsedForPreview, {
        appProjectId,
        chatId,
        previewPolicy: buildSpec.previewPolicy,
        verificationPolicy: buildSpec.verificationPolicy,
        versionIdForSession: finalized.version.id,
        skipRepair: parsedFromFinalizeFilesJson,
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
    }).catch((err) => {
      console.warn("[engine] Background server verification failed:", err);
    });
  }
}
