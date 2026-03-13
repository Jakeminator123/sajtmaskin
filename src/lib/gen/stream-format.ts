import { formatSSEEvent } from "@/lib/streaming";
import { debugLog } from "@/lib/utils/debug";

export interface StreamMeta {
  chatId?: string;
  versionId?: string;
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
  options: { thinking?: boolean; meta?: StreamMeta } = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const { thinking = true, meta } = options;

  return new ReadableStream({
    async start(controller) {
      const eventCounts = new Map<string, number>();
      const toolCallCounts = new Map<string, number>();
      const pendingToolInputs = new Map<
        string,
        { toolName?: string; toolCallId?: string; inputText: string }
      >();
      const enqueue = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(formatSSEEvent(event, data)));
      };
      const getToolInputKey = (part: { toolCallId?: string; toolName?: string }): string | null => {
        if (part.toolCallId) return part.toolCallId;
        if (part.toolName) return `tool:${part.toolName}`;
        return null;
      };
      const rememberToolInput = (
        part: {
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
        const toolCallId = part.toolCallId ?? buffered?.toolCallId;
        if (!toolName) return false;
        enqueue("tool-call", {
          toolName,
          toolCallId,
          args,
        });
        if (key) pendingToolInputs.delete(key);
        return true;
      };

      const summarizeStream = (
        phase: "done" | "error",
        usage?: {
          inputTokens: number | undefined;
          outputTokens: number | undefined;
        },
      ) => {
        debugLog("engine", "AI SDK stream event summary", {
          phase,
          chatId: meta?.chatId ?? null,
          versionId: meta?.versionId ?? null,
          eventCounts: Object.fromEntries(eventCounts),
          toolCalls: Object.fromEntries(toolCallCounts),
          promptTokens: usage?.inputTokens ?? null,
          completionTokens: usage?.outputTokens ?? null,
        });
      };

      try {
        if (meta) {
          enqueue("meta", meta);
        }

        for await (const part of result.fullStream) {
          eventCounts.set(part.type, (eventCounts.get(part.type) ?? 0) + 1);
          if (part.type === "tool-call" && part.toolName) {
            toolCallCounts.set(part.toolName, (toolCallCounts.get(part.toolName) ?? 0) + 1);
          }

          switch (part.type) {
            case "reasoning":
            case "reasoning-delta": {
              const reasoningText = resolveStreamText(part);
              if (thinking && reasoningText) {
                enqueue("thinking", { text: reasoningText });
              }
              break;
            }

            case "text":
            case "text-delta":
            case "output-text":
            case "output-text-delta": {
              const contentText = resolveStreamText(part);
              if (contentText) {
                enqueue("content", { text: contentText });
              }
              break;
            }

            case "tool-input-start":
            case "tool_call_streaming_start": {
              rememberToolInput(part, "reset");
              break;
            }

            case "tool-input-delta":
            case "tool_call_delta": {
              rememberToolInput(part, "append");
              break;
            }

            case "tool-input-end":
            case "tool-input-available": {
              rememberToolInput(part, "append");
              break;
            }

            case "tool-call": {
              emitToolCall(part);
              break;
            }

            case "error":
              enqueue("error", {
                message: part.error instanceof Error ? part.error.message : "Stream error",
              });
              break;
          }
        }

        for (const pending of pendingToolInputs.values()) {
          emitToolCall(pending);
        }

        const usage = await result.usage;
        summarizeStream("done", usage);
        enqueue("done", {
          promptTokens: usage?.inputTokens ?? 0,
          completionTokens: usage?.outputTokens ?? 0,
        });
      } catch (err) {
        summarizeStream("error");
        try {
          enqueue("error", {
            message: err instanceof Error ? err.message : "Generation failed",
          });
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
  });
}
