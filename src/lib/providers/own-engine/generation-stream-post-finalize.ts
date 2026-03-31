import * as chatRepo from "@/lib/db/chat-repository-pg";
import { devLogAppend, devLogFinalizeSite } from "@/lib/logging/devLog";
import type { BuildSpec } from "@/lib/gen/build-spec";
import { shouldRunOwnEngineSandbox } from "@/lib/gen/own-engine-sandbox-gate";
import { parseCodeProject, type CodeFile } from "@/lib/gen/parser";
import { logSandboxLifecycleTelemetry } from "@/lib/gen/sandbox-lifecycle-telemetry";
import { startSandboxPreview } from "@/lib/gen/sandbox-preview";
import type { FinalizeResult } from "@/lib/gen/stream/finalize-version";
import { getUnsignaledDetectedIntegrations } from "@/lib/gen/stream/shared-own-engine-helpers";
import { parseCodeFilesFromFilesJson } from "@/lib/gen/version-manager";
import { isSandboxConfigured } from "@/lib/mcp/runtime-url";
import { isServerVerifyEligible, triggerServerVerification } from "@/lib/gen/server-verify";
import type { BuilderIntegrationEnvelope } from "@/lib/gen/stream/builder-stream-contract";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { formatSSEEvent } from "@/lib/streaming";
import { warnLog } from "@/lib/utils/debug";

export type PostFinalizeSse = {
  enc: TextEncoder;
  safeEnqueue: (data: Uint8Array) => void;
};

/**
 * After `finalizeAndSaveVersion`: integration hints, `done` SSE, credits, sandbox boot,
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

  let parsedForSandbox: CodeFile[] = [];
  let parsedFromFinalizeFilesJson = false;
  if (finalized.filesJson?.trim()) {
    try {
      const fromSaved = parseCodeFilesFromFilesJson(finalized.filesJson);
      if (fromSaved && fromSaved.length > 0) {
        parsedForSandbox = fromSaved;
        parsedFromFinalizeFilesJson = true;
      }
    } catch {
      /* fallback below */
    }
  }
  if (parsedForSandbox.length === 0 && finalized.contentForVersion?.trim()) {
    try {
      parsedForSandbox = parseCodeProject(finalized.contentForVersion).files;
    } catch {
      /* no sandbox files */
    }
  }

  const sandboxContract = finalized.preflight.sandbox ?? {
    canStartSandbox: false,
    primaryPreviewTarget: "none" as const,
    shimBlocked: false,
    requiresEnvConfig: false,
    hasCriticalInstallRisk: false,
    hasCriticalCodeFailure: false,
    compatibilityShimAllowed: false,
    issueCounts: {
      code_structure_failure: 0,
      dependency_install_failure: 0,
      env_config_missing: 0,
      shim_preview_failure: 0,
      non_blocking_quality_warning: 0,
    },
    blockingCategories: [],
  };
  const previewBlocked = finalized.preflight.previewBlocked;
  const sandboxWillRun = shouldRunOwnEngineSandbox({
    isSandboxConfigured: isSandboxConfigured(),
    sandbox: sandboxContract,
    parsedFileCount: parsedForSandbox.length,
  });

  safeEnqueue(
    enc.encode(
      formatSSEEvent("done", {
        chatId,
        versionId: finalized.version.id,
        messageId: finalized.messageId,
        ...previewUrlField(null),
        sandboxPending: sandboxWillRun,
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
    sandboxPreviewDeferred: sandboxWillRun,
    previewBlocked,
    durationMs: Date.now() - engineStartedAt,
  });
  devLogFinalizeSite();
  await commitCredits();

  if (isSandboxConfigured() && sandboxWillRun) {
    safeEnqueue(enc.encode(formatSSEEvent("progress", { step: "sandbox", phase: "starting" })));

    try {
      const chatRow = await chatRepo.getChat(chatId);
      const appProjectId =
        typeof chatRow?.project_id === "string" && chatRow.project_id.trim()
          ? chatRow.project_id.trim()
          : null;
      const sandboxResult = await startSandboxPreview(parsedForSandbox, {
        appProjectId,
        chatId,
        previewPolicy: buildSpec.previewPolicy,
        verificationPolicy: buildSpec.verificationPolicy,
        versionIdForSession: finalized.version.id,
        skipRepair: parsedFromFinalizeFilesJson,
      });
      if (sandboxResult.ok) {
        const sr = sandboxResult.result;
        logSandboxLifecycleTelemetry({
          kind: "sandbox_start_outcome",
          chatId,
          versionId: finalized.version.id,
          outcome: sr.startOutcome,
        });
        safeEnqueue(
          enc.encode(
            formatSSEEvent("sandbox-ready", {
              sandboxUrl: sr.sandboxUrl,
              sandboxId: sr.sandboxId,
              sandboxPreviewMode: sr.sandboxPreviewMode,
              fidelityTier: sr.fidelityTier,
              prodBuildVerified: sr.prodBuildVerified,
              ...(sr.prodBuildLogSnippet ? { prodBuildLogSnippet: sr.prodBuildLogSnippet } : {}),
            }),
          ),
        );
        if (sr.sandboxUrl.trim()) {
          chatRepo.updateVersionSandboxUrl(finalized.version.id, sr.sandboxUrl).catch(() => {});
        }
      } else {
        warnLog("engine", "sandbox_preview_failed", {
          chatId,
          versionId: finalized.version.id,
          stage: sandboxResult.error.stage,
          message: sandboxResult.error.message,
        });
        safeEnqueue(enc.encode(formatSSEEvent("build-error", { ...sandboxResult.error })));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sandbox failed";
      warnLog("engine", "sandbox_preview_failed", {
        chatId,
        versionId: finalized.version.id,
        stage: "sandbox-create",
        message,
      });
      safeEnqueue(
        enc.encode(
          formatSSEEvent("build-error", {
            stage: "sandbox-create" as const,
            message,
          }),
        ),
      );
    }
  }

  if (
    isServerVerifyEligible(finalized.version.id) &&
    !finalized.preflight.previewBlocked &&
    !finalized.preflight.verificationBlocked
  ) {
    triggerServerVerification({
      chatId,
      versionId: finalized.version.id,
    }).catch((err) => {
      console.warn("[engine] Background server verification failed:", err);
    });
  }
}
