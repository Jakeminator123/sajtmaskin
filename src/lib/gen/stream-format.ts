import { formatSSEEvent } from "@/lib/streaming";

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
      const enqueue = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(formatSSEEvent(event, data)));
      };

      try {
        if (meta) {
          enqueue("meta", meta);
        }

        for await (const part of result.fullStream) {
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
        enqueue("done", {
          promptTokens: usage?.inputTokens ?? 0,
          completionTokens: usage?.outputTokens ?? 0,
        });
      } catch (err) {
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
