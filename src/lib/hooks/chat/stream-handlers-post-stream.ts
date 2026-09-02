import { appendToolPartToMessage } from "./helpers";
import { runPostGenerationChecks } from "./post-checks";
import {
  canProceedToPostcheckAfterMaterialization,
  triggerImageMaterialization,
  type ImageMaterializationStatus,
} from "./post-checks-fetch";
import type { StreamContext, StreamRunState } from "./stream-handlers-types";
import type { StreamQualitySignal } from "./types";
import type { PreviewPreflightState } from "@/lib/gen/preview/diagnostics";
import type { AutoFixPayload, SetMessages } from "./types";

function imageMaterializationSteps(result: ImageMaterializationStatus): string[] {
  if (result.error) {
    if (result.error === "timeout" || result.error === "aborted") {
      return [
        "Bildmaterialiseringen avbröts vid tidsgränsen — versionen lämnas pending mot rätt revision.",
      ];
    }
    return ["Bildmaterialisering misslyckades efter att versionen sparats."];
  }
  if (!result.attempted) {
    return [
      result.reason === "blob_not_configured"
        ? "Blob-materialisering hoppades över eftersom Blob inte är konfigurerat."
        : "Bildmaterialisering hoppades över i den här körningen.",
    ];
  }
  if (result.replaced > 0 && result.persisted !== true) {
    return [
      "Bildreferenser byttes i minnet men files_json persistens bekräftades inte — postcheck körs inte mot fel revision.",
    ];
  }
  if (result.replaced > 0) {
    return [`Speglade ${result.replaced} bildreferenser till Blob efter att versionen sparats.`];
  }
  return ["Ingen ytterligare bildmaterialisering behövdes efter att versionen sparats."];
}

export async function runSerializedGenerationTail(params: {
  chatId: string;
  versionId: string;
  demoUrl?: string | null;
  preflight?: PreviewPreflightState | null;
  assistantMessageId: string;
  setMessages: SetMessages;
  streamQuality?: StreamQualitySignal;
  mutateVersions?: () => void;
  onAutoFix: (payload: AutoFixPayload) => void;
  onComplete?: () => void;
  enableImageMaterialization: boolean;
  signal?: AbortSignal;
  materialize?: boolean;
}): Promise<void> {
  const { chatId, versionId, enableImageMaterialization, signal, setMessages, assistantMessageId } =
    params;
  let materializeResult: ImageMaterializationStatus | null = null;
  if (params.materialize !== false && !signal?.aborted) {
    try {
      materializeResult = await triggerImageMaterialization({
        chatId,
        versionId,
        enabled: enableImageMaterialization,
        signal,
      });
    } catch {
      materializeResult = {
        attempted: true,
        strategy: "blob",
        replaced: 0,
        uploaded: 0,
        skipped: 0,
        warningCount: 0,
        persisted: false,
        filesRevision: null,
        error: "network_error",
      };
    }
    if (materializeResult) {
      appendToolPartToMessage(setMessages, assistantMessageId, {
        type: "tool:image-materialization",
        toolName: "Bildmaterialisering",
        toolCallId: `image-materialization:${versionId}`,
        state: materializeResult.error ? "output-error" : "output-available",
        output: {
          attempted: materializeResult.attempted,
          strategy: materializeResult.strategy,
          replaced: materializeResult.replaced,
          uploaded: materializeResult.uploaded,
          skipped: materializeResult.skipped,
          warningCount: materializeResult.warningCount,
          persisted: materializeResult.persisted,
          filesRevision: materializeResult.filesRevision ?? null,
          reason: materializeResult.reason ?? null,
          error: materializeResult.error ?? null,
          steps: imageMaterializationSteps(materializeResult),
        },
      } as Parameters<typeof appendToolPartToMessage>[2]);
    }
  }

  if (signal?.aborted) return;
  if (
    params.materialize !== false &&
    !canProceedToPostcheckAfterMaterialization(
      materializeResult,
      enableImageMaterialization,
    )
  ) {
    return;
  }

  await runPostGenerationChecks({
    chatId,
    versionId,
    demoUrl: params.demoUrl ?? null,
    preflight: params.preflight ?? null,
    assistantMessageId,
    setMessages,
    streamQuality: params.streamQuality,
    mutateVersions: params.mutateVersions,
    onAutoFix: params.onAutoFix,
    onComplete: params.onComplete,
    priorFilesRevision: materializeResult?.filesRevision ?? null,
    imageMutationPersisted:
      Boolean(materializeResult?.persisted) && (materializeResult?.replaced ?? 0) > 0,
  });
}

export function runPostStreamSideEffects(params: {
  state: StreamRunState;
  ctx: StreamContext;
  signal: AbortSignal;
  streamQuality: StreamQualitySignal;
}) {
  const { state, ctx, signal, streamQuality } = params;
  const {
    assistantMessageId,
    setMessages,
    enableImageMaterialization,
    autoFixHandlerRef,
    onVersionStatusRefresh,
    mutateVersions,
  } = ctx;

  setMessages((prev) => {
    const msg = prev.find((m) => m.id === assistantMessageId);
    if (!msg?.isStreaming) return prev;
    return prev.map((m) =>
      m.id === assistantMessageId ? { ...m, isStreaming: false } : m,
    );
  });

  const latestMaterialize =
    state.materializeQueue.length > 0
      ? state.materializeQueue[state.materializeQueue.length - 1]
      : null;
  const latestPostCheck =
    state.postCheckQueue.length > 0
      ? state.postCheckQueue[state.postCheckQueue.length - 1]
      : null;

  // Generation tail (background): materialize → post-checks. GET
  // `/files?materialize=1` now reports `persisted` separately from `replaced`.
  // A timeout aborts the fetch so the route can skip `files_json` persist.
  // Unconfirmed persist must not start Product Postcheck against a stale
  // revision (L3).
  void (async () => {
    if (latestPostCheck && !signal.aborted) {
      await runSerializedGenerationTail({
        chatId: latestPostCheck.chatId,
        versionId: latestPostCheck.versionId,
        demoUrl: latestPostCheck.demoUrl ?? null,
        preflight: latestPostCheck.preflight ?? null,
        assistantMessageId,
        setMessages,
        streamQuality,
        mutateVersions,
        onAutoFix: (payload) => autoFixHandlerRef.current(payload),
        onComplete: onVersionStatusRefresh,
        enableImageMaterialization,
        signal,
        materialize: Boolean(latestMaterialize),
      });
      return;
    }
    if (latestMaterialize && !signal.aborted) {
      await runSerializedGenerationTail({
        chatId: latestMaterialize.chatId,
        versionId: latestMaterialize.versionId,
        assistantMessageId,
        setMessages,
        mutateVersions,
        onAutoFix: (payload) => autoFixHandlerRef.current(payload),
        onComplete: onVersionStatusRefresh,
        enableImageMaterialization,
        signal,
        materialize: true,
      });
    }
  })();
}
