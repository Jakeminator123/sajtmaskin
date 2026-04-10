import {
  createBuilderStreamEvent,
  type BuilderStreamEvent,
  type BuilderStreamEventName,
} from "@/lib/gen/stream/builder-stream-contract";
import { formatSSEEvent } from "@/lib/streaming";
import { devLogAppend } from "@/lib/logging/devLog";
import { debugLog } from "@/lib/utils/debug";

export interface StreamMeta {
  chatId?: string;
  versionId?: string;
  [key: string]: unknown;
}

/**
 * Structural type covering the subset of a `streamText()` result
 * that the SSE formatter needs.  Using structural typing avoids
 * coupling to the exact generic signature of `StreamTextResult<TOOLS>`.
 */
interface StreamTextLike {
  fullStream: AsyncIterable<{
    type: string;
    text?: string;
    textDelta?: string;
    reasoning?: string;
    reasoningDelta?: string;
    error?: unknown;
    toolName?: string;
    toolCallId?: string;
    args?: Record<string, unknown>;
    input?: unknown;
    inputText?: string;
    inputTextDelta?: string;
  }>;
  usage: PromiseLike<{ inputTokens: number | undefined; outputTokens: number | undefined }>;
}

function resolveStreamText(part: { text?: string; textDelta?: string }): string | undefined {
  return part.textDelta ?? part.text;
}

function resolveReasoningText(part: {
  reasoning?: string;
  reasoningDelta?: string;
  text?: string;
  textDelta?: string;
}): string | undefined {
  return part.reasoningDelta ?? part.reasoning ?? part.textDelta ?? part.text;
}

const LEAKED_THINKING_OPEN_TAG = "<thinking>";
const LEAKED_THINKING_CLOSE_TAG = "</thinking>";

function isPotentialLeadingThinkingPrefix(value: string): boolean {
  const afterLeadingWhitespace = value.replace(/^\s+/, "");
  if (!afterLeadingWhitespace) return true;
  return LEAKED_THINKING_OPEN_TAG.startsWith(afterLeadingWhitespace.toLowerCase());
}

function createLeadingThinkingLeakFilter(enabled: boolean): (chunk?: string) => string {
  if (!enabled) {
    return (chunk?: string) => chunk ?? "";
  }

  let prefixBuffer = "";
  let suppressedBuffer = "";
  let suppressing = false;
  let filterDone = false;

  const consumeWhileSuppressing = (chunk: string): string => {
    suppressedBuffer += chunk;
    const closeIndex = suppressedBuffer.toLowerCase().indexOf(LEAKED_THINKING_CLOSE_TAG);
    if (closeIndex === -1) return "";
    const trailing = suppressedBuffer.slice(closeIndex + LEAKED_THINKING_CLOSE_TAG.length);
    suppressedBuffer = "";
    suppressing = false;
    filterDone = true;
    return trailing;
  };

  return (chunk?: string): string => {
    if (!chunk) return "";
    if (filterDone) return chunk;

    if (suppressing) {
      return consumeWhileSuppressing(chunk);
    }

    prefixBuffer += chunk;
    const openingMatch = /^\s*<thinking>/i.exec(prefixBuffer);
    if (openingMatch) {
      suppressing = true;
      const afterOpeningTag = prefixBuffer.slice(openingMatch[0].length);
      prefixBuffer = "";
      return afterOpeningTag ? consumeWhileSuppressing(afterOpeningTag) : "";
    }

    if (isPotentialLeadingThinkingPrefix(prefixBuffer)) {
      return "";
    }

    filterDone = true;
    const passthrough = prefixBuffer;
    prefixBuffer = "";
    return passthrough;
  };
}

function parseToolArgs(candidate: unknown): Record<string, unknown> | null {
  if (!candidate) return null;
  if (typeof candidate === "object" && !Array.isArray(candidate)) {
    return candidate as Record<string, unknown>;
  }
  if (typeof candidate !== "string") return null;

  const trimmed = candidate.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function resolveToolInputDelta(part: {
  inputTextDelta?: string;
  textDelta?: string;
  text?: string;
}): string {
  return part.inputTextDelta ?? part.textDelta ?? part.text ?? "";
}

function resolveDirectProviderFromMeta(meta?: StreamMeta): "openai" | "anthropic" | null {
  const modelId = typeof meta?.modelId === "string" ? meta.modelId.trim().toLowerCase() : "";
  if (!modelId) return null;
  return modelId.startsWith("claude-") ? "anthropic" : "openai";
}

/**
 * Converts an AI SDK `streamText()` result into an SSE-formatted ReadableStream.
 *
 * Events emitted:
 *  `meta`     — { chatId, versionId }   (if meta is provided)
 *  `thinking` — { text }                reasoning deltas (if thinking=true)
 *  `content`  — { text }                code/text deltas
 *  `done`     — { promptTokens, completionTokens }
 *  `error`    — { message }             on failures
 */
export function createCodeGenSSEStream(
  result: StreamTextLike,
  options: { thinking?: boolean; meta?: StreamMeta; abortController?: AbortController } = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const { thinking = false, meta } = options;
  const stripLeadingThinkingLeak = createLeadingThinkingLeakFilter(!thinking);

  return new ReadableStream({
    async start(controller) {
      const streamStartedAt = Date.now();
      const eventCounts = new Map<string, number>();
      const toolCallCounts = new Map<string, number>();
      const toolInputFallbackCounters = new Map<string, number>();
      const activeToolFallbackKeys = new Map<string, string>();
      const pendingToolInputs = new Map<
        string,
        { toolName?: string; toolCallId?: string; inputText: string }
      >();
      let firstReasoningTokenAt: number | null = null;
      let firstContentTokenAt: number | null = null;
      let emittedGenerationStart = false;
      let emittedReasoningWait = false;
      let emittedOutputWait = false;
      let sawContentEvent = false;
      let reasoningHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
      const enqueue = <TEvent extends BuilderStreamEventName>(
        streamEvent: BuilderStreamEvent<TEvent>,
      ) => {
        controller.enqueue(encoder.encode(formatSSEEvent(streamEvent.event, streamEvent.data)));
      };
      const ensureGenerationStarted = () => {
        if (emittedGenerationStart) return;
        emittedGenerationStart = true;
        enqueue(
          createBuilderStreamEvent("progress", {
            step: "generation",
            phase: "start",
          }),
        );
      };
      const getToolInputKey = (part: {
        type?: string;
        toolCallId?: string;
        toolName?: string;
      }): string | null => {
        if (part.toolCallId) return part.toolCallId;
        if (!part.toolName) return null;

        const isStartEvent =
          part.type === "tool-input-start" || part.type === "tool_call_streaming_start";

        if (!isStartEvent) {
          const activeKey = activeToolFallbackKeys.get(part.toolName);
          if (activeKey) return activeKey;
        }

        const nextIndex = (toolInputFallbackCounters.get(part.toolName) ?? 0) + 1;
        toolInputFallbackCounters.set(part.toolName, nextIndex);
        const fallbackKey = `tool:${part.toolName}:${nextIndex}`;
        activeToolFallbackKeys.set(part.toolName, fallbackKey);
        return fallbackKey;
      };
      const rememberToolInput = (
        part: {
          type?: string;
          toolName?: string;
          toolCallId?: string;
          inputText?: string;
          inputTextDelta?: string;
          text?: string;
          textDelta?: string;
        },
        mode: "reset" | "append",
      ) => {
        const key = getToolInputKey(part);
        if (!key) return;
        const previous = pendingToolInputs.get(key);
        const delta = mode === "append" ? resolveToolInputDelta(part) : "";
        const initialText =
          mode === "reset" ? (part.inputText ?? part.text ?? "") : (previous?.inputText ?? "");
        pendingToolInputs.set(key, {
          toolName: part.toolName ?? previous?.toolName,
          toolCallId: part.toolCallId ?? previous?.toolCallId,
          inputText: `${initialText}${delta}`,
        });
      };
      const emitToolCall = (part: {
        type?: string;
        toolName?: string;
        toolCallId?: string;
        args?: Record<string, unknown>;
        input?: unknown;
      }): boolean => {
        const key = getToolInputKey(part);
        const buffered = key ? pendingToolInputs.get(key) : undefined;
        const args =
          parseToolArgs(part.args) ??
          parseToolArgs(part.input) ??
          parseToolArgs(buffered?.inputText) ??
          {};
        const toolName = part.toolName ?? buffered?.toolName;
        const toolCallId =
          part.toolCallId ??
          buffered?.toolCallId ??
          (key && key.startsWith("tool:") ? key : undefined);
        if (!toolName) return false;
        toolCallCounts.set(toolName, (toolCallCounts.get(toolName) ?? 0) + 1);
        enqueue(
          createBuilderStreamEvent("tool-call", {
            toolName,
            toolCallId,
            args,
          }),
        );
        if (key) pendingToolInputs.delete(key);
        if (!toolCallId && key && activeToolFallbackKeys.get(toolName) === key) {
          activeToolFallbackKeys.delete(toolName);
        }
        return true;
      };

      const summarizeStream = (
        phase: "done" | "error",
        usage?: {
          inputTokens: number | undefined;
          outputTokens: number | undefined;
        },
      ) => {
        const streamEndedAt = Date.now();
        const durationMs = Math.max(0, streamEndedAt - streamStartedAt);
        const reasoningMs =
          firstReasoningTokenAt !== null && firstContentTokenAt !== null
            ? Math.max(0, firstContentTokenAt - firstReasoningTokenAt)
            : 0;
        const outputMs =
          firstContentTokenAt !== null ? Math.max(0, streamEndedAt - firstContentTokenAt) : 0;
        const usageAvailable =
          typeof usage?.inputTokens === "number" || typeof usage?.outputTokens === "number";
        debugLog("engine", "Own-engine stream summary (AI SDK wrapper, direct provider)", {
          provider: resolveDirectProviderFromMeta(meta),
          transport: "direct_provider_api",
          sdk: "ai",
          model: typeof meta?.modelId === "string" ? meta.modelId : null,
          phase,
          chatId: meta?.chatId ?? null,
          versionId: meta?.versionId ?? null,
          eventCounts: Object.fromEntries(eventCounts),
          toolCalls: Object.fromEntries(toolCallCounts),
          tokenUsage: {
            available: usageAvailable,
            inputTokens: usage?.inputTokens ?? null,
            outputTokens: usage?.outputTokens ?? null,
            unavailableReason:
              usageAvailable || phase !== "error"
                ? null
                : "stream_aborted_or_provider_error_before_usage_report",
          },
        });
        debugLog("engine", "LLM stream phases", {
          phase,
          streamStartedAt,
          firstReasoningTokenAt,
          firstContentTokenAt,
          streamEndedAt,
          durationMs,
          reasoningMs,
          outputMs,
          chatId: meta?.chatId ?? null,
          versionId: meta?.versionId ?? null,
        });
        return {
          durationMs,
          reasoningMs,
          outputMs,
        };
      };

      try {
        if (meta) {
          enqueue(createBuilderStreamEvent("meta", meta));
        }

        for await (const part of result.fullStream) {
          eventCounts.set(part.type, (eventCounts.get(part.type) ?? 0) + 1);

          switch (part.type) {
            case "start":
            case "start-step":
            case "finish-step":
            case "finish": {
              ensureGenerationStarted();
              break;
            }

            case "reasoning-start": {
              ensureGenerationStarted();
              if (firstReasoningTokenAt === null) {
                firstReasoningTokenAt = Date.now();
              }
              if (thinking && !emittedReasoningWait) {
                emittedReasoningWait = true;
                enqueue(
                  createBuilderStreamEvent("progress", {
                    step: "generation",
                    phase: "reasoning",
                  }),
                );
                if (reasoningHeartbeatTimer === null) {
                  reasoningHeartbeatTimer = setInterval(() => {
                    const elapsed = Math.round((Date.now() - (firstReasoningTokenAt ?? streamStartedAt)) / 1000);
                    debugLog("engine", `thinking... ${elapsed}s`);
                  }, 15_000);
                }
              }
              break;
            }

            case "reasoning":
            case "reasoning-delta": {
              ensureGenerationStarted();
              const reasoningText = resolveReasoningText(part);
              if (reasoningText && firstReasoningTokenAt === null) {
                firstReasoningTokenAt = Date.now();
              }
              if (thinking && reasoningText) {
                enqueue(createBuilderStreamEvent("thinking", { text: reasoningText }));
              }
              break;
            }

            case "reasoning-end": {
              ensureGenerationStarted();
              if (reasoningHeartbeatTimer !== null) {
                clearInterval(reasoningHeartbeatTimer);
                reasoningHeartbeatTimer = null;
              }
              break;
            }

            case "text-start": {
              ensureGenerationStarted();
              if (reasoningHeartbeatTimer !== null) {
                clearInterval(reasoningHeartbeatTimer);
                reasoningHeartbeatTimer = null;
              }
              if (firstContentTokenAt === null) {
                firstContentTokenAt = Date.now();
                if (firstReasoningTokenAt !== null) {
                  const reasoningSec = Math.round((firstContentTokenAt - firstReasoningTokenAt) / 1000);
                  debugLog("engine", `reasoning done (${reasoningSec}s), streaming output...`);
                }
              }
              if (!emittedOutputWait) {
                emittedOutputWait = true;
                enqueue(
                  createBuilderStreamEvent("progress", {
                    step: "generation",
                    phase: "awaiting-output",
                  }),
                );
              }
              break;
            }

            case "text":
            case "text-delta":
            case "output-text":
            case "output-text-delta": {
              ensureGenerationStarted();
              const contentText = stripLeadingThinkingLeak(resolveStreamText(part));
              if (contentText) {
                if (firstContentTokenAt === null) {
                  firstContentTokenAt = Date.now();
                }
                sawContentEvent = true;
                enqueue(createBuilderStreamEvent("content", { text: contentText }));
              }
              break;
            }

            case "text-end": {
              ensureGenerationStarted();
              break;
            }

            case "tool-input-start":
            case "tool_call_streaming_start": {
              ensureGenerationStarted();
              rememberToolInput(part, "reset");
              break;
            }

            case "tool-input-delta":
            case "tool_call_delta": {
              ensureGenerationStarted();
              rememberToolInput(part, "append");
              break;
            }

            case "tool-input-end":
            case "tool-input-available": {
              ensureGenerationStarted();
              rememberToolInput(part, "append");
              break;
            }

            case "tool-call": {
              ensureGenerationStarted();
              emitToolCall(part);
              break;
            }

            case "error":
              ensureGenerationStarted();
              enqueue(
                createBuilderStreamEvent("error", {
                  message: part.error instanceof Error ? part.error.message : "Stream error",
                }),
              );
              break;
          }
        }

        for (const pending of pendingToolInputs.values()) {
          emitToolCall(pending);
        }

        if (!sawContentEvent && toolCallCounts.size === 0) {
          enqueue(
            createBuilderStreamEvent("progress", {
              step: "generation",
              phase: "empty-output",
            }),
          );
          enqueue(
            createBuilderStreamEvent("error", {
              message:
                "Model produced no text events (silent output). No code was emitted for this run.",
            }),
          );
        }

        const usage = await result.usage;
        const streamTiming = summarizeStream("done", usage);
        devLogAppend("in-progress", {
          type: "stream.summary",
          chatId: meta?.chatId ?? null,
          model: typeof meta?.modelId === "string" ? meta.modelId : null,
          reasoningMs: streamTiming.reasoningMs,
          outputMs: streamTiming.outputMs,
          durationMs: streamTiming.durationMs,
          inputTokens: usage?.inputTokens ?? null,
          outputTokens: usage?.outputTokens ?? null,
        });
        enqueue(
          createBuilderStreamEvent("progress", {
            step: "generation",
            phase: "done",
            durationMs: streamTiming.durationMs,
            reasoningMs: streamTiming.reasoningMs,
            outputMs: streamTiming.outputMs,
          }),
        );
        enqueue(
          createBuilderStreamEvent("done", {
            promptTokens: usage?.inputTokens ?? 0,
            completionTokens: usage?.outputTokens ?? 0,
          }),
        );
      } catch (err) {
        if (reasoningHeartbeatTimer !== null) {
          clearInterval(reasoningHeartbeatTimer);
          reasoningHeartbeatTimer = null;
        }
        summarizeStream("error");
        try {
          enqueue(
            createBuilderStreamEvent("error", {
              message: err instanceof Error ? err.message : "Generation failed",
            }),
          );
        } catch {
          // controller may already be closed
        }
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      options.abortController?.abort();
    },
  });
}
