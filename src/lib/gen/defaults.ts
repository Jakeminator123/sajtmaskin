function readIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  const rounded = Math.floor(raw);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function readStringEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

// ============================================================================
// MODEL CONFIGURATION
//
// All model choices are centralized here. Override via .env.local:
//
//   # ── Byggmodeller (kodgenerering, direkt mot OpenAI) ──────────
//   SAJTMASKIN_MODEL_FAST=gpt-4.1
//   SAJTMASKIN_MODEL_PRO=gpt-5.3-codex
//   SAJTMASKIN_MODEL_MAX=gpt-5.4
//   SAJTMASKIN_MODEL_CODEX=gpt-5.4
//
//   # ── Prompt Assist / Brief (via AI Gateway) ───────────────────
//   SAJTMASKIN_ASSIST_MODEL=openai/gpt-5.4
//   SAJTMASKIN_POLISH_MODEL=openai/gpt-5.3-codex
//
//   # ── Token-gränser ────────────────────────────────────────────
//   SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS=131072
//   SAJTMASKIN_AUTOFIX_MAX_OUTPUT_TOKENS=32768
//   SAJTMASKIN_AUTOFIX_SYNTAX_MAX_PASSES=6
//   SAJTMASKIN_ASSIST_MAX_OUTPUT_TOKENS=81920
//
// ============================================================================

/** Generation models — used directly against OpenAI API */
export const MODEL_FAST = readStringEnv("SAJTMASKIN_MODEL_FAST", "gpt-4.1");
export const MODEL_PRO = readStringEnv("SAJTMASKIN_MODEL_PRO", "gpt-5.3-codex");
export const MODEL_MAX = readStringEnv("SAJTMASKIN_MODEL_MAX", "gpt-5.4");
export const MODEL_CODEX = readStringEnv("SAJTMASKIN_MODEL_CODEX", "gpt-5.4");

/** Prompt assist model — used via AI Gateway for brief/enhance */
export const ASSIST_MODEL = readStringEnv("SAJTMASKIN_ASSIST_MODEL", "openai/gpt-5.4");

/** Prompt polish model — used via AI Gateway for "Skriv om" */
export const POLISH_MODEL = readStringEnv("SAJTMASKIN_POLISH_MODEL", "openai/gpt-5.3-codex");

// ============================================================================
// TOKEN BUDGETS
// ============================================================================

/** Fallback when tier is unknown — prefer getEngineMaxOutputTokens(tier). */
export const ENGINE_MAX_OUTPUT_TOKENS = readIntEnv(
  "SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS",
  128_000,
  4_096,
  262_144,
);

/** Per-tier caps for the main code-generation stream (build). Fast stays at gpt-4.1-class ceiling. */
const TIER_MAX_OUTPUT_TOKENS: Record<string, number> = {
  fast: 32_768,
  pro: 65_536,
  max: 128_000,
  codex: 128_000,
  anthropic: 128_000,
};

export function getEngineMaxOutputTokens(tier?: string | null): number {
  if (!tier) return ENGINE_MAX_OUTPUT_TOKENS;
  return TIER_MAX_OUTPUT_TOKENS[tier] ?? ENGINE_MAX_OUTPUT_TOKENS;
}

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

const TIER_REASONING_EFFORT: Record<string, ReasoningEffort> = {
  fast: "none",
  pro: "medium",
  max: "high",
  codex: "xhigh",
  anthropic: "none",
};

/**
 * Map builder "Thinking" to OpenAI `reasoning.effort`.
 * Only apply explicit reasoning when `thinking === true`.
 */
export function getReasoningEffort(tier?: string | null, thinking?: boolean): ReasoningEffort {
  if (thinking !== true) return "none";
  if (!tier) return "none";
  return TIER_REASONING_EFFORT[tier] ?? "none";
}

export const AUTOFIX_MAX_OUTPUT_TOKENS = readIntEnv(
  "SAJTMASKIN_AUTOFIX_MAX_OUTPUT_TOKENS",
  32_768,
  2_048,
  65_536,
);

/**
 * How many LLM fixer rounds to run for syntax validation (per-file stream) and
 * merged-project preflight. Closer to a local `next dev` compile loop without
 * running a full production build in CI.
 */
export const AUTOFIX_SYNTAX_MAX_PASSES = readIntEnv(
  "SAJTMASKIN_AUTOFIX_SYNTAX_MAX_PASSES",
  6,
  1,
  20,
);

export const ASSIST_MAX_OUTPUT_TOKENS = readIntEnv(
  "SAJTMASKIN_ASSIST_MAX_OUTPUT_TOKENS",
  81_920,
  4_096,
  262_144,
);

// ============================================================================
// TIMEOUTS
// ============================================================================

export const ENGINE_ROUTE_MAX_DURATION_SECONDS = readIntEnv(
  "SAJTMASKIN_ENGINE_ROUTE_MAX_DURATION_SECONDS",
  800,
  60,
  800,
);

export const ASSIST_ROUTE_MAX_DURATION_SECONDS = readIntEnv(
  "SAJTMASKIN_ASSIST_ROUTE_MAX_DURATION_SECONDS",
  600,
  60,
  800,
);

export const STREAM_SAFETY_TIMEOUT_DEFAULT_MS = readIntEnv(
  "SAJTMASKIN_STREAM_SAFETY_TIMEOUT_MS",
  12 * 60 * 1000,
  60_000,
  15 * 60 * 1000,
);
