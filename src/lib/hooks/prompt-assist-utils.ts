import type { PromptAssistProvider } from "@/lib/builder/prompt-assist";

export const PROMPT_ASSIST_TIMEOUT_MS = 600_000;

export function extractErrorMessage(value: unknown): string | null {
  if (value && typeof value === "object" && "error" in value) {
    const msg = (value as Record<string, unknown>).error;
    return typeof msg === "string" ? msg : null;
  }
  return null;
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export async function readStreamText(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

const STOPWORDS = new Set([
  "och",
  "att",
  "som",
  "det",
  "den",
  "detta",
  "med",
  "for",
  "the",
  "and",
  "you",
  "your",
  "this",
  "that",
  "from",
  "into",
  "with",
  "utan",
  "inte",
  "ska",
  "måste",
  "will",
]);

export function extractTokens(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9åäö]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

export function computeOverlapRatio(original: string, enhanced: string): number {
  const originalTokens = extractTokens(original);
  const enhancedTokens = extractTokens(enhanced);
  if (originalTokens.length < 6) return 1;
  const originalSet = new Set(originalTokens);
  let overlap = 0;
  enhancedTokens.forEach((token) => {
    if (originalSet.has(token)) overlap += 1;
  });
  return overlap / Math.max(1, originalSet.size);
}

export function hasSwedishChars(value: string): boolean {
  return /[åäö]/i.test(value);
}

export function promptAssistDebugFields(provider: PromptAssistProvider) {
  return {
    provider,
    transport: "direct_provider_api" as const,
    sdk: "ai" as const,
  };
}
