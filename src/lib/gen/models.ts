import { createOpenAI } from "@ai-sdk/openai";
import { DEFAULT_OWN_MODEL_ID } from "@/lib/v0/models";

/** Default model for code generation (GPT 5.2). Aligned with v0/models.ts OWN_MODELS. */
export const DEFAULT_MODEL = DEFAULT_OWN_MODEL_ID;

export type ModelTier = "fast" | "standard" | "quality";

/** Maps gen tier names to OpenAI model IDs. Aligned with v0 QUALITY_TO_OPENAI_MODEL. */
const MODEL_TIER_MAP: Record<ModelTier, string> = {
  fast: "gpt-4.1-mini",
  standard: "gpt-5.2",
  quality: "gpt-5.4",
};

/**
 * Maps a quality tier name to a concrete model ID.
 * If `tier` isn't a recognised tier name it's returned as-is,
 * allowing callers to pass arbitrary model IDs through.
 */
export function resolveModel(tier: ModelTier | string): string {
  if (tier in MODEL_TIER_MAP) return MODEL_TIER_MAP[tier as ModelTier];
  return tier;
}

/**
 * Returns an AI SDK LanguageModel backed by OpenAI.
 * Requires `OPENAI_API_KEY` in the environment.
 */
export function getOpenAIModel(modelId?: string) {
  const id = modelId ?? DEFAULT_MODEL;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Set it in your environment to use the code generation engine.",
    );
  }

  return createOpenAI({ apiKey })(id);
}
