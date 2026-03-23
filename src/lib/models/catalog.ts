/**
 * Builder model catalog.
 *
 * This is the neutral source of truth for internal model tiers used across the
 * own engine, pricing, validation, and the v0 fallback adapter.
 */

import {
  MODEL_ANTHROPIC,
  MODEL_CODEX,
  MODEL_FAST,
  MODEL_MAX,
  MODEL_PRO,
} from "@/lib/gen/defaults";

/** Explicit v0 Platform API model IDs — only used on fallback paths. */
export const V0_MODEL_IDS = [
  "v0-max-fast",
  "v0-1.5-md",
  "v0-1.5-lg",
  "v0-gpt-5",
] as const;

export type V0ModelId = (typeof V0_MODEL_IDS)[number];

/** Internal canonical IDs for the builder's own model profiles. */
export const CANONICAL_MODEL_IDS = ["fast", "pro", "max", "codex", "anthropic"] as const;

export type CanonicalModelId = (typeof CANONICAL_MODEL_IDS)[number];

export const DEFAULT_MODEL_ID: CanonicalModelId = "max";

/** Model IDs for the default engine (when not using v0 fallback). */
export const OWN_MODEL_IDS = [
  "gpt-5.4",
  "gpt-5.3-codex",
  "gpt-5.2-codex",
  "gpt-5.1-codex-max",
  "gpt-5.2",
  "gpt-4.1",
  "gpt-4.1-mini",
  "claude-sonnet-4.6",
  "claude-opus-4.6",
] as const;

export type OwnModelId = (typeof OWN_MODEL_IDS)[number];

/**
 * Default model for code generation.
 * Kept in sync with DEFAULT_MODEL_ID ("max") -> "gpt-5.4".
 * Uses a getter to avoid hoisting issues with canonicalModelIdToOwnModelId.
 */
export function getDefaultOwnModelId(): OwnModelId {
  return canonicalModelIdToOwnModelId(DEFAULT_MODEL_ID);
}
export const DEFAULT_OWN_MODEL_ID: OwnModelId = "gpt-5.4";

/**
 * Old model IDs that may exist in persisted data (localStorage, DB rows,
 * URL params). These are compatibility aliases, not separate active models.
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

/** Union of every model ID accepted as input (canonical + legacy). */
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

/** Resolve any accepted model ID to its canonical form. */
export function canonicalizeModelId(
  value: string | null | undefined,
): CanonicalModelId | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (isCanonicalModelId(trimmed)) return trimmed;
  if (trimmed in LEGACY_ALIAS) return LEGACY_ALIAS[trimmed];
  return null;
}

/** User-facing labels for the builder profiles. */
export const MODEL_LABELS: Record<CanonicalModelId, string> = {
  fast: "Snabb",
  pro: "Lagom",
  max: "Tanker",
  codex: "Kod Max",
  anthropic: "Anthropic",
};

export const BUILD_PROFILE_IDS: Record<
  CanonicalModelId,
  "fast" | "pro" | "max" | "codex" | "anthropic"
> = {
  fast: "fast",
  pro: "pro",
  max: "max",
  codex: "codex",
  anthropic: "anthropic",
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
  light: "fast",
  standard: "pro",
  pro: "pro",
  premium: "max",
  max: "codex",
};

/** Maps quality level to OpenAI model ID for the default engine. */
export const QUALITY_TO_OPENAI_MODEL: Record<QualityLevel, OwnModelId> = {
  light: "gpt-4.1",
  standard: "gpt-5.3-codex",
  pro: "gpt-5.3-codex",
  premium: "gpt-5.4",
  /** Same default as `codex` tier (`MODEL_CODEX`). */
  max: MODEL_CODEX as OwnModelId,
};

/** Maps the canonical builder profile to the v0 Platform API model ID. */
export function canonicalModelIdToV0ModelId(modelId: CanonicalModelId): V0ModelId {
  const modelMap: Record<CanonicalModelId, V0ModelId> = {
    fast: "v0-max-fast",
    pro: "v0-1.5-md",
    max: "v0-1.5-lg",
    codex: "v0-gpt-5",
    // Legacy-only fallback mapping; active builder generation does not use the v0 path.
    anthropic: "v0-1.5-lg",
  };
  return modelMap[modelId];
}

/**
 * Maps the canonical builder profile to an own-engine model ID.
 *
 * - **`max`** → GPT‑5.4 class (`MODEL_MAX`), UI “Max / Tanker” (not `codex`).
 * - **`codex`** → `MODEL_CODEX` (“Kod Max”); override via `SAJTMASKIN_MODEL_CODEX` (e.g. `gpt-5.1-codex-max`).
 * - **`anthropic`** → Opus (`MODEL_ANTHROPIC`), routed via `@ai-sdk/anthropic` → Claude Messages API.
 */
export function canonicalModelIdToOwnModelId(modelId: CanonicalModelId): OwnModelId {
  const tierMap: Record<CanonicalModelId, string> = {
    fast: MODEL_FAST,
    pro: MODEL_PRO,
    max: MODEL_MAX,
    codex: MODEL_CODEX,
    anthropic: MODEL_ANTHROPIC,
  };
  return (tierMap[modelId] ?? MODEL_PRO) as OwnModelId;
}

/**
 * Compatibility alias while older modules still use the historical helper name.
 * Prefer `canonicalModelIdToOwnModelId()` from new code.
 */
export const v0TierToOpenAIModel = canonicalModelIdToOwnModelId;
