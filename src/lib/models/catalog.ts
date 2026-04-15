/**
 * Builder model catalog.
 *
 * This is the neutral source of truth for internal model tiers used across the
 * own engine, pricing, and validation.
 *
 * Default concrete model IDs per tier also live in `config/ai_models/manifest.json`
 * (loaded via `@/lib/ai-models/load-manifest`); env vars still override.
 */
import {
  getBuildProfileDefaultOwnEngineModel,
  getDefaultMaxTierOwnEngineModel,
  getQualityToOwnEngineModels,
} from "@/lib/ai-models/load-manifest";
import { getBuildProfileEnvKey } from "@/lib/gen/defaults";

/** Internal canonical IDs for the builder's own model profiles. */
export const CANONICAL_MODEL_IDS = ["fast", "pro", "max", "codex", "anthropic"] as const;

export type CanonicalModelId = (typeof CANONICAL_MODEL_IDS)[number];

export const DEFAULT_MODEL_ID: CanonicalModelId = "pro";

/** Concrete model IDs for the own engine. */
export const OWN_MODEL_IDS = [
  "gpt-5.4",
  "gpt-5.3-codex",
  "gpt-5.2",
  "gpt-4.1",
  "claude-sonnet-4.6",
  "claude-opus-4.6",
] as const;

export type OwnModelId = (typeof OWN_MODEL_IDS)[number];

/** Must match `buildProfiles.defaults.max` in config/ai_models/manifest.json */
export const DEFAULT_OWN_MODEL_ID = getDefaultMaxTierOwnEngineModel() as OwnModelId;

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

/** Best-effort reverse lookup from resolved own-engine model id back to canonical tier. */
export function ownModelIdToCanonicalModelId(
  value: string | null | undefined,
): CanonicalModelId | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  for (const candidate of CANONICAL_MODEL_IDS) {
    if (canonicalModelIdToOwnModelId(candidate) === trimmed) {
      return candidate;
    }
  }
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

export type QualityLevel = "light" | "standard" | "pro" | "premium" | "max";

export const QUALITY_TO_MODEL: Record<QualityLevel, CanonicalModelId> = {
  light: "fast",
  standard: "pro",
  pro: "pro",
  premium: "max",
  max: "codex",
};

/** Maps quality level to own-engine model ID (defaults from ai_models manifest). */
export const QUALITY_TO_OPENAI_MODEL = getQualityToOwnEngineModels() as Record<
  QualityLevel,
  OwnModelId
>;

/** Maps the canonical builder profile to an own-engine model ID. */
export function canonicalModelIdToOwnModelId(modelId: CanonicalModelId): OwnModelId {
  const tierMap: Record<CanonicalModelId, string> = {
    fast:
      process.env[getBuildProfileEnvKey("fast")]?.trim() ||
      getBuildProfileDefaultOwnEngineModel("fast"),
    pro:
      process.env[getBuildProfileEnvKey("pro")]?.trim() ||
      getBuildProfileDefaultOwnEngineModel("pro"),
    max:
      process.env[getBuildProfileEnvKey("max")]?.trim() ||
      getBuildProfileDefaultOwnEngineModel("max"),
    codex:
      process.env[getBuildProfileEnvKey("codex")]?.trim() ||
      getBuildProfileDefaultOwnEngineModel("codex"),
    anthropic:
      process.env[getBuildProfileEnvKey("anthropic")]?.trim() ||
      getBuildProfileDefaultOwnEngineModel("anthropic"),
  };
  return (tierMap[modelId] ?? getBuildProfileDefaultOwnEngineModel("pro")) as OwnModelId;
}

