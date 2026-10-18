import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { DEFAULT_OWN_MODEL_ID, aliasRetiredModelId } from "@/lib/models/catalog";
import { getOpenAIModelCapabilities } from "@/lib/models/openai-capabilities";

/** Default model for code generation. Aligned with the shared model catalog. */
export const DEFAULT_MODEL = DEFAULT_OWN_MODEL_ID;

const ANTHROPIC_PREFIX_RE = /^claude-/;

export function isAnthropicModel(id: string): boolean {
  return ANTHROPIC_PREFIX_RE.test(id);
}

/**
 * Returns an AI SDK LanguageModel for code generation.
 * OpenAI models use OPENAI_API_KEY directly.
 * Anthropic models use ANTHROPIC_API_KEY directly.
 */
export function getOpenAIModel(modelId?: string) {
  const id = aliasRetiredModelId(modelId ?? DEFAULT_MODEL);

  if (ANTHROPIC_PREFIX_RE.test(id)) {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not configured. Set it in your environment to use Anthropic models.",
      );
    }
    const normalizedId = id.replace(/(\d+)\.(\d+)$/g, "$1-$2");
    return createAnthropic({ apiKey })(normalizedId);
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Set it in your environment to use the code generation engine.",
    );
  }

  const openai = createOpenAI({ apiKey });
  // In @ai-sdk/openai v3 the default provider call `openai(id)` IS the
  // Responses API model (createLanguageModel === createResponsesModel), so
  // every OpenAI model here talks to /v1/responses. Registered models are
  // pinned to `.responses()` explicitly: GPT-6.1 Sol needs Responses for tool
  // calls and reasoningMode is Responses-only, so a future SDK default change
  // must not move them to Chat Completions.
  if (getOpenAIModelCapabilities(id)) {
    return openai.responses(id);
  }
  return openai(id);
}
