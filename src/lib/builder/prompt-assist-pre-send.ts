/**
 * Pre-send Prompt-assist: cheap rewrite of the chat draft before send.
 * Natural language in, natural language out. Not Deep Brief / siteBriefSchema.
 */
import { getWorkloadDefaultModelFromManifest } from "@/lib/ai-models/load-manifest";
import { getTemperatureConfig } from "@/lib/builder/direct-model";
import { aliasRetiredModelId } from "@/lib/models/catalog";

export const PROMPT_REWRITE_WORKLOAD_ID = "prompt_rewrite";
export const PROMPT_REWRITE_FALLBACK_MODEL = "openai/gpt-5.6-terra";
export const PROMPT_ASSIST_DRAFT_MAX_CHARS = 8_000;
/**
 * A rewrite of the largest allowed draft is about 2k tokens in Swedish/English.
 * 3,072 leaves room for JSON escaping without giving this cheap pre-send step an
 * open-ended provider bill.
 */
export const PROMPT_REWRITE_MAX_OUTPUT_TOKENS = 3_072;
/** Keep writeback within the same character contract as the input draft. */
export const PROMPT_REWRITE_MAX_CHARS = PROMPT_ASSIST_DRAFT_MAX_CHARS;

export function resolvePromptRewriteModel(
  env: Record<string, string | undefined> = process.env,
): string {
  return (
    env.SAJTMASKIN_PROMPT_REWRITE_MODEL?.trim() ||
    getWorkloadDefaultModelFromManifest(PROMPT_REWRITE_WORKLOAD_ID) ||
    PROMPT_REWRITE_FALLBACK_MODEL
  );
}

export function buildPromptAssistMessages(draft: string): {
  system: string;
  user: string;
} {
  return {
    system: [
      "You clean a website-builder chat draft before the user sends it.",
      "Fix spelling and light grammar. Add line breaks or a bullet list only when the draft already has list-like points.",
      "You may fill a thin draft or shorten a rambling one so another LLM can act on it.",
      "Keep the user's language and voice. Do not translate unless they mixed languages accidentally.",
      "Do not turn the draft into a spec, site brief, JSON schema, or system prompt.",
      "Do not invent pages, features, or brand facts that are not implied.",
      `Keep the rewritten draft at or below ${PROMPT_REWRITE_MAX_CHARS} characters.`,
      'Return JSON only: {"text":"<rewritten draft>"}.',
    ].join(" "),
    user: draft,
  };
}

export function buildPromptAssistModelOptions(modelId: string): {
  maxOutputTokens: number;
  temperature?: number;
  providerOptions?: { openai: { reasoningEffort: "none" } };
} {
  const resolved = aliasRetiredModelId(modelId);
  return {
    maxOutputTokens: PROMPT_REWRITE_MAX_OUTPUT_TOKENS,
    ...getTemperatureConfig(resolved, 0.3),
    ...(/gpt-5\.6/i.test(resolved)
      ? { providerOptions: { openai: { reasoningEffort: "none" as const } } }
      : {}),
  };
}

/** True when a finished rewrite would exceed the writeback character contract. */
export function isPromptAssistRewriteOverCharLimit(text: string): boolean {
  return text.length > PROMPT_REWRITE_MAX_CHARS;
}

function readRewriteText(value: string): string | null | undefined {
  try {
    const parsed = JSON.parse(value) as { text?: unknown };
    if (typeof parsed.text === "string") {
      return parsed.text.trim() || null;
    }
    return null;
  } catch {
    return undefined;
  }
}

export function parsePromptAssistResponse(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const wholeFence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  const candidate = wholeFence?.[1]?.trim() ?? trimmed;

  const direct = readRewriteText(candidate);
  if (direct !== undefined) return direct;

  const start = candidate.indexOf("{");
  if (start >= 0) {
    const end = candidate.lastIndexOf("}");
    if (end > start) {
      const embedded = readRewriteText(candidate.slice(start, end + 1));
      if (embedded !== undefined) return embedded;
    }
    if (candidate.startsWith("{") || /"text"\s*:/.test(candidate)) return null;
  }

  return candidate || null;
}
