/**
 * Shared defaults and options for model tiers and prompt assist.
 * Used by Builder UI for model tier and prompt assist defaults.
 *
 * CONCEPTS:
 *
 * Model Tiers (for v0 builder):
 *   - v0-mini: Fastest, cheapest. Good for quick prototypes.
 *   - v0-pro:  Balanced quality and speed.
 *   - v0-max:  Best quality, slower. Deep reasoning. RECOMMENDED.
 *
 * Prompt Assist (preprocessing user prompts before v0 generation):
 *   - off:       No preprocessing, send prompt directly to v0.
 *   - gateway:   AI Gateway (Vercel's multi-provider routing with fallbacks).
 *   - openai:    Direct OpenAI API call.
 *   - anthropic: Direct Anthropic/Claude API call.
 *
 * Deep Brief Mode:
 *   When enabled, AI first generates a structured "brief" (specification)
 *   which is then used to construct a better prompt for v0. Takes longer
 *   but produces more thorough results for complex projects.
 */

import type { PromptAssistProvider } from "./promptAssist";
import type { ModelTier } from "@/lib/validations/chatSchemas";

// ============================================
// MODEL TIER OPTIONS
// ============================================

export interface ModelTierOption {
  value: ModelTier;
  label: string;
  description: string;
  hint?: string;
}

export const MODEL_TIER_OPTIONS: ModelTierOption[] = [
  {
    value: "v0-mini",
    label: "Mini",
    description: "Snabbast, billigast",
  },
  {
    value: "v0-pro",
    label: "Pro",
    description: "Balanserad",
  },
  {
    value: "v0-max",
    label: "Max",
    description: "Bäst kvalitet",
    hint: "Rekommenderad",
  },
];

/** Default model tier for new chats */
export const DEFAULT_MODEL_TIER: ModelTier = "v0-max";

// ============================================
// PROMPT ASSIST OPTIONS
// ============================================

export interface PromptAssistProviderOption {
  value: PromptAssistProvider;
  label: string;
  description?: string;
}

export interface PromptAssistModelOption {
  value: string;
  label: string;
}

export const PROMPT_ASSIST_PROVIDER_OPTIONS: PromptAssistProviderOption[] = [
  { value: "off", label: "Av", description: "Skicka prompt direkt" },
  { value: "gateway", label: "AI Gateway", description: "Rekommenderad (fallback)" },
  { value: "openai", label: "OpenAI", description: "GPT-modeller" },
  { value: "anthropic", label: "Claude", description: "Anthropic-modeller" },
];

export const PROMPT_ASSIST_MODEL_OPTIONS: Record<PromptAssistProvider, PromptAssistModelOption[]> = {
  off: [],
  gateway: [
    { value: "openai/gpt-5.2", label: "GPT‑5.2 (OpenAI)" },
    { value: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
    { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ],
  openai: [
    { value: "gpt-5.2", label: "GPT‑5.2" },
    { value: "gpt-4o", label: "GPT‑4o" },
    { value: "gpt-4o-mini", label: "GPT‑4o mini" },
  ],
  anthropic: [
    { value: "claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
    { value: "claude-3.7-sonnet", label: "Claude 3.7 Sonnet" },
    { value: "claude-haiku-4.5", label: "Claude Haiku 4.5" },
  ],
};

export function getPromptAssistModelOptions(
  provider: PromptAssistProvider,
): PromptAssistModelOption[] {
  return PROMPT_ASSIST_MODEL_OPTIONS[provider] || [];
}

export function getDefaultPromptAssistModel(provider: PromptAssistProvider): string {
  const options = getPromptAssistModelOptions(provider);
  if (options.length > 0) return options[0].value;
  return DEFAULT_PROMPT_ASSIST.model;
}

// ============================================
// DEFAULT PROMPT ASSIST PROFILE
// ============================================

export interface PromptAssistDefaults {
  provider: PromptAssistProvider;
  model: string;
  deep: boolean;
}

/**
 * Default prompt assist configuration.
 * - Default provider is OFF to match sajtgen's behavior.
 * - If enabled, gateway + gpt-5.2 gives highest quality prompt rewrites.
 * - Deep Brief OFF by default for snappy UX; user can enable for complex projects.
 */
export const DEFAULT_PROMPT_ASSIST: PromptAssistDefaults = {
  provider: "off",
  model: "openai/gpt-5.2",
  deep: false,
};

/** Whether prompt assist is enabled by default (kept in sync with provider) */
export const DEFAULT_PROMPT_ASSIST_ENABLED = false;

// ============================================
// OTHER DEFAULTS
// ============================================

/** Default for AI image generation toggle */
export const DEFAULT_IMAGE_GENERATIONS = true;

