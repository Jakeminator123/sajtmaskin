/**
 * Centralized configuration for environment-dependent settings.
 * All env vars are validated and sanitized through src/lib/env.ts.
 */

import path from "path";
import { pickVercelAccessTokenFromEnv } from "@/lib/vercel";
import { getAppBaseUrl } from "./app-url";
import { getServerEnv } from "./env";
import { isAffirmativeEnvValue } from "./env-affirmative";

const env = getServerEnv();

export const IS_PRODUCTION = env.NODE_ENV === "production";
export const IS_RENDER = Boolean(env.RENDER);

export function getRuntimeEnvironment(): "development" | "preview" | "production" {
  const vercelEnv = env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnv === "preview") return "preview";
  if (vercelEnv === "production") return "production";
  return IS_PRODUCTION ? "production" : "development";
}

export const RUNTIME_ENVIRONMENT = getRuntimeEnvironment();

function isBuildPhase(): boolean {
  return (
    env.NEXT_PHASE === "phase-production-build" ||
    env.NEXT_PHASE === "phase-export"
  );
}

type RedisUrlParts = {
  host: string;
  port: number;
  username: string;
  password: string;
};

function normalizeRedisUrl(
  value: string | undefined,
  varName?: string,
): string | null {
  if (!value) return null;
  if (
    /^\$\{[A-Z0-9_]+\}$/.test(value) ||
    /^\$[A-Z0-9_]+$/.test(value)
  ) {
    return null;
  }
  if (!/^rediss?:\/\//i.test(value)) {
    if (!IS_PRODUCTION && varName) {
      console.warn(
        `[Config] ${varName} must be redis:// or rediss://. Ignoring value.`,
      );
    }
    return null;
  }
  return value;
}

function resolveRedisUrl(): string | null {
  const candidates = [
    normalizeRedisUrl(env.REDIS_URL, "REDIS_URL"),
    normalizeRedisUrl(env.KV_URL, "KV_URL"),
  ];
  return candidates.find(Boolean) || null;
}

function parseRedisUrl(redisUrl: string): RedisUrlParts | null {
  try {
    const parsed = new URL(redisUrl);
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 6379,
      username: parsed.username || "default",
      password: parsed.password || "",
    };
  } catch {
    return null;
  }
}

const RESOLVED_REDIS_URL = resolveRedisUrl();
const PARSED_REDIS_URL = RESOLVED_REDIS_URL
  ? parseRedisUrl(RESOLVED_REDIS_URL)
  : null;

/**
 * Data directory configuration (local uploads)
 * - Production (Render): /var/data (persistent disk) - MUST be set via DATA_DIR env var
 * - Local development: ./data (relative to app root)
 *
 * RENDER SETUP:
 * 1. Add persistent disk mounted at /var/data
 * 2. Set DATA_DIR=/var/data in environment variables
 * 3. Set root directory to "app" in Render settings
 */
let hasWarnedAboutDataDir = false;

function getDataDir(): string {
  if (env.DATA_DIR) {
    if (IS_PRODUCTION && !path.isAbsolute(env.DATA_DIR)) {
      const resolved = path.resolve(env.DATA_DIR);
      if (!hasWarnedAboutDataDir && !isBuildPhase()) {
        hasWarnedAboutDataDir = true;
        console.warn(
          `[Config] WARNING: DATA_DIR was relative, resolved to absolute: ${resolved}`,
        );
      }
      return resolved;
    }
    return env.DATA_DIR;
  }

  if (IS_RENDER && !hasWarnedAboutDataDir && !isBuildPhase()) {
    hasWarnedAboutDataDir = true;
    console.error(
      "[Config] ❌ CRITICAL: DATA_DIR not set on Render!\n" +
        "  → Uploads and local files will be lost on restart\n" +
        "  → Set DATA_DIR=/var/data and mount persistent disk",
    );
  }

  const localDataDir = path.join(/* turbopackIgnore: true */ process.cwd(), "data");

  if (!IS_PRODUCTION && !hasWarnedAboutDataDir) {
    hasWarnedAboutDataDir = true;
    console.info(`[Config] Using local data directory: ${localDataDir}`);
  }

  return localDataDir;
}

/**
 * All paths configuration
 */
export const PATHS = {
  get dataDir() {
    return getDataDir();
  },

  get uploads() {
    return path.join(getDataDir(), "uploads");
  },
} as const;

/**
 * API Keys and secrets (with validation at runtime, not build time)
 *
 * SECURITY: All secrets are accessed through getters to avoid
 * accidental exposure in logs/errors. Never log secret values!
 */
let _jwtSecretWarned = false;

export const SECRETS = {
  get jwtSecret() {
    if (env.JWT_SECRET) return env.JWT_SECRET;
    if (IS_PRODUCTION && !isBuildPhase()) {
      if (!_jwtSecretWarned) {
        _jwtSecretWarned = true;
        console.warn(
          "[Config] JWT_SECRET is not set in production — auth will not work",
        );
      }
      return "";
    }
    return "dev-secret-do-not-use-in-prod";
  },

  get vercelApiToken() {
    return pickVercelAccessTokenFromEnv();
  },

  get stripeSecretKey() {
    return env.STRIPE_SECRET_KEY ?? "";
  },

  get stripeWebhookSecret() {
    return env.STRIPE_WEBHOOK_SECRET ?? "";
  },

  get unsplashAccessKey() {
    return env.UNSPLASH_ACCESS_KEY ?? "";
  },

  get pexelsApiKey() {
    return env.PEXELS_API_KEY ?? "";
  },

  get figmaAccessToken() {
    return env.FIGMA_ACCESS_TOKEN ?? "";
  },

  // Google OAuth - automatically selects dev/prod credentials
  // Set GOOGLE_CLIENT_ID_DEV + GOOGLE_CLIENT_SECRET_DEV for localhost
  // Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET for production
  get googleClientId() {
    if (!IS_PRODUCTION && env.GOOGLE_CLIENT_ID_DEV) {
      return env.GOOGLE_CLIENT_ID_DEV;
    }
    return env.GOOGLE_CLIENT_ID ?? "";
  },

  get googleClientSecret() {
    if (!IS_PRODUCTION && env.GOOGLE_CLIENT_SECRET_DEV) {
      return env.GOOGLE_CLIENT_SECRET_DEV;
    }
    return env.GOOGLE_CLIENT_SECRET ?? "";
  },

  get googleApiKey() {
    return env.GOOGLE_API_KEY ?? "";
  },

  // GitHub OAuth - automatically selects dev/prod credentials
  // Set GITHUB_CLIENT_ID_DEV + GITHUB_CLIENT_SECRET_DEV for localhost
  // Set GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET for production
  get githubClientId() {
    if (!IS_PRODUCTION && env.GITHUB_CLIENT_ID_DEV) {
      return env.GITHUB_CLIENT_ID_DEV;
    }
    return env.GITHUB_CLIENT_ID ?? "";
  },

  get githubClientSecret() {
    if (!IS_PRODUCTION && env.GITHUB_CLIENT_SECRET_DEV) {
      return env.GITHUB_CLIENT_SECRET_DEV;
    }
    return env.GITHUB_CLIENT_SECRET ?? "";
  },

  get resendApiKey() {
    return env.RESEND_API_KEY ?? "";
  },

  get braveApiKey() {
    return env.BRAVE_API_KEY ?? "";
  },

  get openaiApiKey() {
    return env.OPENAI_API_KEY ?? "";
  },

  get emailFrom() {
    return env.EMAIL_FROM;
  },

  get backofficePassword() {
    return env.BACKOFFICE_PASSWORD ?? "";
  },

  get testUserEmail() {
    return env.TEST_USER_EMAIL ?? "";
  },

  get testUserPassword() {
    return env.TEST_USER_PASSWORD ?? "";
  },

  // Superadmin credentials - works in ALL environments (including production)
  get superadminEmail() {
    return env.SUPERADMIN_EMAIL ?? "";
  },

  get superadminPassword() {
    return env.SUPERADMIN_PASSWORD ?? "";
  },
  get envVarEncryptionKey() {
    return env.ENV_VAR_ENCRYPTION_KEY ?? "";
  },
} as const;

/**
 * Redis configuration
 */
export const REDIS_CONFIG = {
  url: RESOLVED_REDIS_URL || "",
  host: PARSED_REDIS_URL?.host || "",
  port: PARSED_REDIS_URL?.port ?? 6379,
  password: PARSED_REDIS_URL?.password || "",
  username: PARSED_REDIS_URL?.username || "default",
  enabled: Boolean(RESOLVED_REDIS_URL),
} as const;

/**
 * Environment-aware key prefix so development, preview, and production
 * never collide even if they accidentally share the same Redis instance.
 */
export const REDIS_KEY_PREFIX =
  RUNTIME_ENVIRONMENT === "production"
    ? "prod:"
    : RUNTIME_ENVIRONMENT === "preview"
      ? "preview:"
      : "dev:";

/**
 * App URLs
 */
export const URLS = {
  get baseUrl() {
    return getAppBaseUrl();
  },

  get googleCallbackUrl() {
    return env.GOOGLE_REDIRECT_URI || `${this.baseUrl}/api/auth/google/callback`;
  },

  get githubCallbackUrl() {
    return env.GITHUB_REDIRECT_URI || `${this.baseUrl}/api/auth/github/callback`;
  },
} as const;

/**
 * OpenClaw (Sajtagenten) gateway
 */
export const OPENCLAW = {
  get gatewayUrl(): string {
    return env.OPENCLAW_GATEWAY_URL?.replace(/\/+$/, "") ?? "";
  },
  get gatewayToken(): string {
    return env.OPENCLAW_GATEWAY_TOKEN ?? "";
  },
  get enabled(): boolean {
    return Boolean(env.OPENCLAW_GATEWAY_URL);
  },
  get tokenConfigured(): boolean {
    return Boolean(env.OPENCLAW_GATEWAY_TOKEN);
  },
  get implementationFlagEnabled(): boolean {
    return isAffirmativeEnvValue(env.IMPLEMENT_UNDERSCORE_CLAW);
  },
  get surfaceEnabled(): boolean {
    return this.enabled && this.tokenConfigured && this.implementationFlagEnabled;
  },
} as const;

/**
 * Feature flags
 */
export const FEATURES = {
  useRedisCache: REDIS_CONFIG.enabled,

  // The four previously dormant flags below were hardcoded ON on 2026-04-22
  // after confirming zero production off-toggles historically. Their env
  // keys (SAJTMASKIN_BUILD_SPEC_ENABLED, …_LIGHTWEIGHT_SCAFFOLD_SERIALIZATION,
  // …_FOLLOWUP_LIGHT_CONTEXT, …_FINALIZE_DEEP_PATH_ENABLED) are no longer
  // read — only callers reference the hardcoded constants now:
  //   - BuildSpec derivation runs unconditionally in build-spec.ts
  //   - Lightweight scaffold serialisation runs unconditionally
  //   - Follow-up light context is driven by policy in chat-message-stream-post
  //   - Finalize defaults to the light fast-path unless forceFull=true

  /**
   * Dossier pipeline (data/dossiers/{hard,soft}/). Deterministic capability-
   * driven selection from `brief.requestedCapabilities`. Reads manifests
   * directly off disk (no embeddings, no master.json). Injects
   * `## Available Dossiers` + `## Selected Dossier Instructions` blocks into
   * the system prompt.
   *
   * On by default in development. Off by default in production (opt-in) until
   * the capability map is verified. See docs/architecture/dossier-system.md.
   */
  useDossierPipeline:
    env.SAJTMASKIN_DOSSIER_PIPELINE === "true" ||
    env.SAJTMASKIN_DOSSIER_PIPELINE === "1" ||
    (env.SAJTMASKIN_DOSSIER_PIPELINE !== "false" &&
      env.NODE_ENV === "development"),
  deferExtraRoutesOnInit:
    env.SAJTMASKIN_DEFER_EXTRA_ROUTES_ON_INIT === "true" ||
    env.SAJTMASKIN_DEFER_EXTRA_ROUTES_ON_INIT === "1",

  /**
   * Repair-loop hardening — propagate `repairPassIndex: 1` whenever a
   * follow-up/repair re-finalises an existing version (`targetVersionId` set)
   * and best-effort prune stale error-log rows when the latest pass is clean.
   *
   * Symptom this guards against (SAJ-25): UI shows red "Fel"-badge on a
   * fully-working preview because previous pass blocking findings stayed in
   * `engine_version_error_logs` after the next pass cleared them.
   *
   * Default ON in development, OFF in production until field-tested for one
   * full week. Toggle: `SAJTMASKIN_CONSISTENT_REPAIR_PASS_INDEX`.
   */
  consistentRepairPassIndex:
    env.SAJTMASKIN_CONSISTENT_REPAIR_PASS_INDEX === "true" ||
    env.SAJTMASKIN_CONSISTENT_REPAIR_PASS_INDEX === "1" ||
    (env.SAJTMASKIN_CONSISTENT_REPAIR_PASS_INDEX !== "false" &&
      env.NODE_ENV === "development"),

  /**
   * After the verifier-fixer LLM rewrites a file, re-run `runVerifierPass`
   * once to confirm the fix actually addressed the blocking finding instead
   * of optimistically clearing the array. Capped at 1 re-run to keep latency
   * bounded.
   *
   * Default ON in development, OFF in production. Toggle:
   * `SAJTMASKIN_VERIFIER_RERUN_AFTER_FIX`.
   */
  verifierRerunAfterFix:
    env.SAJTMASKIN_VERIFIER_RERUN_AFTER_FIX === "true" ||
    env.SAJTMASKIN_VERIFIER_RERUN_AFTER_FIX === "1" ||
    (env.SAJTMASKIN_VERIFIER_RERUN_AFTER_FIX !== "false" &&
      env.NODE_ENV === "development"),

  /**
   * When stream-syntax pass succeeded but merged-syntax fails, run only the
   * mechanical autofix + esbuild revalidation — skip the LLM-fixer pass on
   * merge. Merged-only failures are nearly always import-stigar or comment
   * stripping that the deterministic pipeline lays back deterministically.
   *
   * Default ON everywhere (strict cost reduction, low correctness risk).
   * Toggle: `SAJTMASKIN_SKIP_DOUBLE_VALIDATE_AND_FIX_ON_MERGE`.
   */
  skipDoubleValidateAndFixOnMerge:
    env.SAJTMASKIN_SKIP_DOUBLE_VALIDATE_AND_FIX_ON_MERGE !== "false",

  /**
   * Inject `### Recurring failures on this site` block (top-5 patterns from
   * `readRecurringPatternsForChat`) into the system-prompt during follow-up
   * generations. Capped at 600 chars; falls silently when budget exhausted.
   *
   * Default ON in development, OFF in production until eval baseline confirms
   * no regression. Toggle: `SAJTMASKIN_RECURRING_PATTERNS_IN_MAIN_PROMPT`.
   */
  recurringPatternsInMainPrompt:
    env.SAJTMASKIN_RECURRING_PATTERNS_IN_MAIN_PROMPT === "true" ||
    env.SAJTMASKIN_RECURRING_PATTERNS_IN_MAIN_PROMPT === "1" ||
    (env.SAJTMASKIN_RECURRING_PATTERNS_IN_MAIN_PROMPT !== "false" &&
      env.NODE_ENV === "development"),

  /**
   * Vector RAG over historical error-log rows. When ON, follow-up generation
   * retrieves top-K similar past failures (per scaffoldId/lineageHash prefix)
   * and renders them as `### Lessons from similar past builds` in the system
   * prompt.
   *
   * Index is rebuilt automatically on `npm run dev|build|start` via the
   * next-runner wrapper when the producer NDJSON has grown since last index.
   *
   * Default ON in development (when an embeddings provider is available),
   * OFF in production. Toggle: `SAJTMASKIN_USE_ERROR_LOG_RAG`.
   */
  useErrorLogRag:
    env.SAJTMASKIN_USE_ERROR_LOG_RAG === "true" ||
    env.SAJTMASKIN_USE_ERROR_LOG_RAG === "1" ||
    (env.SAJTMASKIN_USE_ERROR_LOG_RAG !== "false" &&
      env.NODE_ENV === "development"),
  strictGeneratedArtifacts:
    env.NODE_ENV !== "test" &&
    env.SAJTMASKIN_STRICT_GENERATED_ARTIFACTS !== "false",

  useGoogleAuth: Boolean(SECRETS.googleClientId && SECRETS.googleClientSecret),

  useGitHubAuth: Boolean(SECRETS.githubClientId && SECRETS.githubClientSecret),

  useStripePayments: Boolean(SECRETS.stripeSecretKey),

  // NOTE: `usePexels` removed 2026-04-20 (audit §3.7). Had 0 callsites in
  // runtime code — Unsplash is the active stock-image source. To re-enable
  // Pexels: add an integration that reads `SECRETS.pexelsApiKey` directly,
  // and (optionally) re-introduce the `ENABLE_PEXELS` env gate.
  useUnsplash: Boolean(SECRETS.unsplashAccessKey),
  useFigmaApi: Boolean(SECRETS.figmaAccessToken),

  /** Builder prompt “image generations” toggle — own-engine uses OpenAI. */
  useBuilderImageGenerations: Boolean(SECRETS.openaiApiKey),

  useVercelApi: Boolean(SECRETS.vercelApiToken),

  useBraveSearch: Boolean(SECRETS.braveApiKey),

  useResponsesApi:
    Boolean(SECRETS.openaiApiKey) && env.USE_RESPONSES_API !== "false",

  useAuditWebSearch:
    Boolean(SECRETS.openaiApiKey) && env.AUDIT_WEB_SEARCH === "true",

  // Required for asset materialization and shared preview flows
  useVercelBlob: Boolean(env.BLOB_READ_WRITE_TOKEN),
} as const;

/**
 * Follow-up tuning — configurable via env or backoffice.
 * Controls how much context follow-up prompts carry.
 */
export const FOLLOW_UP_TUNING = {
  maxRecentHistoryPairs: clampInt(env.SAJTMASKIN_FOLLOWUP_HISTORY_PAIRS, 1, 20, 4),
  lightContextMaxChars: clampInt(env.SAJTMASKIN_FOLLOWUP_LIGHT_MAX_CHARS, 8_000, 200_000, 32_000),
  lightContextMaxFilesManyFiles: clampInt(env.SAJTMASKIN_FOLLOWUP_LIGHT_FILES_MANY, 1, 12, 4),
  lightContextMaxFilesFewFiles: clampInt(env.SAJTMASKIN_FOLLOWUP_LIGHT_FILES_FEW, 1, 12, 6),
} as const;

function clampInt(raw: string | undefined, min: number, max: number, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
