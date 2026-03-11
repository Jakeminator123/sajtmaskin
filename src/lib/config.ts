/**
 * Centralized configuration for environment-dependent settings.
 * All env vars are validated and sanitized through src/lib/env.ts.
 */

import path from "path";
import { getAppBaseUrl } from "./app-url";
import { getServerEnv } from "./env";

const env = getServerEnv();

export const IS_PRODUCTION = env.NODE_ENV === "production";
export const IS_RENDER = Boolean(env.RENDER);

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

  if (IS_PRODUCTION && !hasWarnedAboutDataDir && !isBuildPhase()) {
    hasWarnedAboutDataDir = true;
    console.error(
      "[Config] ❌ CRITICAL: DATA_DIR not set in production!\n" +
        "  → Uploads and local files will be lost on restart\n" +
        "  → Set DATA_DIR=/var/data and mount persistent disk",
    );
  }

  const localDataDir = path.join(process.cwd(), "data");

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

  get v0ApiKey() {
    return env.V0_API_KEY ?? "";
  },

  get vercelApiToken() {
    return env.VERCEL_TOKEN ?? "";
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
} as const;

type SecretName = Exclude<keyof typeof SECRETS, "prototype">;

/**
 * Check if a secret is configured (without exposing value)
 */
export function isSecretConfigured(secretName: SecretName): boolean {
  const value = SECRETS[secretName];
  return typeof value === "string" && value.length > 0;
}

/**
 * Validate required secrets at startup
 * Returns list of missing secret names
 */
export function validateRequiredSecrets(requiredSecrets: SecretName[]): string[] {
  const missing: string[] = [];
  for (const secret of requiredSecrets) {
    if (!isSecretConfigured(secret)) {
      missing.push(String(secret));
    }
  }
  return missing;
}

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
 * Environment-aware key prefix so dev and prod never collide even if
 * they accidentally share the same Redis instance.
 */
export const REDIS_KEY_PREFIX = IS_PRODUCTION ? "prod:" : "dev:";

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
} as const;

/**
 * AI / v0 configuration
 */
export const AI = {
  get designSystemId(): string | undefined {
    return env.DESIGN_SYSTEM_ID || undefined;
  },
} as const;

/**
 * Feature flags
 */
export const FEATURES = {
  useRedisCache: REDIS_CONFIG.enabled,

  useGoogleAuth: Boolean(SECRETS.googleClientId && SECRETS.googleClientSecret),

  useGitHubAuth: Boolean(SECRETS.githubClientId && SECRETS.githubClientSecret),

  useStripePayments: Boolean(SECRETS.stripeSecretKey),

  // NOTE: Pexels is disabled - set ENABLE_PEXELS=true to re-enable
  usePexels: Boolean(SECRETS.pexelsApiKey) && env.ENABLE_PEXELS === "true",
  useUnsplash: Boolean(SECRETS.unsplashAccessKey),
  useFigmaApi: Boolean(SECRETS.figmaAccessToken),

  useV0Api: Boolean(SECRETS.v0ApiKey),

  useVercelApi: Boolean(SECRETS.vercelApiToken),

  useBraveSearch: Boolean(SECRETS.braveApiKey),

  useResponsesApi:
    Boolean(SECRETS.openaiApiKey) && env.USE_RESPONSES_API !== "false",

  useAuditWebSearch:
    Boolean(SECRETS.openaiApiKey) && env.AUDIT_WEB_SEARCH === "true",

  // CRITICAL for AI-generated images in v0 preview
  useVercelBlob: Boolean(env.BLOB_READ_WRITE_TOKEN),
} as const;

function resolveDbLogLabel(): string {
  const dbEnvCandidates = [
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL_NON_POOLING",
  ] as const;
  for (const key of dbEnvCandidates) {
    if (env[key]) return key;
  }
  return "not-configured";
}

function resolveStorageLogLabel(): string {
  return "postgres";
}

declare global {
  var __configLogged: boolean | undefined;
}

/**
 * Log configuration on startup (call once)
 * Uses globalThis to prevent duplicate logs during hot reload
 * SECURITY: Never log actual secret values!
 */
export function logConfig(): void {
  if (globalThis.__configLogged) return;
  globalThis.__configLogged = true;

  const features = Object.entries(FEATURES)
    .filter(([, v]) => v)
    .map(([k]) =>
      k
        .replace("use", "")
        .replace(/([A-Z])/g, " $1")
        .trim(),
    )
    .join(", ");

  console.info(
    `[Config] ${IS_PRODUCTION ? "PROD" : "DEV"} | Storage: ${resolveStorageLogLabel()} | DB: ${resolveDbLogLabel()} | Features: ${
      features || "none"
    }`,
  );
}

/**
 * Validate required environment variables
 * Call this at app startup to fail fast if critical config is missing
 */
export function validateEnv(): { valid: boolean; missing: string[] } {
  const coreSecrets: SecretName[] = IS_PRODUCTION ? ["jwtSecret", "v0ApiKey"] : [];
  const missing = validateRequiredSecrets(coreSecrets);
  const dbConfigured = resolveDbLogLabel() !== "not-configured";
  if (!dbConfigured) {
    missing.push("POSTGRES_URL");
  }

  if (missing.length > 0 && IS_PRODUCTION) {
    console.error("[Config] CRITICAL: Missing required environment variables:", missing);
  }

  return { valid: missing.length === 0, missing };
}
