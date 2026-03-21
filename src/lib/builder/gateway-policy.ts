/**
 * AI model routing policy for prompt-assist routes.
 *
 * Delegates to the central resolveModel / resolveModelFromPrefixed in
 * src/lib/gen/models.ts which handles AI Gateway vs direct provider routing.
 */

import type { LanguageModel } from "ai";
import { resolveModelFromPrefixed } from "@/lib/gen/models";

const REASONING_MODEL_RE = /(^|\/)(o[1-9]|gpt-5)/;

/**
 * Parse a "provider/model" string into provider and model ID.
 * Falls back to OpenAI if no provider prefix.
 */
function parseModelString(model: string): { provider: string; modelId: string } {
  const slashIdx = model.indexOf("/");
  if (slashIdx <= 0) return { provider: "openai", modelId: model };
  return { provider: model.slice(0, slashIdx), modelId: model.slice(slashIdx + 1) };
}

/**
 * Create a LanguageModel from a "provider/model" string.
 *
 * Routes through Vercel AI Gateway when AI_GATEWAY_API_KEY is set,
 * otherwise falls back to direct provider calls (OPENAI_API_KEY / ANTHROPIC_API_KEY).
 */
export function createDirectModel(model: string): LanguageModel {
  return resolveModelFromPrefixed(model);
}

export function getPreferredProvider(model: string): string {
  return parseModelString(model).provider;
}

export function defaultFallbackModels(primaryModel: string): string[] {
  const ordered = [
    "openai/gpt-5.4",
    "openai/gpt-5.3-codex",
    "anthropic/claude-opus-4.6",
    "anthropic/claude-sonnet-4.6",
    "openai/gpt-5.2",
  ];
  return ordered.filter((m) => m !== primaryModel);
}

export function isReasoningModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return (
    REASONING_MODEL_RE.test(normalized) ||
    normalized.includes("thinking") ||
    normalized.includes("reasoning")
  );
}

export function getTemperatureConfig(
  model: string,
  temperature?: number,
): { temperature?: number } {
  if (typeof temperature !== "number") return {};
  if (isReasoningModel(model)) return {};
  return { temperature };
}

/**
 * OpenAI-class assist/build calls: enable reasoning for GPT-5 / o-series style models.
 * Skipped for non-reasoning models (temperature-only).
 */
export function getOpenAIAssistReasoningOptions(model: string): {
  providerOptions?: { openai: { reasoningEffort: "high" } };
} {
  if (!isReasoningModel(model)) return {};
  return { providerOptions: { openai: { reasoningEffort: "high" } } };
}

/** Anthropic assist/build: extended thinking unless caller disables it at the API layer. */
export function getAnthropicAssistThinkingOptions(): {
  providerOptions: { anthropic: { thinking: { type: "adaptive" } } };
} {
  return {
    providerOptions: {
      anthropic: { thinking: { type: "adaptive" } },
    },
  };
}
