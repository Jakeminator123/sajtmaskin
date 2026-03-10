import { createOpenAI } from "@ai-sdk/openai";
import { DEFAULT_OWN_MODEL_ID } from "@/lib/v0/models";

/** Default model for code generation. Aligned with v0/models.ts OWN_MODELS. */
export const DEFAULT_MODEL = DEFAULT_OWN_MODEL_ID;

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
