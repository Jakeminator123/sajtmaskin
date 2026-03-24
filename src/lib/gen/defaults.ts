import {
  getAiModelsManifest,
  type BuildProfileId,
} from "@/lib/ai-models/load-manifest";

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

const manifest = getAiModelsManifest();
const bp = manifest.buildProfiles.defaults;
const tb = manifest.tokenBudgets;
const rt = manifest.routeTimeouts;
const pa = manifest.promptAssist;

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
//   # ── Prompt Assist / Brief (provider/model, se config/ai_models) ─
//   SAJTMASKIN_ASSIST_MODEL=openai/gpt-5.4
//   SAJTMASKIN_POLISH_MODEL=openai/gpt-5.3-codex
//
//   # ── Token-gränser ────────────────────────────────────────────
//   SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS=32768
//   SAJTMASKIN_AUTOFIX_MAX_OUTPUT_TOKENS=12288
//   SAJTMASKIN_ASSIST_MAX_OUTPUT_TOKENS=16384
//
// ============================================================================

/** Generation models — defaults from config/ai_models/manifest.json */
export const MODEL_FAST = readStringEnv(manifest.buildProfiles.envKeys.fast, bp.fast);
export const MODEL_PRO = readStringEnv(manifest.buildProfiles.envKeys.pro, bp.pro);
export const MODEL_MAX = readStringEnv(manifest.buildProfiles.envKeys.max, bp.max);
export const MODEL_CODEX = readStringEnv(manifest.buildProfiles.envKeys.codex, bp.codex);

/** Prompt assist default model string (provider/model) */
export const ASSIST_MODEL = readStringEnv(pa.envKeys.assist, pa.defaults.assist);

/** Prompt polish model for "Skriv om" */
export const POLISH_MODEL = readStringEnv(pa.envKeys.polish, pa.defaults.polish);

// ============================================================================
// TOKEN BUDGETS
// ============================================================================

export const ENGINE_MAX_OUTPUT_TOKENS = readIntEnv(
  tb.engineMaxOutputTokens.envKey,
  tb.engineMaxOutputTokens.default,
  tb.engineMaxOutputTokens.min,
  tb.engineMaxOutputTokens.max,
);

export const AUTOFIX_MAX_OUTPUT_TOKENS = readIntEnv(
  tb.autofixMaxOutputTokens.envKey,
  tb.autofixMaxOutputTokens.default,
  tb.autofixMaxOutputTokens.min,
  tb.autofixMaxOutputTokens.max,
);

export const ASSIST_MAX_OUTPUT_TOKENS = readIntEnv(
  tb.assistMaxOutputTokens.envKey,
  tb.assistMaxOutputTokens.default,
  tb.assistMaxOutputTokens.min,
  tb.assistMaxOutputTokens.max,
);

// ============================================================================
// TIMEOUTS
// ============================================================================

export const ENGINE_ROUTE_MAX_DURATION_SECONDS = readIntEnv(
  rt.engineRouteMaxDurationSeconds.envKey,
  rt.engineRouteMaxDurationSeconds.default,
  rt.engineRouteMaxDurationSeconds.min,
  rt.engineRouteMaxDurationSeconds.max,
);

export const ASSIST_ROUTE_MAX_DURATION_SECONDS = readIntEnv(
  rt.assistRouteMaxDurationSeconds.envKey,
  rt.assistRouteMaxDurationSeconds.default,
  rt.assistRouteMaxDurationSeconds.min,
  rt.assistRouteMaxDurationSeconds.max,
);

export const STREAM_SAFETY_TIMEOUT_DEFAULT_MS = readIntEnv(
  rt.streamSafetyTimeoutMs.envKey,
  rt.streamSafetyTimeoutMs.default,
  rt.streamSafetyTimeoutMs.min,
  rt.streamSafetyTimeoutMs.max,
);

/** Re-export for callers that resolve env keys dynamically (e.g. catalog). */
export function getBuildProfileEnvKey(profile: BuildProfileId): string {
  return manifest.buildProfiles.envKeys[profile];
}
