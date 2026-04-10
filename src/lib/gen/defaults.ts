import {
  getAiModelsManifest,
  getBriefingDefaultsFromManifest,
  getBriefingEnvKeysFromManifest,
  getRepairPoliciesFromManifest,
  getWorkloadDefaultModelFromManifest,
  getWorkloadFallbackModelsFromManifest,
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
const tb = manifest.tokenBudgets;
const rt = manifest.routeTimeouts;
const pa = manifest.promptAssist;
const briefing = getBriefingDefaultsFromManifest();
const briefingEnvKeys = getBriefingEnvKeysFromManifest();
const repairPolicies = getRepairPoliciesFromManifest();

// ============================================================================
// MODEL CONFIGURATION
//
// All model choices are centralized here. Override via .env.local:
//
//   # ── Byggmodeller (kodgenerering, direkt mot OpenAI) ──────────
//   SAJTMASKIN_MODEL_FAST=gpt-4.1
//   SAJTMASKIN_MODEL_PRO=gpt-5.3-codex
//   SAJTMASKIN_MODEL_MAX=gpt-5.4
//   SAJTMASKIN_MODEL_CODEX=gpt-5.3-codex-max
//
//   # ── Prompt Assist / Brief (provider/model, se config/ai_models) ─
//   SAJTMASKIN_ASSIST_MODEL=openai/gpt-5.4
//   SAJTMASKIN_POLISH_MODEL=openai/gpt-5.3-codex
//
//   # ── Token-gränser ────────────────────────────────────────────
//   SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS=131072
//   SAJTMASKIN_AUTOFIX_MAX_OUTPUT_TOKENS=49152
//   SAJTMASKIN_ASSIST_MAX_OUTPUT_TOKENS=82768
//
// ============================================================================

/** Prompt assist default model string (provider/model) */
export const ASSIST_MODEL = readStringEnv(pa.envKeys.assist, pa.defaults.assist);

/** Prompt polish model for "Skriv om" */
export const POLISH_MODEL = readStringEnv(pa.envKeys.polish, pa.defaults.polish);

/** Deep Brief model for `/api/ai/brief` when the caller does not override it. */
export const BRIEF_MODEL = readStringEnv(
  briefingEnvKeys.requestModel,
  briefing.requestModel,
);

/** Server auto-brief fallback when OpenAI-class assist is available. */
export const AUTO_BRIEF_MODEL_OPENAI = readStringEnv(
  briefingEnvKeys.serverAutoOpenAI,
  briefing.serverAutoOpenAI,
);

/** Server auto-brief fallback when Anthropic is available. */
export const AUTO_BRIEF_MODEL_ANTHROPIC = readStringEnv(
  briefingEnvKeys.serverAutoAnthropic,
  briefing.serverAutoAnthropic,
);

/** Older spec-first helper default model. */
export const SPEC_MODEL = readStringEnv(
  briefingEnvKeys.specModel,
  briefing.specModel,
);

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

export const STREAM_SAFETY_TIMEOUT_DEFAULT_MS = readIntEnv(
  rt.streamSafetyTimeoutMs.envKey,
  rt.streamSafetyTimeoutMs.default,
  rt.streamSafetyTimeoutMs.min,
  rt.streamSafetyTimeoutMs.max,
);

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

export const SYNTAX_FIX_MAX_PASSES = repairPolicies.syntaxFixPasses;
export const DETERMINISTIC_AUTOFIX_MAX_PASSES =
  repairPolicies.deterministicAutofixPasses;
export const MANUAL_REPAIR_ROUTE_MAX_LLM_PASSES =
  repairPolicies.manualRepairRouteLlmPasses;
export const SERVER_REPAIR_MAX_PASSES = repairPolicies.serverRepairPasses;

export const PROJECT_ANALYZE_DEFAULT_MODEL =
  getWorkloadDefaultModelFromManifest("project_analyze") ?? "gpt-5-mini";

export const AUDIT_STRUCTURED_DEFAULT_MODEL =
  getWorkloadDefaultModelFromManifest("audit_structured") ?? "openai/gpt-5.2";

export const AUDIT_STRUCTURED_FALLBACK_MODELS = getWorkloadFallbackModelsFromManifest(
  "audit_structured",
);

export const ANALYZE_PRESENTATION_DEFAULT_MODEL =
  getWorkloadDefaultModelFromManifest("analyze_presentation") ?? "openai/gpt-5-mini";

export const ANALYZE_PRESENTATION_FALLBACK_MODELS =
  getWorkloadFallbackModelsFromManifest("analyze_presentation");

export const INSPECTOR_AI_MATCH_DEFAULT_MODEL =
  getWorkloadDefaultModelFromManifest("inspector_ai_match") ?? "gpt-5-mini";

/** Re-export for callers that resolve env keys dynamically (e.g. catalog). */
export function getBuildProfileEnvKey(profile: BuildProfileId): string {
  return manifest.buildProfiles.envKeys[profile];
}
