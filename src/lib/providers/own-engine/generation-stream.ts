import { formatSSEEvent } from "@/lib/streaming";
import { parseSSEBuffer, SuspenseLineProcessor } from "@/lib/gen/route-helpers";
import { EmptyGenerationError } from "@/lib/gen/stream/finalize-version";
import {
  finalizeOrHandleEmptyGeneration,
  getUnsignaledDetectedIntegrations,
} from "@/lib/gen/stream/shared-own-engine-helpers";
import { devLogAppend, devLogFinalizeSite } from "@/lib/logging/devLog";
import { debugLog, warnLog } from "@/lib/utils/debug";
import type { BuildIntent } from "@/lib/builder/build-intent";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import type { CodeFile } from "@/lib/gen/parser";
import type { RoutePlan } from "@/lib/gen/route-plan";
import { isCanonicalModelId, type CanonicalModelId } from "@/lib/models/catalog";
import * as chatRepo from "@/lib/db/chat-repository-pg";

type UrlMap = Record<string, string>;

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
  routePlan: RoutePlan | null;
  resolvedScaffold: ScaffoldManifest | null;
  urlMap: UrlMap;
  commitCredits: () => Promise<void>;
  previousFiles?: CodeFile[];
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
    routePlan,
    resolvedScaffold,
    urlMap,
    commitCredits,
    previousFiles,
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

        if (options?.userMessage) {
          safeEnqueue(enc.encode(formatSSEEvent("content", options.userMessage)));
        }

        safeEnqueue(
          enc.encode(
            formatSSEEvent("done", {
              chatId,
              versionId: null,
              messageId: null,
              demoUrl: null,
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
        const hasClarifyingQuestion = toolCallNames.has("askClarifyingQuestion");
        warnLog("engine", "No code emitted before finalize", {
          chatId: error.chatId,
          scaffold: error.scaffoldId,
          reason,
          toolCalls,
        });

        if (toolCalls.length > 0) {
          await finishWithoutVersion(reason, {
            awaitingInput: hasClarifyingQuestion,
            userMessage: hasClarifyingQuestion
              ? undefined
              : "Jag hittade integrations- eller miljövariabelbehov inför publicering, men den här körningen returnerade ingen användbar preview-kod. Försök gärna igen - previewn ska normalt kunna byggas vidare med mockdata och placeholders tills riktiga nycklar finns.",
          });
          return;
        }

        await finishWithoutVersion(reason, {
          userMessage: "Ingen kod genererades i första försöket. Försök igen med samma prompt.",
        });
      };

      safeEnqueue(enc.encode(formatSSEEvent("chatId", { id: chatId })));
      safeEnqueue(enc.encode(formatSSEEvent("meta", meta)));

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
        routePlan,
        resolvedScaffold,
        urlMap,
        startedAt: engineStartedAt,
        tokenUsage: {
          prompt: typeof doneData?.promptTokens === "number" ? doneData.promptTokens : undefined,
          completion: typeof doneData?.completionTokens === "number" ? doneData.completionTokens : undefined,
        },
        previousFiles,
        onProgress: emitProgress,
        ...extra,
      });

      const emitDoneWithVersion = async (finalized: {
        version: { id: string };
        messageId: string | null;
        previewUrl: string | null;
        preflight: {
          previewBlocked: boolean;
          verificationBlocked: boolean;
          previewBlockingReason: string | null;
        };
        contentForVersion?: string;
      }) => {
        didSendDone = true;

        const newDetected = getUnsignaledDetectedIntegrations(
          accumulatedContent,
          toolSignaledProviders,
        );
        if (newDetected.length > 0) {
          safeEnqueue(
            enc.encode(formatSSEEvent("integration", { items: newDetected })),
          );
          devLogAppend("in-progress", {
            type: "engine.integration_signals",
            chatId,
            integrations: newDetected.map((d) => d.key),
            envVars: newDetected.flatMap((d) => d.envVars),
          });
        }

        safeEnqueue(
          enc.encode(
            formatSSEEvent("done", {
              chatId,
              versionId: finalized.version.id,
              messageId: finalized.messageId,
              demoUrl: finalized.previewUrl,
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
          demoUrl: finalized.previewUrl,
          durationMs: Date.now() - engineStartedAt,
        });
        devLogFinalizeSite();
        await commitCredits();
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
                const toolName = typeof toolData?.toolName === "string" ? toolData.toolName : "";
                const toolArgs = (toolData?.args as Record<string, unknown>) ?? {};
                if (toolName) toolCallNames.add(toolName);

                if (toolName === "suggestIntegration") {
                  const envVars = Array.isArray(toolArgs.envVars) ? toolArgs.envVars as string[] : [];
                  safeEnqueue(enc.encode(formatSSEEvent("integration", {
                    items: [{
                      key: typeof toolArgs.provider === "string" ? toolArgs.provider : "unknown",
                      name: typeof toolArgs.name === "string" ? toolArgs.name : "Integration",
                      provider: typeof toolArgs.provider === "string" ? toolArgs.provider : undefined,
                      intent: "env_vars" as const,
                      envVars,
                      status: "Behöver konfiguration inför publicering",
                      reason: typeof toolArgs.reason === "string" ? toolArgs.reason : undefined,
                      setupHint: typeof toolArgs.setupHint === "string" ? toolArgs.setupHint : undefined,
                    }],
                  })));
                  const providerKey = typeof toolArgs.provider === "string" ? toolArgs.provider : "unknown";
                  toolSignaledProviders.add(providerKey);
                  debugLog("engine", "Tool: suggestIntegration", { provider: providerKey });
                } else if (toolName === "requestEnvVar") {
                  safeEnqueue(enc.encode(formatSSEEvent("integration", {
                    items: [{
                      key: "custom-env",
                      name: "Miljövariabel",
                      intent: "env_vars" as const,
                      envVars: [typeof toolArgs.key === "string" ? toolArgs.key : "UNKNOWN"],
                      status: "Behöver värde inför publicering",
                    }],
                  })));
                } else if (toolName === "askClarifyingQuestion") {
                  sawBlockingToolCall = true;
                  safeEnqueue(enc.encode(formatSSEEvent("tool-call", {
                    toolName: "askClarifyingQuestion",
                    toolCallId: typeof toolData.toolCallId === "string" ? toolData.toolCallId : `q-${Date.now()}`,
                    args: toolArgs,
                  })));
                } else if (toolName === "emitPlanArtifact") {
                  safeEnqueue(enc.encode(formatSSEEvent("tool-call", {
                    toolName: "emitPlanArtifact",
                    toolCallId: typeof toolData.toolCallId === "string" ? toolData.toolCallId : `plan-${Date.now()}`,
                    args: toolArgs,
                  })));
                }
                break;
              }

              case "done": {
                const flushed = suspense.flush();
                if (flushed) {
                  accumulatedContent += flushed;
                  safeEnqueue(enc.encode(formatSSEEvent("content", flushed)));
                }

                const doneData = evt.data as Record<string, unknown> | null;
                const finalized = await finalizeOrHandleEmptyGeneration({
                  finalizeParams: buildFinalizeParams(accumulatedContent, doneData),
                  emptyGenerationReason: "done_empty_output",
                  handleEmptyGeneration,
                });
                if (!finalized) break;

                await emitDoneWithVersion(finalized);
                break;
              }

              case "error": {
                const msg =
                  typeof (evt.data as Record<string, unknown>)?.message === "string"
                    ? (evt.data as Record<string, string>).message
                    : "Engine generation failed";
                fallbackVerificationSummary =
                  `Återställd ofullständig version efter streamfel: ${msg}`;
                safeEnqueue(enc.encode(formatSSEEvent("error", { message: msg })));
                devLogAppend("in-progress", {
                  type: "comm.error.create",
                  chatId,
                  message: msg,
                });
                break;
              }
            }
          }
        }
      } catch (error) {
        console.error("Engine streaming error:", error);
        fallbackVerificationSummary =
          `Återställd ofullständig version efter streamfel: ${
            error instanceof Error ? error.message : "Engine streaming failed"
          }`;
        safeEnqueue(
          enc.encode(
            formatSSEEvent("error", {
              message: error instanceof Error ? error.message : "Engine streaming failed",
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
              });
              if (fallbackFinalized) {
                await chatRepo
                  .failVersionVerification(
                    fallbackFinalized.version.id,
                    fallbackVerificationSummary,
                  )
                  .catch(() => null);
                await emitDoneWithVersion(fallbackFinalized);
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
                  demoUrl: null,
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
