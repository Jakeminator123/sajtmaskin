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
  /**
   * Debug-mode gate. When affirmative (OC_DEBUG or OC_DEBUGG), OpenClaw gets
   * privileged debug context (full code + findings + repo-context) and may run
   * the armed bug-hunt autonomy. Hard production safeguard: never active in
   * production unless OC_DEBUG_ALLOW_PROD is also affirmative, so a stray prod
   * env value can't silently arm an autonomous loop.
   */
  get debugEnabled(): boolean {
    const requested =
      isAffirmativeEnvValue(env.OC_DEBUG) || isAffirmativeEnvValue(env.OC_DEBUGG);
    if (!requested) return false;
    if (RUNTIME_ENVIRONMENT === "production" && !isAffirmativeEnvValue(env.OC_DEBUG_ALLOW_PROD)) {
      return false;
    }
    return true;
  },
  /** Read-only GitHub token for the debug repo-context reader (contents:read). */
  get repoReadToken(): string {
    return env.OC_REPO_READ_TOKEN ?? "";
  },
  /** owner/repo slug the debug repo-context reader fetches Sajtmaskin source from. */
  get repoSlug(): string {
    return env.OC_REPO_SLUG ?? "";
  },
  /** Shared secret required (via `x-oc-debug-token`) to trigger the Mode B
   * bug-hunt run route. Distinct from tenant auth: it is the owner gate so a
   * mere logged-in guest on a debug preview can't drive the expensive loop. */
  get debugRunToken(): string {
    return env.OC_DEBUG_RUN_TOKEN ?? "";
  },
} as const;

/**
 * Feature flags
 */
export const FEATURES = {
  useRedisCache: REDIS_CONFIG.enabled,
  // Spår 02: F2 Product Postcheck. Server-side Playwright DOM checks
  // against trusted preview URLs only. Default off while we measure flake
  // rate and runtime cost.
  f2ProductPostcheck: isAffirmativeEnvValue(env.SAJTMASKIN_F2_PRODUCT_POSTCHECK),

  // Grandmaster område 7 / A7-2 (BUG-SWARM N#1): when ON, the cross-file
  // import checker refuses to fabricate a silent null-render stub for a
  // dossier-exposed import. The still-unresolved import then degrades/blocks
  // the version via runProjectSanityChecks (#1 "Unresolved local import")
  // instead of shipping false-green hollow output. Default OFF so master
  // runtime behavior is unchanged; flipping the default is a separate
  // decision once område 5/6 land. See
  // docs/plans/avklarat/grandmaster/aktiviteter/A7-2-refuse-dossier-stubs-flag.md.
  refuseDossierStubs: isAffirmativeEnvValue(env.SAJTMASKIN_REFUSE_DOSSIER_STUBS),

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
   * On by default in runtime environments. Set
   * `SAJTMASKIN_DOSSIER_PIPELINE=false` (or `0`) to opt out explicitly.
   * Tests keep it off by default for deterministic unit-import latency.
   * See docs/contracts/dossier-system.md.
   */
  useDossierPipeline:
    env.NODE_ENV !== "test" &&
    env.SAJTMASKIN_DOSSIER_PIPELINE !== "false" &&
    env.SAJTMASKIN_DOSSIER_PIPELINE !== "0",
  deferExtraRoutesOnInit:
    env.SAJTMASKIN_DEFER_EXTRA_ROUTES_ON_INIT === "true" ||
    env.SAJTMASKIN_DEFER_EXTRA_ROUTES_ON_INIT === "1",

  // Inlined 2026-04-28 (LLM-flow simplification långbänk):
  //   consistentRepairPassIndex      (repair-pass-index propagation + stale-log prune)
  //   verifierRerunAfterFix          (rerun is unconditional, see verifier-phase.ts)
  //   skipDoubleValidateAndFixOnMerge (merge mechanical-only is unconditional)
  //   escalateMergeSyntaxToLlm       (LLM escalation always runs when merge invalid)
  //   previewPreWarm                 (was always disabled, schedule helper removed)
  // None of these had a working OFF-path in production since omtag-04
  // (2026-04-23) — the conditionals were dead code branches.

  /**
   * Inject `### Recurring failures on this site` block (top-5 patterns from
   * `readRecurringPatternsForChat`) into the system-prompt during follow-up
   * generations. Capped at 600 chars; falls silently when budget exhausted.
   * Hardcoded to dev-default (on in development, off in production) after
   * removing the SAJTMASKIN_RECURRING_PATTERNS_IN_MAIN_PROMPT override in
   * omtag-04. Eval-baseline (omtag-02) gates any future change to this
   * branch in prod.
   */
  recurringPatternsInMainPrompt: env.NODE_ENV === "development",
  recurringPatternsInCreatePrompt: false,

  /**
   * TF-IDF error-log RAG over historical error-log rows. When ON, follow-up
   * generation retrieves top-K similar past failures (per scaffoldId/lineageHash
   * prefix) via cosine similarity on term frequencies — not vector
   * embeddings/pgvector — and renders them as `### Lessons from similar past
   * builds` in the system prompt. On (not test): dev uses the local NDJSON
   * producer + on-disk snapshot; prod uses the durable Postgres store
   * (`error_log_events`) — both the producer write and the retriever read are
   * best-effort and no-op when the DB is unconfigured (see
   * `src/lib/logging/error-log-store.ts`). Auto-ingest hooks at
   * `npm run dev|build|start` still run unchanged.
   */
  useErrorLogRag: env.NODE_ENV !== "test",
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
 * Follow-up tuning — hardcoded constants (omtag-04, 2026-04-23).
 * Previously SAJTMASKIN_FOLLOWUP_HISTORY_PAIRS / _LIGHT_MAX_CHARS /
 * _LIGHT_FILES_MANY / _LIGHT_FILES_FEW but never overridden in prod.
 */
export const FOLLOW_UP_TUNING = {
  maxRecentHistoryPairs: 4,
  lightContextMaxChars: 32_000,
  normalContextMaxChars: 72_000,
  lightContextMaxFilesManyFiles: 4,
  lightContextMaxFilesFewFiles: 6,
  normalContextMaxFiles: 6,
} as const;
