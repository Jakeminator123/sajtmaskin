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
export const CANONICAL_MODEL_IDS = ["premium", "pro", "max", "codex", "anthropic"] as const;

export type CanonicalModelId = (typeof CANONICAL_MODEL_IDS)[number];

export const DEFAULT_MODEL_ID: CanonicalModelId = "pro";

/**
 * Concrete model IDs for the own engine.
 *
 * GPT-5.6 Sol is the Premium default. Terra and Luna are available for
 * explicit phase routing in backoffice. Older full-size IDs remain for
 * persisted chat/version rows and environment overrides.
 *
 * `claude-sonnet-4.6` is **retired** (2026-06-28): it is no longer a default
 * or selectable model and is never sent to a provider — any lingering reference
 * is routed to `claude-opus-4.8` via {@link aliasRetiredModelId}. The token is
 * kept here only so persisted/legacy strings still parse and round-trip.
 */
export const OWN_MODEL_IDS = [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.3-codex",
  "gpt-5.2",
  "gpt-4.1",
  "claude-sonnet-4.6",
  "claude-opus-4.8",
  "claude-opus-4.6",
] as const;

export type OwnModelId = (typeof OWN_MODEL_IDS)[number];

/** Must match `buildProfiles.defaults.max` in config/ai_models/manifest.json */
export const DEFAULT_OWN_MODEL_ID = getDefaultMaxTierOwnEngineModel() as OwnModelId;

/**
 * Old model IDs that may exist in persisted data (localStorage, DB rows,
 * URL params). These are compatibility aliases, not separate active models.
 */
const LEGACY_ALIAS: Record<string, CanonicalModelId> = {
  fast: "premium",
  "v0-max-fast": "premium",
  "v0-1.5-sm": "premium",
  "v0-max": "premium",
  "v0-1.5-md": "pro",
  "v0-mini": "pro",
  "v0-pro": "pro",
  "v0-1.5-lg": "max",
  "v0-gpt-5": "codex",
};

const LEGACY_MODEL_IDS = Object.keys(LEGACY_ALIAS) as (keyof typeof LEGACY_ALIAS)[];

/**
 * Retired concrete model ids that must never reach a provider call. Any persisted
 * row / env value / phase override that still names one is silently routed to its
 * live replacement at the resolution boundaries (own-engine + prompt-assist), so
 * nothing 400s and the retired model never actually executes.
 *
 * Sonnet 4.6 was retired 2026-06-28 → Opus 4.8 (see manifest `buildProfiles`).
 * Both the dot form (`claude-sonnet-4.6`) and the API/version-normalized dash
 * form (`claude-sonnet-4-6`, produced by `resolveAnthropicBriefModelId` before
 * `createDirectModel`) are mapped across all provider prefixes so no brief /
 * direct-model path can slip the retired id through.
 */
const RETIRED_MODEL_ALIAS: Record<string, string> = {
  "gpt-5.4-mini": "gpt-5.6-sol",
  "claude-sonnet-4.6": "claude-opus-4.8",
  "claude-sonnet-4-6": "claude-opus-4-8",
  "anthropic/claude-sonnet-4.6": "anthropic/claude-opus-4.8",
  "anthropic/claude-sonnet-4-6": "anthropic/claude-opus-4-8",
  "anthropic-direct/claude-sonnet-4.6": "anthropic-direct/claude-opus-4-8",
  "anthropic-direct/claude-sonnet-4-6": "anthropic-direct/claude-opus-4-8",
};

/**
 * Map a retired model id to its live replacement; pass every other value through
 * unchanged (trimmed). Returns "" for null/undefined so callers can short-circuit.
 */
export function aliasRetiredModelId(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return RETIRED_MODEL_ALIAS[trimmed] ?? trimmed;
}

/** Union of every model ID accepted as input (canonical + legacy). */
export const ACCEPTED_MODEL_IDS = [...CANONICAL_MODEL_IDS, ...LEGACY_MODEL_IDS] as const;

const CANONICAL_SET = new Set<string>(CANONICAL_MODEL_IDS);

export function isCanonicalModelId(value: string): value is CanonicalModelId {
  return CANONICAL_SET.has(value);
}

/** Resolve any accepted model ID to its canonical form. */
export function canonicalizeModelId(value: string | null | undefined): CanonicalModelId | null {
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
  const persistedTier = canonicalizeModelId(value);
  if (persistedTier) return persistedTier;

  const trimmed = aliasRetiredModelId(value);
  if (!trimmed) return null;

  // GPT-5.6 variants belong to Premium even if an env override has changed
  // since the chat was persisted.
  if (trimmed.startsWith("gpt-5.6-")) return "premium";

  for (const candidate of CANONICAL_MODEL_IDS) {
    if (canonicalModelIdToOwnModelId(candidate) === trimmed) {
      return candidate;
    }
  }

  // Fall back to canonical manifest defaults when live env overrides have
  // changed since the chat was persisted.
  for (const candidate of CANONICAL_MODEL_IDS) {
    if (aliasRetiredModelId(getBuildProfileDefaultOwnEngineModel(candidate)) === trimmed) {
      return candidate;
    }
  }
  return null;
}

/** User-facing labels for the builder profiles. */
export const MODEL_LABELS: Record<CanonicalModelId, string> = {
  premium: "Premium",
  pro: "Lagom",
  max: "Tänker",
  codex: "Kod Max",
  anthropic: "Anthropic",
};

export const BUILD_PROFILE_IDS: Record<
  CanonicalModelId,
  "premium" | "pro" | "max" | "codex" | "anthropic"
> = {
  premium: "premium",
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
  light: "premium",
  standard: "pro",
  pro: "pro",
  premium: "premium",
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
    premium:
      process.env[getBuildProfileEnvKey("premium")]?.trim() ||
      getBuildProfileDefaultOwnEngineModel("premium"),
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
  const raw = tierMap[modelId] ?? getBuildProfileDefaultOwnEngineModel("pro");
  return aliasRetiredModelId(raw) as OwnModelId;
}
