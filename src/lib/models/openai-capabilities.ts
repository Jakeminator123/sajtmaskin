/**
 * Reasoning capabilities for the OpenAI models Sajtmaskin actively routes to.
 *
 * Model choice belongs to `config/ai_models/manifest.json`; this table only
 * answers what a model accepts. Values follow the OpenAI model pages
 * (verified 2026-10-17): GPT-6.1 Sol and GPT-6 Astra reject `none`, GPT-6 Luna
 * and the GPT-5.6 family accept it. Models outside the table keep the caller's
 * existing provider-default behaviour.
 */

export type OpenAIReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

export type OpenAIModelCapabilities = {
  /** Supported `reasoning.effort` values, lowest first. */
  efforts: readonly OpenAIReasoningEffort[];
  /** Accepts Responses `reasoning.mode` (`standard` / `pro`). */
  supportsReasoningMode: boolean;
};

const EFFORTS_WITH_NONE = ["none", "low", "medium", "high", "xhigh", "max"] as const;
const EFFORTS_FROM_LOW = ["low", "medium", "high", "xhigh", "max"] as const;

const OPENAI_MODEL_CAPABILITIES: Record<string, OpenAIModelCapabilities> = {
  "gpt-6.1-sol": { efforts: EFFORTS_FROM_LOW, supportsReasoningMode: true },
  "gpt-6-astra": { efforts: EFFORTS_FROM_LOW, supportsReasoningMode: true },
  "gpt-6-luna": { efforts: EFFORTS_WITH_NONE, supportsReasoningMode: true },
  "gpt-5.6-sol": { efforts: EFFORTS_WITH_NONE, supportsReasoningMode: true },
  "gpt-5.6-terra": { efforts: EFFORTS_WITH_NONE, supportsReasoningMode: true },
  "gpt-5.6-luna": { efforts: EFFORTS_WITH_NONE, supportsReasoningMode: true },
};

const EFFORT_ORDER: readonly OpenAIReasoningEffort[] = EFFORTS_WITH_NONE;

/** `openai/gpt-6.1-sol` and `gpt-6.1-sol` resolve to the same entry. */
export function normalizeOpenAIModelId(modelId: string): string {
  return modelId.trim().toLowerCase().replace(/^openai\//, "");
}

export function getOpenAIModelCapabilities(
  modelId: string | null | undefined,
): OpenAIModelCapabilities | null {
  if (!modelId) return null;
  return OPENAI_MODEL_CAPABILITIES[normalizeOpenAIModelId(modelId)] ?? null;
}

/**
 * OpenAI reasoning model by version, mirroring `@ai-sdk/openai`'s own rule:
 * every `gpt-N` with N >= 5 (except `*-chat*`) and the o-series. Used where a
 * raw request must drop `temperature`/`max_tokens` for reasoning models.
 */
export function isOpenAIReasoningModelId(modelId: string): boolean {
  const id = normalizeOpenAIModelId(modelId);
  if (/^o\d/.test(id)) return true;
  const match = /^gpt-(\d+)(?:\.\d+)?(?:-(.+))?$/.exec(id);
  if (!match) return false;
  if (match[2]?.startsWith("chat")) return false;
  return Number(match[1]) >= 5;
}

export function minimumOpenAIReasoningEffort(modelId: string): OpenAIReasoningEffort | null {
  return getOpenAIModelCapabilities(modelId)?.efforts[0] ?? null;
}

/**
 * Clamp a requested effort to what the model accepts. An unsupported low value
 * (`none` on GPT-6.1 Sol) moves up to the model's minimum; anything else the
 * model lacks moves down to its highest effort. Unregistered models return the
 * request unchanged so legacy ids keep their current behaviour.
 */
export function clampOpenAIReasoningEffort(
  modelId: string,
  effort: OpenAIReasoningEffort,
): OpenAIReasoningEffort {
  const caps = getOpenAIModelCapabilities(modelId);
  if (!caps || caps.efforts.includes(effort)) return effort;
  const requestedRank = EFFORT_ORDER.indexOf(effort);
  const above = caps.efforts.find((candidate) => EFFORT_ORDER.indexOf(candidate) >= requestedRank);
  return above ?? caps.efforts[caps.efforts.length - 1];
}

/**
 * Effort to send for a registered model: the explicit request clamped to the
 * model, or the model's minimum when nothing was requested. Omitting the field
 * would silently fall back to OpenAI's `medium` default. Returns `undefined`
 * for unregistered models.
 */
export function resolveOpenAIReasoningEffort(
  modelId: string,
  requested: OpenAIReasoningEffort | undefined,
): OpenAIReasoningEffort | undefined {
  const minimum = minimumOpenAIReasoningEffort(modelId);
  if (!minimum) return undefined;
  return requested ? clampOpenAIReasoningEffort(modelId, requested) : minimum;
}

export function supportsOpenAIReasoningMode(modelId: string): boolean {
  return getOpenAIModelCapabilities(modelId)?.supportsReasoningMode === true;
}
