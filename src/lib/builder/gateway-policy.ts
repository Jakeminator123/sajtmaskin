/**
 * Shared AI Gateway routing policy for prompt-assist routes.
 * Keeps provider/fallback heuristics consistent across /api/ai/*.
 */

const REASONING_MODEL_RE = /(^|\/)(o[1-9]|gpt-5)/;

export function getGatewayPreferredProvider(model: string): string | null {
  const slashIdx = model.indexOf("/");
  if (slashIdx <= 0) return null;
  return model.slice(0, slashIdx) || null;
}

export function defaultGatewayFallbackModels(primaryModel: string): string[] {
  const ordered = [
    "openai/gpt-5.4",
    "openai/gpt-5.3-codex",
    "anthropic/claude-opus-4.6",
    "anthropic/claude-sonnet-4.6",
    "openai/gpt-5.2",
  ];
  return ordered.filter((model) => model !== primaryModel);
}

export function isReasoningModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return (
    REASONING_MODEL_RE.test(normalized) ||
    normalized.includes("thinking") ||
    normalized.includes("reasoning")
  );
}

export function getTemperatureConfig(
  model: string,
  temperature?: number,
): { temperature?: number } {
  if (typeof temperature !== "number") return {};
  if (isReasoningModel(model)) return {};
  return { temperature };
}

