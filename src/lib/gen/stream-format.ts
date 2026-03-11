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
  }>;
  usage: PromiseLike<{ inputTokens: number | undefined; outputTokens: number | undefined }>;
}

function resolveStreamText(part: { text?: string; textDelta?: string }): string | undefined {
  return part.textDelta ?? part.text;
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
      const enqueue = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(formatSSEEvent(event, data)));
      };

      const summarizeStream = (phase: "done" | "error", usage?: {
        inputTokens: number | undefined;
        outputTokens: number | undefined;
      }) => {
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

            case "tool-call": {
              if (part.toolName && part.args) {
                enqueue("tool-call", {
                  toolName: part.toolName,
                  toolCallId: part.toolCallId,
                  args: part.args,
                });
              }
              break;
            }

            case "error":
              enqueue("error", {
                message:
                  part.error instanceof Error
                    ? part.error.message
                    : "Stream error",
              });
              break;
          }
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
            message:
              err instanceof Error ? err.message : "Generation failed",
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
