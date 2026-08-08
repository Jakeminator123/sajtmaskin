import { consumeSseResponse } from "@/lib/builder/sse";
import type { StreamQualitySignal } from "./types";
import {
  finalizeStreamStats,
  initStreamStats,
} from "./helpers";
import { readPreviewPreflight } from "./post-checks-preview";
import {
  handleContentEvent,
  handleIntegrationEvent,
  handlePartsEvent,
  handleProgressEvent,
  handleThinkingEvent,
  handleToolCallEvent,
} from "./stream-handlers-content";
import { handleDoneEvent } from "./stream-handlers-done";
import {
  handleBuildErrorEvent,
  handleChatIdEvent,
  handleErrorEvent,
  handleMetaEvent,
  handlePreviewReadyEvent,
  handleProjectIdEvent,
  handleVersionRepairAvailableEvent,
} from "./stream-handlers-lifecycle";
import { createPreviewUrlDeliverer } from "./stream-handlers-preview-delivery";
import { appendProgressPart } from "./stream-handlers-progress";
import { runPostStreamSideEffects } from "./stream-handlers-post-stream";
import { createStreamingTextBatcher } from "./stream-handlers-text-batch";
import type {
  StreamContext,
  StreamHandlerResult,
  StreamRunState,
} from "./stream-handlers-types";

export type { StreamContext } from "./stream-handlers-types";
export type { ProgressPartState } from "./stream-handlers-progress";
export { resolveProgressPartState } from "./stream-handlers-progress";

export async function handleSseStream(
  response: Response,
  ctx: StreamContext,
  signal: AbortSignal,
): Promise<StreamHandlerResult> {
  const state: StreamRunState = {
    chatIdFromStream: null,
    versionIdFromStream: null,
    recoveredArtifactSignal: false,
    linkedProjectIdFromStream: null,
    accumulatedThinking: "",
    accumulatedContent: "",
    didReceiveDone: false,
    generationProgressStarted: false,
    generationDoneProgressReceived: false,
    pendingStreamErrorMessage: null,
    postCheckQueue: [],
    materializeQueue: [],
    streamStats: initStreamStats(ctx.streamType, ctx.assistantMessageId),
  };

  let streamQuality: StreamQualitySignal = { hasCriticalAnomaly: false, reasons: [] };

  const deliverPreviewUrl = createPreviewUrlDeliverer(ctx);
  const boundAppendProgressPart = (
    step: string,
    phase: string,
    payload: Record<string, unknown> = {},
  ) => appendProgressPart(ctx.setMessages, ctx.assistantMessageId, step, phase, payload);

  const { requestStreamingTextFlush, flushStreamingTextNow } = createStreamingTextBatcher({
    setMessages: ctx.setMessages,
    assistantMessageId: ctx.assistantMessageId,
    getAccumulatedContent: () => state.accumulatedContent,
    getAccumulatedThinking: () => state.accumulatedThinking,
  });

  const parseDonePreflight = (doneData: Record<string, unknown>) =>
    readPreviewPreflight(doneData);

  const contentDeps = {
    appendProgressPart: boundAppendProgressPart,
    requestStreamingTextFlush,
  };
  const lifecycleDeps = {
    appendProgressPart: boundAppendProgressPart,
    deliverPreviewUrl,
  };
  const doneDeps = {
    appendProgressPart: boundAppendProgressPart,
    deliverPreviewUrl,
    parseDonePreflight,
  };

  try {
    await consumeSseResponse(
      response,
      (event, data) => {
        ctx.touchStreamSafetyTimer();
        // Commit any batched streaming text before a non-text event so its
        // handler (done/parts/error/preview-ready/…) sees and can overwrite the
        // exact message state it would have in the pre-batch synchronous flow.
        if (event !== "content" && event !== "thinking") {
          flushStreamingTextNow();
        }
        switch (event) {
          case "meta": {
            handleMetaEvent(data, state, ctx);
            break;
          }
          case "thinking": {
            handleThinkingEvent(data, state, ctx, contentDeps);
            break;
          }
          case "content": {
            handleContentEvent(data, state, ctx, contentDeps);
            break;
          }
          case "parts": {
            handlePartsEvent(data, state, ctx);
            break;
          }
          case "integration": {
            handleIntegrationEvent(data, state, ctx);
            break;
          }
          case "tool-call": {
            handleToolCallEvent(data, state, ctx);
            break;
          }
          case "progress": {
            handleProgressEvent(data, state, ctx, contentDeps);
            break;
          }
          case "chatId": {
            handleChatIdEvent(data, state, ctx);
            break;
          }
          case "projectId": {
            handleProjectIdEvent(data, state, ctx);
            break;
          }
          case "preview-ready": {
            handlePreviewReadyEvent(data, state, ctx, lifecycleDeps);
            break;
          }
          case "build-error": {
            handleBuildErrorEvent(data, state, ctx, lifecycleDeps);
            break;
          }
          case "version-repair-available": {
            handleVersionRepairAvailableEvent(data, state, ctx);
            break;
          }
          case "done": {
            handleDoneEvent(data, state, ctx, doneDeps);
            break;
          }
          case "error": {
            handleErrorEvent(data, state);
            break;
          }
        }
      },
      { signal },
    );
  } finally {
    // Guaranteed final flush: commit any streaming text that arrived after the
    // last non-text event (incl. success/error/abort paths) before the stream
    // winds down, so the last delta is never dropped.
    flushStreamingTextNow();
    state.streamStats.chatId =
      state.streamStats.chatId ?? state.chatIdFromStream ?? ctx.chatId ?? null;
    state.streamStats.didReceiveDone =
      state.streamStats.didReceiveDone || state.didReceiveDone;
    state.streamStats.abortedByClient = signal.aborted;
    streamQuality = finalizeStreamStats(state.streamStats);
  }

  if (!state.didReceiveDone) {
    if (signal.aborted) {
      const abortErr = new Error("Streaming aborted by client");
      abortErr.name = "AbortError";
      throw abortErr;
    }
    throw new Error(
      state.pendingStreamErrorMessage ||
        "Streamen avslutades innan genereringen var klar. Försök igen.",
    );
  }
  if (ctx.streamType === "create" && !state.chatIdFromStream) {
    throw new Error("No chat ID returned from stream");
  }

  runPostStreamSideEffects({ state, ctx, signal, streamQuality });

  return {
    streamQuality,
    chatIdFromStream: state.chatIdFromStream,
    hasRecoveredArtifact: state.recoveredArtifactSignal,
  };
}
