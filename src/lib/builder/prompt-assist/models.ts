/**
 * Prompt-assist provider detection + allowed-model lists loaded from the
 * manifest.
 *
 * Split out of `promptAssist.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import { getPromptAssistAllowedFromManifest } from "@/lib/ai-models/load-manifest";

// OpenAI-class assist models (loaded from manifest).
// "anthropic" refers to Anthropic direct API access via ANTHROPIC_API_KEY.
export type PromptAssistProvider = "openai" | "anthropic";

const promptAssistAllowed = getPromptAssistAllowedFromManifest();

// `ASSIST_MODELS` and `ANTHROPIC_ASSIST_MODELS` are kept for historical reasons —
// existing callers (and `manifest-parity.test.ts`) still read the split arrays.
// New callers should prefer the unified `promptAssistAllowed.models` accessor
// from `getPromptAssistAllowedFromManifest()`, which returns the union (provider
// is implicit in the model-id prefix: `openai/`, `anthropic/`, `anthropic-direct/`).
export const ASSIST_MODELS = Object.freeze([
  ...promptAssistAllowed.gatewayClassModels,
]);

export const ANTHROPIC_ASSIST_MODELS = Object.freeze([
  ...promptAssistAllowed.anthropicDirectModels,
]);

export function normalizeAssistModel(rawModel: string): string {
  const raw = String(rawModel || "").trim();
  if (!raw) return raw;
  if (raw.startsWith("v0-")) return raw;
  if (raw.includes("/")) return raw;
  return `openai/${raw}`;
}

export function isOpenAIAssistModel(model: string): boolean {
  return ASSIST_MODELS.includes(model);
}

export function isAnthropicAssistModel(model: string): boolean {
  return ANTHROPIC_ASSIST_MODELS.includes(model);
}

export function isPromptAssistOff(model: string): boolean {
  return model === "off";
}

export function isPromptAssistModelAllowed(model: string): boolean {
  return (
    isPromptAssistOff(model) ||
    isOpenAIAssistModel(model) ||
    isAnthropicAssistModel(model)
  );
}

export function resolvePromptAssistProvider(model: string): PromptAssistProvider {
  if (isAnthropicAssistModel(model) || model.startsWith("anthropic/")) return "anthropic";
  return "openai";
}
