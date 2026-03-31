/**
 * AI model routing policy for prompt-assist routes.
 * Uses direct provider calls (OpenAI/Anthropic) instead of Vercel AI Gateway.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

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
 * Create a LanguageModel from a "provider/model" string using direct API keys.
 * Replaces gateway() calls — no Vercel AI Gateway dependency.
 */
export function createDirectModel(model: string): LanguageModel {
  const { provider, modelId } = parseModelString(model);

  if (provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is required for Anthropic models.");
    }
    const normalizedModelId = modelId.replace(/(\d+)\.(\d+)$/g, "$1-$2");
    return createAnthropic({ apiKey })(normalizedModelId);
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for OpenAI models.");
  }
  return createOpenAI({ apiKey })(modelId);
}

function isReasoningModel(model: string): boolean {
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
