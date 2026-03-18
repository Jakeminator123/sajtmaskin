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
//   SAJTMASKIN_MODEL_CODEX=gpt-5.1-codex-max
//
//   # ── Prompt Assist / Brief (via AI Gateway) ───────────────────
//   SAJTMASKIN_ASSIST_MODEL=openai/gpt-5.4
//   SAJTMASKIN_POLISH_MODEL=openai/gpt-5.3-codex
//
//   # ── Token-gränser ────────────────────────────────────────────
//   SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS=32768
//   SAJTMASKIN_AUTOFIX_MAX_OUTPUT_TOKENS=12288
//   SAJTMASKIN_ASSIST_MAX_OUTPUT_TOKENS=16384
//
// ============================================================================

/** Generation models — used directly against OpenAI API */
export const MODEL_FAST = readStringEnv("SAJTMASKIN_MODEL_FAST", "gpt-4.1");
export const MODEL_PRO = readStringEnv("SAJTMASKIN_MODEL_PRO", "gpt-5.3-codex");
export const MODEL_MAX = readStringEnv("SAJTMASKIN_MODEL_MAX", "gpt-5.4");
export const MODEL_CODEX = readStringEnv("SAJTMASKIN_MODEL_CODEX", "gpt-5.1-codex-max");

/** Prompt assist model — used via AI Gateway for brief/enhance */
export const ASSIST_MODEL = readStringEnv("SAJTMASKIN_ASSIST_MODEL", "openai/gpt-5.4");

/** Prompt polish model — used via AI Gateway for "Skriv om" */
export const POLISH_MODEL = readStringEnv("SAJTMASKIN_POLISH_MODEL", "openai/gpt-5.3-codex");

// ============================================================================
// TOKEN BUDGETS
// ============================================================================

export const ENGINE_MAX_OUTPUT_TOKENS = readIntEnv(
  "SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS",
  32_768,
  4_096,
  262_144,
);

export const AUTOFIX_MAX_OUTPUT_TOKENS = readIntEnv(
  "SAJTMASKIN_AUTOFIX_MAX_OUTPUT_TOKENS",
  12_288,
  2_048,
  65_536,
);

export const ASSIST_MAX_OUTPUT_TOKENS = readIntEnv(
  "SAJTMASKIN_ASSIST_MAX_OUTPUT_TOKENS",
  16_384,
  4_096,
  128_000,
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
