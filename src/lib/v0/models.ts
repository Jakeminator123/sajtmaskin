/**
 * Build-model definitions — single source of truth for both engines.
 *
 * IMPORTANT: This file lives in `v0/` for historical reasons, but it defines
 * the builder's internal model IDs for BOTH the own engine and the explicit
 * v0 fallback. Internal IDs are neutral (`fast`, `pro`, `max`, `codex`) so
 * the own-engine path is not mislabeled as `v0-*`.
 *
 * When the own engine is active (default, V0_FALLBACK_BUILDER != "y"):
 *   fast   -> gpt-4.1
 *   pro    -> gpt-5.3-codex
 *   max    -> gpt-5.4
 *   codex  -> gpt-5.1-codex-max
 *
 * When v0 fallback is active (V0_FALLBACK_BUILDER=y):
 *   the internal profile is translated to the matching v0 Platform API model.
 */

/** Explicit v0 Platform API model IDs — only used on fallback paths. */
export const V0_MODEL_IDS = [
  "v0-max-fast",
  "v0-1.5-md",
  "v0-1.5-lg",
  "v0-gpt-5",
] as const;

export type V0ModelId = (typeof V0_MODEL_IDS)[number];

/** Internal canonical IDs for the builder's own model profiles. */
export const CANONICAL_MODEL_IDS = ["fast", "pro", "max", "codex"] as const;

export type CanonicalModelId = (typeof CANONICAL_MODEL_IDS)[number];

export const DEFAULT_MODEL_ID: CanonicalModelId = "max";

/** Model IDs for the default engine (when not using v0 fallback) */
export const OWN_MODEL_IDS = [
  "gpt-5.4",
  "gpt-5.3-codex",
  "gpt-5.1-codex-max",
  "gpt-5.2",
  "gpt-4.1",
  "gpt-4.1-mini",
  "claude-sonnet-4.6",
  "claude-opus-4.6",
] as const;

export type OwnModelId = (typeof OWN_MODEL_IDS)[number];

/** Default OpenAI model for code generation */
export const DEFAULT_OWN_MODEL_ID: OwnModelId = "gpt-5.3-codex";

/**
 * Old model IDs that may exist in persisted data (localStorage, DB rows,
 * URL params). Multiple legacy IDs may intentionally point to the same
 * canonical profile. These are compatibility aliases, not separate active
 * models. The resolver maps them to the current canonical ID.
 */
export const LEGACY_ALIAS: Record<string, CanonicalModelId> = {
  "v0-max-fast": "fast",
  "v0-1.5-sm": "fast",
  "v0-max": "fast",
  "v0-1.5-md": "pro",
  "v0-mini": "pro",
  "v0-pro": "pro",
  "v0-1.5-lg": "max",
  "v0-gpt-5": "codex",
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

/**
 * User-facing labels for the builder profiles.
 */
export const MODEL_LABELS: Record<CanonicalModelId, string> = {
  fast: "GPT-4.1",
  pro: "GPT-5.3 Codex",
  max: "GPT-5.4",
  codex: "GPT-5.1 Codex Max",
};

export const BUILD_PROFILE_IDS: Record<CanonicalModelId, "fast" | "pro" | "max" | "codex"> = {
  fast: "fast",
  pro: "pro",
  max: "max",
  codex: "codex",
};

export type BuildProfileId = (typeof BUILD_PROFILE_IDS)[CanonicalModelId];

export function getBuildProfileId(modelId: CanonicalModelId): BuildProfileId {
  return BUILD_PROFILE_IDS[modelId];
}

export function getBuildProfileLabel(modelId: CanonicalModelId): string {
  return MODEL_LABELS[modelId];
}

export type QualityLevel = "light" | "standard" | "pro" | "premium" | "max";

export const QUALITY_TO_MODEL: Record<QualityLevel, CanonicalModelId> = {
  light: "pro",
  standard: "pro",
  pro: "pro",
  premium: "fast",
  max: "fast",
};

/**
 * Maps quality level to OpenAI model ID for the default engine.
 * Used when V0_FALLBACK_BUILDER is not set (own GPT 5.2 engine).
 */
export const QUALITY_TO_OPENAI_MODEL: Record<QualityLevel, OwnModelId> = {
  light: "gpt-4.1",
  standard: "gpt-5.3-codex",
  pro: "gpt-5.3-codex",
  premium: "gpt-5.4",
  max: "gpt-5.1-codex-max",
};

/**
 * Maps the canonical builder profile to the v0 Platform API model ID.
 */
export function canonicalModelIdToV0ModelId(modelId: CanonicalModelId): V0ModelId {
  const modelMap: Record<CanonicalModelId, V0ModelId> = {
    fast: "v0-max-fast",
    pro: "v0-1.5-md",
    max: "v0-1.5-lg",
    codex: "v0-gpt-5",
  };
  return modelMap[modelId];
}

/**
 * Maps the canonical builder profile to an OpenAI model ID for own-engine generation.
 *
 * | Profile    | OpenAI model       | Use case                    |
 * |------------|--------------------|-----------------------------|
 * | fast       | gpt-4.1            | Quick edits, simple sites   |
 * | pro        | gpt-5.3-codex      | Code-specialized, balanced  |
 * | max        | gpt-5.4            | Flagship, best reasoning    |
 * | codex      | gpt-5.1-codex-max  | Code + xhigh reasoning      |
 */
export function v0TierToOpenAIModel(modelId: CanonicalModelId): OwnModelId {
  const tierMap: Record<CanonicalModelId, OwnModelId> = {
    fast: "gpt-4.1",
    pro: "gpt-5.3-codex",
    max: "gpt-5.4",
    codex: "gpt-5.1-codex-max",
  };
  return tierMap[modelId] ?? "gpt-5.3-codex";
}
