import type { ToolSet } from "ai";
import { generateCode as generateWithEngine, type GenerateOptions } from "./engine";

const V0_FALLBACK_TRUTHY = new Set(["y", "yes", "true", "1"]);

/**
 * Returns true when the v0 Platform API should be used for code generation
 * instead of the own engine. Controlled by V0_FALLBACK_BUILDER env var.
 * Accepts "y", "yes", "true", or "1" (case-insensitive).
 */
export function shouldUseV0Fallback(): boolean {
  const raw = process.env.V0_FALLBACK_BUILDER?.trim().toLowerCase() ?? "";
  return V0_FALLBACK_TRUTHY.has(raw);
}

export interface PipelineOptions {
  prompt: string;
  systemPrompt: string;
  model?: string;
  chatHistory?: GenerateOptions["chatHistory"];
  thinking?: boolean;
  maxTokens?: number;
  abortSignal?: AbortSignal;
  tools?: ToolSet;
  maxSteps?: number;
  referenceAttachments?: GenerateOptions["referenceAttachments"];
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
    tools: options.tools,
    maxSteps: options.maxSteps,
    referenceAttachments: options.referenceAttachments,
  });
}
