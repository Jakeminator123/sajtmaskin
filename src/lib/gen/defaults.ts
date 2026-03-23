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
//   SAJTMASKIN_MODEL_ANTHROPIC=claude-opus-4.6
//
//   # ── Prompt Assist / Brief (via AI Gateway) ───────────────────
//   SAJTMASKIN_ASSIST_MODEL=openai/gpt-5.4
//   SAJTMASKIN_POLISH_MODEL=openai/gpt-5.3-codex
//
//   # ── Token-gränser ────────────────────────────────────────────
//   SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS=200000
//   SAJTMASKIN_AUTOFIX_MAX_OUTPUT_TOKENS=65536 (max clamp 262144)
//   SAJTMASKIN_AUTOFIX_SYNTAX_MAX_PASSES=6
//   SAJTMASKIN_ASSIST_MAX_OUTPUT_TOKENS=81920
//   AI_BRIEF_MAX_TOKENS=81920          (per-route tak för POST /api/ai/brief)
//   AI_CHAT_MAX_TOKENS=81920           (per-route tak för POST /api/ai/chat)
//   Effektiv brief-gräns: min(SAJTMASKIN_ASSIST_MAX_OUTPUT_TOKENS, AI_BRIEF_MAX_TOKENS)
//
// ============================================================================

/** Generation models — used directly against OpenAI API */
export const MODEL_FAST = readStringEnv("SAJTMASKIN_MODEL_FAST", "gpt-4.1");
export const MODEL_PRO = readStringEnv("SAJTMASKIN_MODEL_PRO", "gpt-5.3-codex");
export const MODEL_MAX = readStringEnv("SAJTMASKIN_MODEL_MAX", "gpt-5.4");
export const MODEL_CODEX = readStringEnv("SAJTMASKIN_MODEL_CODEX", "gpt-5.4");

/** Own-engine Anthropic tier (`canonicalModelId === "anthropic"`) — direct Anthropic API */
export const MODEL_ANTHROPIC = readStringEnv("SAJTMASKIN_MODEL_ANTHROPIC", "claude-opus-4.6");

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
  200_000,
  4_096,
  262_144,
);

/** Per-tier caps for the main code-generation stream (build). Capped by `ENGINE_MAX_OUTPUT_TOKENS`. */
const TIER_MAX_OUTPUT_TOKENS: Record<string, number> = {
  fast: 32_768,
  pro: 131_072,
  max: 200_000,
  codex: 200_000,
  anthropic: 200_000,
};

export function getEngineMaxOutputTokens(tier?: string | null): number {
  if (!tier) return ENGINE_MAX_OUTPUT_TOKENS;
  return TIER_MAX_OUTPUT_TOKENS[tier] ?? ENGINE_MAX_OUTPUT_TOKENS;
}

/**
 * Effective max output tokens for own-engine build streams: per-tier budget capped by
 * `SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS` (so lowering the env shrinks all tiers).
 */
export function resolveBuildMaxOutputTokens(tier?: string | null): number {
  return Math.min(ENGINE_MAX_OUTPUT_TOKENS, getEngineMaxOutputTokens(tier));
}

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

const TIER_REASONING_EFFORT: Record<string, ReasoningEffort> = {
  /** GPT-5 / Codex: use low when Thinking is on; skipped for gpt-4.1 via `supportsOpenAIReasoningEffort`. */
  fast: "low",
  pro: "medium",
  max: "high",
  /** Kod Max: same reasoning ceiling as Tanker (`high` when Thinking is on). */
  codex: "high",
  anthropic: "none",
};

/**
 * Map builder "Thinking" to OpenAI `reasoning.effort` (GPT-5 / Codex / o-series).
 * Only apply explicit reasoning when `thinking === true`.
 * Anthropic build lane uses Claude; OpenAI `reasoningEffort` is not sent for that tier.
 */
export function getReasoningEffort(tier?: string | null, thinking?: boolean): ReasoningEffort {
  if (thinking !== true) return "none";
  if (!tier) return "medium";
  return TIER_REASONING_EFFORT[tier] ?? "medium";
}

export const AUTOFIX_MAX_OUTPUT_TOKENS = readIntEnv(
  "SAJTMASKIN_AUTOFIX_MAX_OUTPUT_TOKENS",
  32_768,
  2_048,
  262_144,
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

/**
 * Shared LLM repair budget for the broader repair path (syntax + preview +
 * quality-gate diagnostics combined). Kept low to avoid runaway costs.
 */
export const BROAD_REPAIR_MAX_PASSES = readIntEnv(
  "SAJTMASKIN_BROAD_REPAIR_MAX_PASSES",
  2,
  1,
  6,
);

export const ASSIST_MAX_OUTPUT_TOKENS = readIntEnv(
  "SAJTMASKIN_ASSIST_MAX_OUTPUT_TOKENS",
  81_920,
  4_096,
  262_144,
);

/** Upper bound for `maxTokens` on `POST /api/ai/brief` (paired with `ASSIST_MAX_OUTPUT_TOKENS`). */
export const BRIEF_MAX_OUTPUT_TOKEN_CEILING = readIntEnv(
  "AI_BRIEF_MAX_TOKENS",
  81_920,
  4_096,
  262_144,
);

/** Upper bound for `maxTokens` on `POST /api/ai/chat`. */
export const CHAT_MAX_OUTPUT_TOKEN_CEILING = readIntEnv(
  "AI_CHAT_MAX_TOKENS",
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
