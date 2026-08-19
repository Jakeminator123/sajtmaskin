/**
 * Pre-send Prompt-assist: cheap rewrite of the chat draft before send.
 * Natural language in, natural language out. Not Deep Brief / siteBriefSchema.
 */
import { getWorkloadDefaultModelFromManifest } from "@/lib/ai-models/load-manifest";

export const PROMPT_REWRITE_WORKLOAD_ID = "prompt_rewrite";
export const PROMPT_REWRITE_FALLBACK_MODEL = "openai/gpt-5.6-terra";
export const PROMPT_ASSIST_DRAFT_MAX_CHARS = 8_000;

export function resolvePromptRewriteModel(
  env: NodeJS.ProcessEnv = process.env,
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
      'Return JSON only: {"text":"<rewritten draft>"}.',
    ].join(" "),
    user: draft,
  };
}

export function parsePromptAssistResponse(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as { text?: unknown };
    if (typeof parsed.text === "string") {
      const text = parsed.text.trim();
      return text || null;
    }
  } catch {
    return trimmed;
  }
  return null;
}
