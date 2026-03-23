import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { DEFAULT_OWN_MODEL_ID } from "@/lib/models/catalog";

/** Default model for code generation. Aligned with the shared model catalog. */
export const DEFAULT_MODEL = DEFAULT_OWN_MODEL_ID;

const ANTHROPIC_PREFIX_RE = /^claude-/;

/**
 * Returns an AI SDK `LanguageModel` for code generation.
 *
 * - **OpenAI** (`gpt-*`, etc.): `createOpenAI` + `OPENAI_API_KEY`.
 * - **Anthropic** (`claude-*`): `createAnthropic` + `ANTHROPIC_API_KEY`. IDs are
 *   normalized to the hyphen form the Claude Messages API expects (e.g.
 *   `claude-opus-4.6` → `claude-opus-4-6`). Same REST surface as
 *   [Anthropic API overview](https://platform.claude.com/docs/en/api/overview).
 */
export function getOpenAIModel(modelId?: string) {
  const id = modelId ?? DEFAULT_MODEL;

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

  return createOpenAI({ apiKey })(id);
}
