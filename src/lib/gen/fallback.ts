import type { ToolSet } from "ai";
import { generateCode as generateWithEngine, type GenerateOptions } from "./engine";

export interface PipelineOptions {
  prompt: string;
  systemPrompt: string;
  model?: string;
  modelTier?: string;
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
    modelTier: options.modelTier,
    chatHistory: options.chatHistory,
    thinking: options.thinking,
    maxTokens: options.maxTokens,
    abortSignal: options.abortSignal,
    tools: options.tools,
    maxSteps: options.maxSteps,
    referenceAttachments: options.referenceAttachments,
  });
}
