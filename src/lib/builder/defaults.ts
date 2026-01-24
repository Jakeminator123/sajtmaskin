/**
 * Shared defaults and options for model tiers and prompt assist.
 * Used by Builder and pre-builder UI (landing, wizard, audit, category pages).
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

export const PROMPT_ASSIST_PROVIDER_OPTIONS: PromptAssistProviderOption[] = [
  { value: "off", label: "Av", description: "Skicka prompt direkt" },
  { value: "gateway", label: "AI Gateway", description: "Rekommenderad (fallback)" },
  { value: "openai", label: "OpenAI", description: "GPT-modeller" },
  { value: "anthropic", label: "Claude", description: "Anthropic-modeller" },
];

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
 * - If enabled, gateway + gpt-5 gives highest quality prompt rewrites.
 * - Deep Brief OFF by default for snappy UX; user can enable for complex projects.
 */
export const DEFAULT_PROMPT_ASSIST: PromptAssistDefaults = {
  provider: "off",
  model: "openai/gpt-5",
  deep: false,
};

/** Whether prompt assist is enabled by default (kept in sync with provider) */
export const DEFAULT_PROMPT_ASSIST_ENABLED = false;

// ============================================
// OTHER DEFAULTS
// ============================================

/** Default for AI image generation toggle */
export const DEFAULT_IMAGE_GENERATIONS = true;

/** Default system prompt for v0 generation */
export const DEFAULT_SYSTEM_PROMPT =
  "You are a senior product designer and front-end engineer. " +
  "Build a modern, production-ready UI with clear hierarchy, accessible components, and responsive layout. " +
  "Use semantic HTML and Tailwind CSS classes only.";

// ============================================
// URL PARAM KEYS (for passing settings pre-builder → builder)
// ============================================

export const SETTINGS_URL_PARAMS = {
  modelTier: "modelTier",
  assistProvider: "assistProvider",
  assistModel: "assistModel",
  assistDeep: "assistDeep",
} as const;

// ============================================
// STORAGE KEYS (for audit flow)
// ============================================

export const SETTINGS_STORAGE_PREFIX = "sajtmaskin_settings:";

export function getSettingsStorageKey(auditId?: string): string {
  return auditId ? `${SETTINGS_STORAGE_PREFIX}${auditId}` : `${SETTINGS_STORAGE_PREFIX}default`;
}

export interface StoredSettings {
  modelTier?: ModelTier;
  assistProvider?: PromptAssistProvider;
  assistModel?: string;
  assistDeep?: boolean;
}

export function saveSettingsToStorage(settings: StoredSettings, auditId?: string): void {
  if (typeof window === "undefined") return;
  const key = getSettingsStorageKey(auditId);
  try {
    sessionStorage.setItem(key, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

export function loadSettingsFromStorage(auditId?: string): StoredSettings | null {
  if (typeof window === "undefined") return null;
  const key = getSettingsStorageKey(auditId);
  try {
    const stored = sessionStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored) as StoredSettings;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

export function clearSettingsFromStorage(auditId?: string): void {
  if (typeof window === "undefined") return;
  const key = getSettingsStorageKey(auditId);
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Ignore storage errors
  }
}
