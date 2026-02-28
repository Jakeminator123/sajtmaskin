/**
 * Canonical v0 model schema — single source of truth.
 *
 * All model IDs, labels, legacy aliases, and the default tier are defined
 * here. Every other module (validation, pricing, UI, selection) imports
 * from this file instead of maintaining its own copy.
 */

export const CANONICAL_MODEL_IDS = [
  "v0-max-fast",
  "v0-1.5-md",
  "v0-1.5-lg",
  "v0-gpt-5",
] as const;

export type CanonicalModelId = (typeof CANONICAL_MODEL_IDS)[number];

export const DEFAULT_MODEL_ID: CanonicalModelId = "v0-max-fast";

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
