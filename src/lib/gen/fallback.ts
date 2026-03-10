import { generateCode as generateWithEngine, type GenerateOptions } from "./engine";

/**
 * Returns true when the v0 Platform API should be used for code generation
 * instead of the own engine. Controlled by V0_FALLBACK_BUILDER env var.
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
  abortSignal?: AbortSignal;
}

/**
 * Entry point for own-engine code generation.
 * Returns an SSE ReadableStream from the GPT engine.
 */
export function createGenerationPipeline(
  options: PipelineOptions,
): ReadableStream<Uint8Array> {
  return generateWithEngine({
    prompt: options.prompt,
    systemPrompt: options.systemPrompt,
    model: options.model,
    chatHistory: options.chatHistory,
    thinking: options.thinking,
    maxTokens: options.maxTokens,
    abortSignal: options.abortSignal,
  });
}
