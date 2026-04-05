import type { ToolSet } from "ai";
import { generateCode as generateWithEngine, type GenerateOptions, type ReasoningEffort } from "./engine";

export interface PipelineOptions {
  prompt: string;
  systemPrompt: string;
  model?: string;
  chatHistory?: GenerateOptions["chatHistory"];
  thinking?: boolean;
  reasoningEffort?: ReasoningEffort;
  maxTokens?: number;
  abortSignal?: AbortSignal;
  tools?: ToolSet;
  maxSteps?: number;
  referenceAttachments?: GenerateOptions["referenceAttachments"];
}

/**
 * Own-engine code generation entry: SSE stream from the GPT engine.
 * Does not call the v0 Platform API.
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
    reasoningEffort: options.reasoningEffort,
    maxTokens: options.maxTokens,
    abortSignal: options.abortSignal,
    tools: options.tools,
    maxSteps: options.maxSteps,
    referenceAttachments: options.referenceAttachments,
  });
}
