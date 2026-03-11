import { createOpenAI } from "@ai-sdk/openai";
import { gateway } from "ai";
import { DEFAULT_OWN_MODEL_ID } from "@/lib/v0/models";

/** Default model for code generation. Aligned with v0/models.ts OWN_MODELS. */
export const DEFAULT_MODEL = DEFAULT_OWN_MODEL_ID;

const ANTHROPIC_PREFIX_RE = /^claude-/;

/**
 * Returns an AI SDK LanguageModel for code generation.
 * OpenAI models use OPENAI_API_KEY directly.
 * Anthropic models route through AI Gateway (requires AI_GATEWAY_API_KEY or OIDC).
 */
export function getOpenAIModel(modelId?: string) {
  const id = modelId ?? DEFAULT_MODEL;

  if (ANTHROPIC_PREFIX_RE.test(id)) {
    return gateway(`anthropic/${id}`);
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Set it in your environment to use the code generation engine.",
    );
  }

  return createOpenAI({ apiKey })(id);
}
