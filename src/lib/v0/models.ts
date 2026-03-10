/**
 * Canonical v0 model schema — single source of truth.
 *
 * All model IDs, labels, legacy aliases, and the default tier are defined
 * here. Every other module (validation, pricing, UI, selection) imports
 * from this file instead of maintaining its own copy.
 *
 * V0_MODELS: v0 Platform API models (used when V0_FALLBACK_BUILDER=y).
 * OWN_MODELS: OpenAI models for the default engine (GPT 5.2).
 */

/** v0 Platform API model IDs — used for fallback when V0_FALLBACK_BUILDER=y */
export const V0_MODEL_IDS = [
  "v0-max-fast",
  "v0-1.5-md",
  "v0-1.5-lg",
  "v0-gpt-5",
] as const;

/** @deprecated Use V0_MODEL_IDS for clarity. Kept for backward compatibility. */
export const CANONICAL_MODEL_IDS = V0_MODEL_IDS;

export type CanonicalModelId = (typeof V0_MODEL_IDS)[number];

export const DEFAULT_MODEL_ID: CanonicalModelId = "v0-max-fast";

/** OpenAI model IDs for the default engine (when not using v0 fallback) */
export const OWN_MODEL_IDS = ["gpt-5.4", "gpt-5.2", "gpt-4.1-mini"] as const;

export type OwnModelId = (typeof OWN_MODEL_IDS)[number];

/** Default OpenAI model for code generation */
export const DEFAULT_OWN_MODEL_ID: OwnModelId = "gpt-5.2";

/**
 * Old model IDs that may exist in persisted data (localStorage, DB rows,
 * URL params). The resolver maps them to the current canonical ID so the
 * v0 Platform API always receives a valid value.
 */
export const LEGACY_ALIAS: Record<string, CanonicalModelId> = {
  "v0-mini": "v0-1.5-md",
  "v0-pro": "v0-1.5-md",
  "v0-max": "v0-max-fast",
};

export const LEGACY_MODEL_IDS = Object.keys(LEGACY_ALIAS) as (keyof typeof LEGACY_ALIAS)[];

/**
 * Union of every model ID that is accepted as input (canonical + legacy).
 * Used by Zod schemas and Set-based lookups.
 */
export const ACCEPTED_MODEL_IDS = [
  ...CANONICAL_MODEL_IDS,
  ...LEGACY_MODEL_IDS,
] as const;

export type AcceptedModelId = (typeof ACCEPTED_MODEL_IDS)[number];

const ACCEPTED_SET = new Set<string>(ACCEPTED_MODEL_IDS);

export function isAcceptedModelId(value: string): value is AcceptedModelId {
  return ACCEPTED_SET.has(value);
}

const CANONICAL_SET = new Set<string>(CANONICAL_MODEL_IDS);

export function isCanonicalModelId(value: string): value is CanonicalModelId {
  return CANONICAL_SET.has(value);
}

/**
 * Resolve any accepted model ID to its canonical form.
 * Returns `null` for unknown strings.
 */
export function canonicalizeModelId(
  value: string | null | undefined,
): CanonicalModelId | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (isCanonicalModelId(trimmed)) return trimmed;
  if (trimmed in LEGACY_ALIAS) return LEGACY_ALIAS[trimmed];
  return null;
}

export const MODEL_LABELS: Record<CanonicalModelId, string> = {
  "v0-max-fast": "Max Fast",
  "v0-1.5-md": "Pro",
  "v0-1.5-lg": "Max",
  "v0-gpt-5": "GPT-5",
};

export type QualityLevel = "light" | "standard" | "pro" | "premium" | "max";

export const QUALITY_TO_MODEL: Record<QualityLevel, CanonicalModelId> = {
  light: "v0-1.5-md",
  standard: "v0-1.5-md",
  pro: "v0-1.5-md",
  premium: "v0-max-fast",
  max: "v0-max-fast",
};

/**
 * Maps quality level to OpenAI model ID for the default engine.
 * Used when V0_FALLBACK_BUILDER is not set (own GPT 5.2 engine).
 */
export const QUALITY_TO_OPENAI_MODEL: Record<QualityLevel, OwnModelId> = {
  light: "gpt-4.1-mini",
  standard: "gpt-5.2",
  pro: "gpt-5.2",
  premium: "gpt-5.4",
  max: "gpt-5.4",
};

/**
 * Maps v0 model tier to OpenAI model ID for non-fallback generation.
 * Used when user selects a tier and we use the own engine.
 */
export function v0TierToOpenAIModel(v0Tier: CanonicalModelId): OwnModelId {
  const qualityMap: Partial<Record<CanonicalModelId, QualityLevel>> = {
    "v0-1.5-md": "standard",
    "v0-max-fast": "max",
    "v0-1.5-lg": "max",
    "v0-gpt-5": "max",
  };
  const quality = qualityMap[v0Tier] ?? "standard";
  return QUALITY_TO_OPENAI_MODEL[quality];
}
