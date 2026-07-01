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
//   SAJTMASKIN_MODEL_FAST=gpt-5.4-mini
//   SAJTMASKIN_MODEL_PRO=gpt-5.3-codex
//   SAJTMASKIN_MODEL_MAX=gpt-5.5
//   SAJTMASKIN_MODEL_CODEX=gpt-5.3-codex
//
//   # ── Prompt Assist / Brief (provider/model, se config/ai_models) ─
//   SAJTMASKIN_ASSIST_MODEL=openai/gpt-5.5
//   SAJTMASKIN_POLISH_MODEL=openai/gpt-5.3-codex
//
//   # ── Token-gränser ────────────────────────────────────────────
//   SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS=131072
//   SAJTMASKIN_AUTOFIX_MAX_OUTPUT_TOKENS=82000
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

// Static committed budget for the lease-holding repair + quality-gate routes.
// This MUST mirror the generated `export const maxDuration` literal, which
// sync-route-timeouts.mjs writes from `routeTimeouts.*.default` (NOT the envKey:
// Next.js bakes `maxDuration` in at build time, so an env override can never
// move the real ceiling). All lease/verify/watchdog timing derives from this
// static value so a raised env can never push a client timeout above the actual
// route budget and skip `finally { releaseVersionLease }` (Codex P1 #284).
export const VERIFY_REPAIR_ROUTE_BUDGET_SECONDS =
  rt.verifyRepairRouteMaxDurationSeconds.default;

/** Watchdog for versions stuck in `verifying` — aligned with the static repair/quality-gate route budget. */
export const STALE_VERIFICATION_TIMEOUT_MS =
  VERIFY_REPAIR_ROUTE_BUDGET_SECONDS * 1000;

/**
 * Wall-clock reserve (ms) kept below the static repair-route budget so the loop
 * can wind down — fail the version + release the distributed lease — after it
 * stops starting new work. Mirrors the 30s verify/lease-release headroom that
 * keeps `finally { releaseVersionLease }` ahead of the platform hard-kill
 * (#260 / #284).
 */
export const REPAIR_LOOP_RELEASE_HEADROOM_MS = 30_000;

/**
 * Wall-clock budget (ms) for the lease-holding repair route's repair loop,
 * derived from the static route `maxDuration`
 * (#284 `VERIFY_REPAIR_ROUTE_BUDGET_SECONDS`) minus the lease-release headroom.
 * The loop stops starting new LLM passes / the final verify once the elapsed
 * wall-clock from route entry reaches this, returning `time_budget_exceeded`
 * instead of being hard-killed mid-pass (#284 follow-up: "stop the repair loop
 * itself after repeated timeouts").
 */
export const REPAIR_LOOP_BUDGET_MS =
  VERIFY_REPAIR_ROUTE_BUDGET_SECONDS * 1000 - REPAIR_LOOP_RELEASE_HEADROOM_MS;

/**
 * Smallest remaining wall-clock budget (ms) in which the manual repair loop will
 * still START the final preview-host verify (the "final gate"). Below this floor
 * the gate is skipped gracefully (`earlyStopReason = "time_budget_exceeded"`)
 * because a verify that cannot return a useful result before the route winds down
 * is wasted budget. At/above it the gate RUNS, with a per-call verify timeout
 * bounded by the remaining budget (see `resolveFinalGateVerifyBudget`).
 *
 * This dynamic floor is what lets a manual LLM repair actually promote under
 * budget. The previous fix reserved a FULL static verify timeout
 * (`PREVIEW_HOST_CLIENT_TIMEOUTS_MS.verify` ≈ the whole loop budget), so the
 * reserve ≈ the deadline and the final gate ALWAYS skipped — LLM repair never
 * promoted (#286 Bugbot HIGH). Chosen as a realistic minimum-viable verify
 * window, not ~0, so we never start a verify that cannot finish in time.
 */
export const FINAL_GATE_MIN_FLOOR_MS = 60_000;

/**
 * Safety margin (ms) subtracted from the remaining budget when bounding the
 * final-gate verify timeout, so the verify's `AbortSignal` fires strictly before
 * `repairDeadlineEpochMs` and the route's `finally { releaseVersionLease }` runs
 * ahead of the platform hard-kill (Codex P1 #286). Stacks on top of
 * `REPAIR_LOOP_RELEASE_HEADROOM_MS` (the deadline is already that far below the
 * route's static `maxDuration`).
 */
export const FINAL_GATE_RELEASE_MARGIN_MS = 5_000;

export const LLM_FIXER_TIMEOUT_MS = readIntEnv(
  "SAJTMASKIN_LLM_FIXER_TIMEOUT_MS",
  180_000,
  15_000,
  300_000,
);

export const LLM_FIXER_RETRY_TIMEOUT_MS = readIntEnv(
  "SAJTMASKIN_LLM_FIXER_TIMEOUT_RETRY_MS",
  240_000,
  15_000,
  300_000,
);

export const SYNTAX_FIX_MAX_PASSES = repairPolicies.syntaxFixPasses;
export const DETERMINISTIC_AUTOFIX_MAX_PASSES =
  repairPolicies.deterministicAutofixPasses;
export const MANUAL_REPAIR_ROUTE_MAX_LLM_PASSES =
  repairPolicies.manualRepairRouteLlmPasses;
export const SERVER_REPAIR_MAX_PASSES = repairPolicies.serverRepairPasses;
export const REPAIR_ACCEPT_TIMEOUT_MINUTES = repairPolicies.repairAcceptTimeoutMinutes;
export const REPAIR_ACCEPT_TIMEOUT_MS = REPAIR_ACCEPT_TIMEOUT_MINUTES * 60 * 1000;
export const PARTIAL_FILE_REPAIR_MAX_ATTEMPTS =
  repairPolicies.partialFileRepairMaxAttempts;

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
