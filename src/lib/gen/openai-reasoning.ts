import { getReasoningEffort } from "./defaults";

/** Strips `openai/` (or other `provider/`) prefix for OpenAI model IDs. */
export function openaiModelIdFromAssistString(model: string): string {
  const idx = model.indexOf("/");
  return idx <= 0 ? model : model.slice(idx + 1);
}

/**
 * Whether the OpenAI API model ID supports `providerOptions.openai.reasoningEffort`
 * (GPT-5 family, Codex, o-series). Claude / non-OpenAI IDs return false.
 *
 * @see https://developers.openai.com/api/docs/models/gpt-5.3-codex — reasoning effort low…xhigh
 * @see https://vercel.com/docs/ai-gateway/models-and-providers/provider-options — OpenAI reasoning options
 */
export function supportsOpenAIReasoningEffort(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  if (!id || id.startsWith("claude")) return false;
  if (id.includes("gpt-5") || id.includes("codex")) return true;
  if (/^o\d/i.test(id)) return true;
  return false;
}

/**
 * Pass-through for Vercel AI SDK `streamText` / `generateText` when using `@ai-sdk/openai`
 * (direct OpenAI or compatible). Omit when unsupported or Thinking is off.
 */
export function buildOpenAIReasoningProviderOptions(
  modelId: string,
  modelTier: string | undefined,
  thinking: boolean,
): { providerOptions?: { openai: { reasoningEffort: string } } } {
  if (!thinking || !supportsOpenAIReasoningEffort(modelId)) {
    return {};
  }
  const effort = getReasoningEffort(modelTier, thinking);
  if (effort === "none") return {};
  return {
    providerOptions: {
      openai: {
        reasoningEffort: effort,
      },
    },
  };
}
