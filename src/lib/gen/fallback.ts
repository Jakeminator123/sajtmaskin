import { formatSSEEvent } from "@/lib/streaming";

import { generateCode as generateWithEngine, type GenerateOptions } from "./engine";

/**
 * Returns true when the v0 Platform API should be used for code generation
 * instead of the new GPT 5.2 engine.  Controlled by the V0_FALLBACK_BUILDER
 * env var — set to "y" to enable.
 */
export function shouldUseV0Fallback(): boolean {
  return process.env.V0_FALLBACK_BUILDER === "y";
}

export interface PipelineOptions {
  prompt: string;
  systemPrompt: string;
  model?: string;
  chatHistory?: GenerateOptions["chatHistory"];
  thinking?: boolean;
  maxTokens?: number;

  v0Quality?: string;
  v0CategoryType?: string;
}

/**
 * Unified entry point for code generation.
 *
 * - When `V0_FALLBACK_BUILDER=y`: delegates to the existing v0 Platform API
 *   pipeline and wraps the result in an SSE ReadableStream that matches the
 *   new engine's event format.
 * - Otherwise: calls the new GPT 5.2 engine directly.
 */
export function createGenerationPipeline(
  options: PipelineOptions,
): ReadableStream<Uint8Array> {
  if (shouldUseV0Fallback()) {
    return createV0FallbackStream(options);
  }

  return generateWithEngine({
    prompt: options.prompt,
    systemPrompt: options.systemPrompt,
    model: options.model,
    chatHistory: options.chatHistory,
    thinking: options.thinking,
    maxTokens: options.maxTokens,
  });
}

// ---------------------------------------------------------------------------
// V0 Fallback — wraps the promise-based v0 generator in an SSE stream
// ---------------------------------------------------------------------------

function createV0FallbackStream(
  options: PipelineOptions,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const enqueue = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(formatSSEEvent(event, data)));
      };

      try {
        const { generateCode: v0Generate } = await import(
          "@/lib/v0/v0-generator"
        );

        const result = await v0Generate(options.prompt, {
          quality: (options.v0Quality as "standard") || "standard",
          categoryType: options.v0CategoryType,
          systemPrompt: options.systemPrompt,
          thinking: options.thinking,
        });

        enqueue("meta", {
          chatId: result.chatId,
          versionId: result.versionId,
        });

        if (result.code) {
          enqueue("content", { text: result.code });
        }

        enqueue("done", {
          promptTokens: 0,
          completionTokens: 0,
          demoUrl: result.demoUrl,
          model: result.model,
        });
      } catch (err) {
        try {
          enqueue("error", {
            message:
              err instanceof Error ? err.message : "v0 fallback failed",
          });
        } catch {
          // controller may be closed
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
