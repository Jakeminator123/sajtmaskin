import type { ToolSet } from "ai";
import { generateCode as generateWithEngine, type GenerateOptions } from "./engine";
import { isV0FallbackBuilderEnabled } from "@/lib/v0-fallback";

const V0_FALLBACK_EXPLICIT_VALUES = new Set(["v0-fallback", "v0", "fallback"]);

/**
 * Returns true when the v0 Platform API should be used as the generation
 * provider instead of the own engine. Storage is always Postgres-backed.
 * Controlled by V0_FALLBACK_BUILDER env var.
 * Accepts "y", "yes", "true", or "1" (case-insensitive).
 */
export function shouldUseV0Fallback(): boolean {
  return isV0FallbackBuilderEnabled();
}

export function shouldUseExplicitBuilderFallback(meta: unknown): boolean {
  if (!shouldUseV0Fallback()) return false;
  if (!meta || typeof meta !== "object") return false;

  const value =
    (meta as { enginePath?: unknown }).enginePath ??
    (meta as { preferredEngine?: unknown }).preferredEngine ??
    (meta as { builderEngine?: unknown }).builderEngine;

  if (typeof value !== "string") return false;
  return V0_FALLBACK_EXPLICIT_VALUES.has(value.trim().toLowerCase());
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
