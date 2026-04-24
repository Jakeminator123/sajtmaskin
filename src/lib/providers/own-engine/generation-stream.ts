import { previewUrlField } from "@/lib/api/preview-url-contract";
import { formatSSEEvent } from "@/lib/streaming";
import { parseSSEBuffer, SuspenseLineProcessor } from "@/lib/gen/stream/sse-parser";
import {
  EmptyGenerationError,
  PartialFileOutputError,
  type FinalizeResult,
} from "@/lib/gen/stream/finalize-version";
import type { BuildSpec } from "@/lib/gen/build-spec";
import type { OrchestrationContract } from "@/lib/gen/orchestration-contract";
import { finalizeOrHandleEmptyGeneration } from "@/lib/gen/stream/shared-own-engine-helpers";
import { devLogAppend, devLogFinalizeSite } from "@/lib/logging/devLog";
import { warnLog } from "@/lib/utils/debug";
import { emitOwnEngineToolCallSse } from "./generation-stream-tools";
import { runOwnEngineStreamPostFinalize } from "./generation-stream-post-finalize";
import { classifyProviderError } from "./provider-error-messages";
import type { BuildIntent } from "@/lib/builder/build-intent";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import type { CodeFile } from "@/lib/gen/parser";
import type { RoutePlan } from "@/lib/gen/route-plan";
import { isCanonicalModelId, type CanonicalModelId } from "@/lib/models/catalog";
import * as chatRepo from "@/lib/db/chat-repository-pg";

type UrlMap = Record<string, string>;

/**
 * Pulls a non-negative reasoning-token count out of whatever shape the
 * upstream pipeline forwarded in its `done` event. Both the OpenAI
 * Responses API (`usage.reasoning_tokens`) and the AI-SDK wrappers
 * (`tokenUsage.reasoningTokens`) eventually reach us as a flat object on
 * the `done` SSE payload, but the exact key has historically drifted
 * between providers/wrappers. We normalise it here so downstream summaries
 * see "visible output tokens" (`outputTokens` / `completionTokens`) and
 * "reasoning tokens" as two distinct numbers — without that, a thinking
 * model that emits 38 files from a 600-token visible response looks
 * suspiciously cheap in the logs.
 */
function extractReasoningTokens(streamResponse: unknown): number | undefined {
  if (!streamResponse || typeof streamResponse !== "object") return undefined;
  const root = streamResponse as Record<string, unknown>;

  const candidates: unknown[] = [
    root.reasoningTokens,
    root.reasoning_tokens,
  ];

  const usage =
    typeof root.usage === "object" && root.usage !== null
      ? (root.usage as Record<string, unknown>)
      : null;
  if (usage) {
    candidates.push(usage.reasoningTokens, usage.reasoning_tokens);
  }

  const tokenUsage =
    typeof root.tokenUsage === "object" && root.tokenUsage !== null
      ? (root.tokenUsage as Record<string, unknown>)
      : null;
  if (tokenUsage) {
    candidates.push(tokenUsage.reasoningTokens, tokenUsage.reasoning_tokens);
  }

  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }
  return undefined;
}

export interface GenerationStreamMeta extends Record<string, unknown> {
  modelId: string;
  modelTier: string;
  buildProfileId: string;
  buildProfileLabel: string;
  enginePath: string;
  thinking: boolean;
}

export interface GenerationStreamParams {
  chatId: string;
  pipelineStream: ReadableStream<Uint8Array>;
  abortSignal?: AbortSignal;
  meta: GenerationStreamMeta;
  engineModel: string;
  optimizedMessage: string;
  engineIntent: BuildIntent;
  buildSpec: BuildSpec;
  routePlan: RoutePlan | null;
  orchestrationContract?: OrchestrationContract | null;
  resolvedScaffold: ScaffoldManifest | null;
  urlMap: UrlMap;
  commitCredits: () => Promise<void>;
  previousFiles?: CodeFile[];
  /** SHA-256 of deterministic generation inputs (prompt lineage). */
  lineageHash?: string | null;
  /** When set, repair replaces this version in-place instead of creating a new one. */
  targetVersionId?: string | null;
  /** F3 only: parent F2 version id, forwarded into `engine_versions.parent_version_id`. */
  lifecycleParentVersionId?: string | null;
  /**
   * Mutable container holding the concatenated reasoning emitted by the
   * pipeline. The pipeline writes into `current` once the stream completes
   * (success/abort/error); the finalize step reads it just before persisting
   * the assistant message so the chain-of-thought survives a page refresh.
   */
  accumulatedThinkingRef?: { current: string | null };
}

export function createOwnEngineGenerationStream(
  params: GenerationStreamParams,
): ReadableStream<Uint8Array> {
  const {
    chatId,
    pipelineStream,
    abortSignal,
    meta,
    engineModel,
    optimizedMessage,
    engineIntent,
    buildSpec,
    routePlan,
    orchestrationContract,
    resolvedScaffold,
    urlMap,
    commitCredits,
    previousFiles,
    lineageHash,
    targetVersionId,
    lifecycleParentVersionId,
    accumulatedThinkingRef,
  } = params;

  const engineStartedAt = Date.now();
  const pipelineReader = pipelineStream.getReader();
  const pipelineDecoder = new TextDecoder();
  let engineControllerClosed = false;
  let enginePingTimer: ReturnType<typeof setInterval> | null = null;
  const stopEnginePing = () => {
    if (!enginePingTimer) return;
    clearInterval(enginePingTimer);
    enginePingTimer = null;
  };

  return new ReadableStream({
    cancel() {
      engineControllerClosed = true;
      stopEnginePing();
      pipelineReader.cancel().catch(() => {});
    },
    async start(controller) {
      const enc = new TextEncoder();
      let sseBuffer = "";
      let accumulatedContent = "";
      let didSendDone = false;
      let fallbackVerificationSummary =
        "Återställd ofullständig version efter streamavbrott. Automatisk verifiering hoppades över.";
      const toolSignaledProviders = new Set<string>();
      const toolCallNames = new Set<string>();
      let sawBlockingToolCall = false;
      const suspense = new SuspenseLineProcessor(undefined, { urlMap });

      const safeEnqueue = (data: Uint8Array) => {
        if (engineControllerClosed) return;
        try {
          controller.enqueue(data);
        } catch {
          engineControllerClosed = true;
          stopEnginePing();
        }
      };

      const safeClose = () => {
        if (engineControllerClosed) return;
        engineControllerClosed = true;
        stopEnginePing();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const emitProgress = (event: string, data: Record<string, unknown>) => {
        safeEnqueue(enc.encode(formatSSEEvent("progress", { step: event, ...data })));
      };

      const finishWithoutVersion = async (
        reason: string,
        options?: { userMessage?: string; awaitingInput?: boolean },
      ) => {
        didSendDone = true;
        const toolCalls = Array.from(toolCallNames);
        const awaitingInput = options?.awaitingInput ?? sawBlockingToolCall;
        emitProgress("generation", {
          phase: awaitingInput ? "awaiting-input" : "empty-output",
          reason,
        });

        if (options?.userMessage) {
          safeEnqueue(enc.encode(formatSSEEvent("content", options.userMessage)));
        }

        safeEnqueue(
          enc.encode(
            formatSSEEvent("done", {
              chatId,
              versionId: null,
              messageId: null,
              ...previewUrlField(null),
              awaitingInput,
              toolCalls,
              reason,
            }),
          ),
        );

        devLogAppend("in-progress", {
          type: awaitingInput ? "site.awaiting_input" : "site.empty_generation",
          chatId,
          reason,
          toolCalls,
          message: options?.userMessage ?? null,
        });
        devLogFinalizeSite();
        await commitCredits();
      };

      const handleEmptyGeneration = async (reason: string, error: EmptyGenerationError) => {
        const toolCalls = Array.from(toolCallNames);
        warnLog("engine", "No code emitted before finalize", {
          chatId: error.chatId,
          scaffold: error.scaffoldId,
          reason,
          toolCalls,
        });

        if (toolCalls.length > 0) {
          await finishWithoutVersion(reason, { awaitingInput: sawBlockingToolCall });
          return;
        }

        await finishWithoutVersion(reason, {
          userMessage: "Ingen kod genererades i första försöket. Försök igen med samma prompt.",
        });
      };

      const handlePartialFileOutput = async (error: PartialFileOutputError) => {
        const toolCalls = Array.from(toolCallNames);
        const reason = "partial_file_output";
        warnLog("engine", "Partial file output detected before persist", {
          chatId: error.chatId,
          scaffold: error.scaffoldId,
          issues: error.issues,
          toolCalls,
        });

        didSendDone = true;
        emitProgress("generation", {
          phase: "partial-file-output",
          reason,
          issueCount: error.issues.length,
        });

        safeEnqueue(
          enc.encode(
            formatSSEEvent("error", {
              message:
                "Genereringen stoppades innan sparning eftersom minst en fil såg ut som en delsnutt i stället för en komplett fil.",
            }),
          ),
        );
        safeEnqueue(
          enc.encode(
            formatSSEEvent("done", {
              chatId,
              versionId: null,
              messageId: null,
              ...previewUrlField(null),
              awaitingInput: false,
              toolCalls,
              reason,
            }),
          ),
        );

        devLogAppend("in-progress", {
          type: "site.partial_file_output",
          chatId,
          reason,
          issues: error.issues,
          toolCalls,
          message:
            "Genereringen stoppades innan version skapades eftersom en eller flera filer såg ut som partiel snippet-output.",
        });
        devLogFinalizeSite();
        await commitCredits();
      };

      safeEnqueue(enc.encode(formatSSEEvent("chatId", { id: chatId })));
      safeEnqueue(enc.encode(formatSSEEvent("meta", meta)));
      emitProgress("generation", { phase: "start" });

      enginePingTimer = setInterval(() => {
        if (engineControllerClosed) return;
        safeEnqueue(enc.encode(formatSSEEvent("ping", { ts: Date.now() })));
      }, 15000);

      const resolvedTier: CanonicalModelId | undefined = isCanonicalModelId(meta.modelTier)
        ? (meta.modelTier as CanonicalModelId)
        : undefined;
      const buildFinalizeParams = (
        content: string,
        doneData: Record<string, unknown> | null,
        extra?: { logNote?: string; runAutofix?: boolean },
      ) => ({
        accumulatedContent: content,
        chatId,
        model: engineModel,
        resolvedTier,
        originalPrompt: optimizedMessage,
        buildIntent: engineIntent,
        buildSpec,
        routePlan,
        orchestrationContract,
        resolvedScaffold,
        urlMap,
        startedAt: engineStartedAt,
        orchestrationStreamMeta: meta as Record<string, unknown>,
        tokenUsage: {
          prompt: typeof doneData?.promptTokens === "number" ? doneData.promptTokens : undefined,
          completion: typeof doneData?.completionTokens === "number" ? doneData.completionTokens : undefined,
        },
        previousFiles,
        onProgress: emitProgress,
        lineageHash,
        targetVersionId,
        lifecycleParentVersionId,
        // SAJ-25: propagate repairPassIndex so finalize-version's `logPassId`
        // bucket stops collapsing follow-up passes under `:repair-0:` and
        // pruneStaleVersionErrorLogs can drop earlier-pass rows when the
        // current pass clears `verificationBlocked`. Mirrors the value used
        // in runOwnEngineStreamPostFinalize so both sides agree.
        repairPassIndex: targetVersionId ? 1 : 0,
        accumulatedThinking: accumulatedThinkingRef?.current ?? null,
        // Builder client always runs post-check quality-gate after `done`
        // (or after queued autofix), so finalize can safely skip duplicate
        // warm-tsc when that lane already includes `typecheck`.
        willRunQualityGate: true,
        ...extra,
      });

      const emitDoneWithVersion = async (
        finalized: FinalizeResult,
        options?: { recoveredAfterStreamAbort?: boolean },
      ) => {
        didSendDone = true;
        await runOwnEngineStreamPostFinalize({
          sse: { enc, safeEnqueue },
          chatId,
          finalized,
          accumulatedContent,
          toolSignaledProviders,
          engineStartedAt,
          commitCredits,
          buildSpec,
          recoveredAfterStreamAbort: options?.recoveredAfterStreamAbort === true,
          repairPassIndex: targetVersionId ? 1 : 0,
        });
      };

      try {
        while (true) {
          if (engineControllerClosed || abortSignal?.aborted) break;
          const { done, value } = await pipelineReader.read();
          if (done) break;

          sseBuffer += pipelineDecoder.decode(value, { stream: true });
          const { events, remaining } = parseSSEBuffer(sseBuffer);
          sseBuffer = remaining;

          for (const evt of events) {
            if (engineControllerClosed) break;

            switch (evt.event) {
              case "thinking": {
                const text =
                  typeof (evt.data as Record<string, unknown>)?.text === "string"
                    ? (evt.data as Record<string, string>).text
                    : "";
                if (text) {
                  safeEnqueue(enc.encode(formatSSEEvent("thinking", text)));
                }
                break;
              }

              case "content": {
                const text =
                  typeof (evt.data as Record<string, unknown>)?.text === "string"
                    ? (evt.data as Record<string, string>).text
                    : "";
                if (text) {
                  const processed = suspense.process(text);
                  accumulatedContent += processed;
                  if (processed) {
                    safeEnqueue(enc.encode(formatSSEEvent("content", processed)));
                  }
                }
                break;
              }

              case "tool-call": {
                const toolData = evt.data as Record<string, unknown>;
                emitOwnEngineToolCallSse(
                  {
                    enc,
                    safeEnqueue,
                    toolCallNames,
                    toolSignaledProviders,
                    setBlockingToolCall: () => {
                      sawBlockingToolCall = true;
                    },
                    lifecycleStage:
                      buildSpec.previewPolicy === "fidelity3"
                        ? "integrations"
                        : "design",
                  },
                  toolData,
                );
                safeEnqueue(
                  enc.encode(
                    formatSSEEvent("progress", {
                      step: "generation",
                      phase: "tool",
                      toolName:
                        typeof toolData?.toolName === "string" ? toolData.toolName : undefined,
                    }),
                  ),
                );
                break;
              }

              case "progress": {
                const progressData = evt.data as Record<string, unknown>;
                const step =
                  typeof progressData?.step === "string" ? progressData.step : "generation";
                const phase =
                  typeof progressData?.phase === "string" ? progressData.phase : "streaming";
                emitProgress(step, { ...progressData, phase });
                break;
              }

              case "done": {
                const flushed = suspense.flush();
                if (flushed) {
                  accumulatedContent += flushed;
                  safeEnqueue(enc.encode(formatSSEEvent("content", flushed)));
                }

                const doneData = evt.data as Record<string, unknown> | null;
                const reasoningTokens = extractReasoningTokens(doneData);
                if (typeof reasoningTokens === "number") {
                  // Emit reasoning-token usage as a first-class signal so the
                  // generationslogg summary can show "visible output tokens"
                  // (`outputTokens`) and "reasoning tokens" as two distinct
                  // numbers — the previous summary made a thinking model that
                  // emitted dozens of files from a 600-token visible response
                  // look suspiciously cheap. The downstream `tokenUsage` shape
                  // is intentionally left untouched here; finalize-version
                  // still receives the visible (prompt/completion) totals.
                  devLogAppend("in-progress", {
                    type: "stream.token-usage",
                    chatId,
                    promptTokens:
                      typeof doneData?.promptTokens === "number"
                        ? doneData.promptTokens
                        : null,
                    outputTokens:
                      typeof doneData?.completionTokens === "number"
                        ? doneData.completionTokens
                        : null,
                    reasoningTokens,
                  });
                }
                const finalized = await finalizeOrHandleEmptyGeneration({
                  finalizeParams: buildFinalizeParams(accumulatedContent, doneData),
                  emptyGenerationReason: "done_empty_output",
                  handleEmptyGeneration,
                  handlePartialFileOutput,
                });
                if (!finalized) break;

                await emitDoneWithVersion(finalized);
                break;
              }

              case "error": {
                const data = evt.data as Record<string, unknown> | undefined;
                const rawMsg =
                  typeof data?.message === "string"
                    ? (data.message as string)
                    : "Engine generation failed";
                const classified = classifyProviderError(
                  // Pass the whole data shape so classifier can read code/status.
                  { ...(data ?? {}), message: rawMsg },
                  rawMsg,
                );
                fallbackVerificationSummary = `Återställd ofullständig version efter streamfel: ${classified.userMessage}`;
                safeEnqueue(
                  enc.encode(
                    formatSSEEvent("error", {
                      message: classified.userMessage,
                      ...(classified.code ? { code: classified.code } : {}),
                      ...(classified.permanent ? { permanent: true } : {}),
                    }),
                  ),
                );
                devLogAppend("in-progress", {
                  type: "comm.error.create",
                  chatId,
                  message: classified.userMessage,
                  rawMessage: rawMsg !== classified.userMessage ? rawMsg : undefined,
                  providerCode: classified.code,
                  permanent: classified.permanent,
                });
                break;
              }
            }
          }
        }
      } catch (error) {
        console.error("Engine streaming error:", error);
        const classified = classifyProviderError(error, "Engine streaming failed");
        fallbackVerificationSummary = `Återställd ofullständig version efter streamfel: ${classified.userMessage}`;
        safeEnqueue(
          enc.encode(
            formatSSEEvent("error", {
              message: classified.userMessage,
              ...(classified.code ? { code: classified.code } : {}),
              ...(classified.permanent ? { permanent: true } : {}),
            }),
          ),
        );
      } finally {
        try {
          pipelineReader.releaseLock();
        } catch {
          /* Reader may already be released */
        }

        if (sseBuffer.trim()) {
          const { events: finalEvents } = parseSSEBuffer(sseBuffer + "\n");
          for (const evt of finalEvents) {
            if (evt.event === "content") {
              const text =
                typeof (evt.data as Record<string, unknown>)?.text === "string"
                  ? (evt.data as Record<string, string>).text
                  : "";
              if (text) {
                const processed = suspense.process(text);
                accumulatedContent += processed;
                if (processed) {
                  safeEnqueue(enc.encode(formatSSEEvent("content", processed)));
                }
              }
            } else if (evt.event === "done" && !didSendDone) {
              const flushed = suspense.flush();
              if (flushed) {
                accumulatedContent += flushed;
                safeEnqueue(enc.encode(formatSSEEvent("content", flushed)));
              }

              const doneData = evt.data as Record<string, unknown> | null;
              const bufFinalized = await finalizeOrHandleEmptyGeneration({
                finalizeParams: buildFinalizeParams(accumulatedContent, doneData, {
                  logNote: "Done from buffer flush",
                }),
                emptyGenerationReason: "buffer_flush_empty_output",
                handleEmptyGeneration,
                handlePartialFileOutput,
              });
              if (!bufFinalized) break;

              await emitDoneWithVersion(bufFinalized);
            }
          }
        }

        if (!didSendDone) {
          const flushed = suspense.flush();
          if (flushed) accumulatedContent += flushed;

          if (accumulatedContent) {
            try {
              const fallbackFinalized = await finalizeOrHandleEmptyGeneration({
                finalizeParams: buildFinalizeParams(accumulatedContent, null, {
                  runAutofix: false,
                  logNote: "Done from fallback flush",
                }),
                emptyGenerationReason: "fallback_flush_empty_output",
                handleEmptyGeneration,
                handlePartialFileOutput,
              });
              if (fallbackFinalized) {
                await chatRepo
                  .failVersionVerification(
                    fallbackFinalized.version.id,
                    fallbackVerificationSummary,
                  )
                  .catch(() => null);
                await emitDoneWithVersion(fallbackFinalized, {
                  recoveredAfterStreamAbort: true,
                });
              }
            } catch {
              /* ignore persistence errors in cleanup */
            }
          }

          if (!didSendDone) {
            safeEnqueue(
              enc.encode(
                formatSSEEvent("done", {
                  chatId,
                  versionId: null,
                  messageId: null,
                  ...previewUrlField(null),
                }),
              ),
            );
            await commitCredits();
          }
        }
        safeClose();
      }
    },
  });
}
