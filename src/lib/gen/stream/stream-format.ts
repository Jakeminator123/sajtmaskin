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
export interface CreateCodeGenSSEStreamOptions {
  thinking?: boolean;
  meta?: StreamMeta;
  abortController?: AbortController;
  /**
   * Invoked when the stream finishes (success, abort, or error) with
   * the concatenated reasoning/`thinking-delta` text observed during the
   * run, or `null` if no reasoning deltas were seen. Callers use this
   * to persist the chain-of-thought alongside the final assistant
   * message (see `finalizeAndSaveVersion`).
   */
  onAccumulatedThinking?: (thinkingText: string | null) => void;
}

export function createCodeGenSSEStream(
  result: StreamTextLike,
  options: CreateCodeGenSSEStreamOptions = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const { thinking = false, meta, onAccumulatedThinking } = options;
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
      let abortedByProvider = false;
      let accumulatedThinking = "";
      let reasoningHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
      const reportAccumulatedThinking = () => {
        if (typeof onAccumulatedThinking !== "function") return;
        try {
          onAccumulatedThinking(accumulatedThinking.length > 0 ? accumulatedThinking : null);
        } catch (callbackErr) {
          debugLog("engine", "onAccumulatedThinking callback threw", {
            error: callbackErr instanceof Error ? callbackErr.message : String(callbackErr),
          });
        }
      };
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
              if (reasoningText) {
                accumulatedThinking += reasoningText;
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

            case "abort": {
              // AI SDK 5+ emits an explicit `abort` part when the provider
              // (or an upstream proxy) aborts the stream mid-flight. Without
              // this branch the loop would simply exit silently after the
              // last delta, leaving the UI to assume "done" and the user
              // staring at a half-rendered response. Mark it so the
              // post-loop block can surface a user-visible error instead.
              ensureGenerationStarted();
              abortedByProvider = true;
              break;
            }
          }
        }

        for (const pending of pendingToolInputs.values()) {
          emitToolCall(pending);
        }

        if (abortedByProvider) {
          eventCounts.set(
            "aborted_by_provider",
            (eventCounts.get("aborted_by_provider") ?? 0) + 1,
          );
          // P0 stream-abort recovery (2026-04-26). Emit a strict-schema
          // `site.aborted` so generation-log-writer.resolveStatus can flip
          // the run to status=aborted and the backoffice/UI surfaces the
          // run as transport-aborted (not "in_progress" forever, not
          // "failed" — failed is reserved for verifier rejects of a real
          // content payload). Reason distinguishes between "we got nothing"
          // and "we got a partial payload then got cut". Target is
          // "in-progress" so it lands in the active run's timeline.ndjson
          // (alongside the stream.summary that follows).
          devLogAppend("in-progress", {
            type: "site.aborted",
            chatId: typeof meta?.chatId === "string" ? meta.chatId : null,
            versionId: typeof meta?.versionId === "string" ? meta.versionId : null,
            reason: sawContentEvent
              ? "provider_aborted_after_content"
              : "provider_aborted_no_content",
          });
          enqueue(
            createBuilderStreamEvent("progress", {
              step: "generation",
              phase: "empty-output",
            }),
          );
          enqueue(
            createBuilderStreamEvent("error", {
              message: sawContentEvent
                ? "Provider avbröt strömmen innan svaret var klart — försök igen eller byt modell."
                : "Provider avbröt strömmen — försök igen eller byt modell.",
            }),
          );
        } else if (!sawContentEvent && toolCallCounts.size === 0) {
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
        // IMPORTANT: report accumulated thinking BEFORE the `done` event so
        // downstream consumers (generation-stream → finalizeAndSaveVersion)
        // see the populated ref by the time they handle `done` and persist
        // the assistant message. The `finally` block also calls this as a
        // safety net for error/abort paths.
        reportAccumulatedThinking();
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
        // P0 stream-abort recovery (2026-04-26). Same emit as the explicit
        // `abort` part above, but for the generic catch path (provider
        // returned an error, network blip, AI SDK threw mid-iteration). We
        // still want resolveStatus to flip to aborted instead of leaving
        // the run as in_progress until staleness-detection rescues it.
        devLogAppend("in-progress", {
          type: "site.aborted",
          chatId: typeof meta?.chatId === "string" ? meta.chatId : null,
          versionId: typeof meta?.versionId === "string" ? meta.versionId : null,
          reason: "stream_error",
        });
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
        if (reasoningHeartbeatTimer !== null) {
          clearInterval(reasoningHeartbeatTimer);
          reasoningHeartbeatTimer = null;
        }
        reportAccumulatedThinking();
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
