import { appendToolPartToMessage } from "./helpers";
import { runPostGenerationChecks } from "./post-checks";
import { triggerImageMaterialization } from "./post-checks-fetch";
import type { StreamContext, StreamRunState } from "./stream-handlers-types";
import type { StreamQualitySignal } from "./types";

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
  // `/files?materialize=1` does not emit 409 — persist contention is
  // swallowed server-side and the read still returns. A failed
  // materialization must not swallow the rest of the tail.
  void (async () => {
    if (latestMaterialize && !signal.aborted) {
      try {
        const result = await triggerImageMaterialization({
          chatId: latestMaterialize.chatId,
          versionId: latestMaterialize.versionId,
          enabled: enableImageMaterialization,
        });
        if (result) {
          appendToolPartToMessage(setMessages, assistantMessageId, {
            type: "tool:image-materialization",
            toolName: "Bildmaterialisering",
            toolCallId: `image-materialization:${latestMaterialize.versionId}`,
            state: result.error ? "output-error" : "output-available",
            output: {
              attempted: result.attempted,
              strategy: result.strategy,
              replaced: result.replaced,
              uploaded: result.uploaded,
              skipped: result.skipped,
              warningCount: result.warningCount,
              reason: result.reason ?? null,
              error: result.error ?? null,
              steps: result.error
                ? ["Bildmaterialisering misslyckades efter att versionen sparats."]
                : !result.attempted
                  ? [
                      result.reason === "blob_not_configured"
                        ? "Blob-materialisering hoppades över eftersom Blob inte är konfigurerat."
                        : "Bildmaterialisering hoppades över i den här körningen.",
                    ]
                  : result.replaced > 0
                    ? [
                        `Speglade ${result.replaced} bildreferenser till Blob efter att versionen sparats.`,
                      ]
                    : [
                        "Ingen ytterligare bildmaterialisering behövdes efter att versionen sparats.",
                      ],
            },
          } as Parameters<typeof appendToolPartToMessage>[2]);
        }
      } catch {
        // Best-effort: same as the previous fire-and-forget `.then` without a
        // `.catch` that aborted the tail. Post-checks still run below.
      }
    }

    if (latestPostCheck && !signal.aborted) {
      await runPostGenerationChecks({
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
      });
    }
  })();
}
