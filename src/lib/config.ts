/**
 * Centralized configuration for environment-dependent settings
 * Handles paths, database, uploads consistently across local dev and production
 */

import path from "path";

// Detect environment
export const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const IS_RENDER = Boolean(process.env.RENDER);

/**
 * Data directory configuration
 * - Production (Render): /var/data (persistent disk) - MUST be set via DATA_DIR env var
 * - Local development: ./data (relative to app root)
 *
 * RENDER SETUP:
 * 1. Add persistent disk mounted at /var/data
 * 2. Set DATA_DIR=/var/data in environment variables
 * 3. Set root directory to "app" in Render settings
 */
// Track if we've already warned about DATA_DIR (avoid spam during build)
let hasWarnedAboutDataDir = false;

function getDataDir(): string {
  // Render persistent disk (absolute path)
  if (process.env.DATA_DIR) {
    // Ensure it's an absolute path on production
    const dataDir = process.env.DATA_DIR;
    if (IS_PRODUCTION && !path.isAbsolute(dataDir)) {
      console.warn(
        `[Config] WARNING: DATA_DIR should be absolute in production. Got: ${dataDir}`
      );
    }
    return dataDir;
  }

  // Production without DATA_DIR set - warn once (skip during build/static generation)
  const isBuildPhase =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NEXT_PHASE === "phase-export";

  if (IS_PRODUCTION && !hasWarnedAboutDataDir && !isBuildPhase) {
    hasWarnedAboutDataDir = true;
    console.error(
      "[Config] ❌ CRITICAL: DATA_DIR not set in production!\n" +
        "  → Database and uploads will be lost on restart\n" +
        "  → Set DATA_DIR=/var/data and mount persistent disk"
    );
  }

  // Local development: use ./data folder in app directory
  // process.cwd() should be the app/ folder where package.json is
  const localDataDir = path.join(process.cwd(), "data");

  // Debug: Log resolved path on first access (dev only)
  if (!IS_PRODUCTION && !hasWarnedAboutDataDir) {
    hasWarnedAboutDataDir = true;
    console.log(`[Config] Using local data directory: ${localDataDir}`);
  }

  return localDataDir;
}

/**
 * All paths configuration
 */
export const PATHS = {
  // Base data directory
  get dataDir() {
    return getDataDir();
  },

  // SQLite database file
  get database() {
    return path.join(getDataDir(), "sajtmaskin.db");
  },

  // Uploads directory for user images
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
export const SECRETS = {
  get jwtSecret() {
    const secret = process.env.JWT_SECRET;
    // In production, JWT_SECRET is required - throw error if missing
    const isBuildPhase =
      process.env.NEXT_PHASE === "phase-production-build" ||
      process.env.NEXT_PHASE === "phase-export";
    if (
      !secret &&
      IS_PRODUCTION &&
      typeof window === "undefined" &&
      !isBuildPhase
    ) {
      throw new Error("JWT_SECRET is required in production");
    }
    return secret || "dev-secret-change-in-production";
  },

  get openaiApiKey() {
    const key = process.env.OPENAI_API_KEY;
    if (!key && IS_PRODUCTION) {
      console.error("[Config] OPENAI_API_KEY is required");
    }
    return key || "";
  },

  get v0ApiKey() {
    return process.env.V0_API_KEY || "";
  },

  get vercelApiToken() {
    return process.env.VERCEL_API_TOKEN || "";
  },

  get stripeSecretKey() {
    return process.env.STRIPE_SECRET_KEY || "";
  },

  get stripeWebhookSecret() {
    return process.env.STRIPE_WEBHOOK_SECRET || "";
  },

  get unsplashAccessKey() {
    return process.env.UNSPLASH_ACCESS_KEY || "";
  },

  get pexelsApiKey() {
    return process.env.PEXELS_API_KEY || "";
  },

  // Google OAuth - automatically selects dev/prod credentials
  // Set GOOGLE_CLIENT_ID_DEV + GOOGLE_CLIENT_SECRET_DEV for localhost
  // Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET for production
  get googleClientId() {
    // In development, prefer _DEV variants if available
    if (!IS_PRODUCTION && process.env.GOOGLE_CLIENT_ID_DEV) {
      return process.env.GOOGLE_CLIENT_ID_DEV;
    }
    return process.env.GOOGLE_CLIENT_ID || "";
  },

  get googleClientSecret() {
    // In development, prefer _DEV variants if available
    if (!IS_PRODUCTION && process.env.GOOGLE_CLIENT_SECRET_DEV) {
      return process.env.GOOGLE_CLIENT_SECRET_DEV;
    }
    return process.env.GOOGLE_CLIENT_SECRET || "";
  },

  get googleApiKey() {
    return process.env.GOOGLE_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
  },

  // GitHub OAuth - automatically selects dev/prod credentials
  // Set GITHUB_CLIENT_ID_DEV + GITHUB_CLIENT_SECRET_DEV for localhost
  // Set GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET for production
  get githubClientId() {
    if (!IS_PRODUCTION && process.env.GITHUB_CLIENT_ID_DEV) {
      return process.env.GITHUB_CLIENT_ID_DEV;
    }
    return process.env.GITHUB_CLIENT_ID || "";
  },

  get githubClientSecret() {
    if (!IS_PRODUCTION && process.env.GITHUB_CLIENT_SECRET_DEV) {
      return process.env.GITHUB_CLIENT_SECRET_DEV;
    }
    return process.env.GITHUB_CLIENT_SECRET || "";
  },

  get elevenLabsApiKey() {
    return process.env.ELEVENLABS_API_KEY || "";
  },

  get elevenLabsVoiceId() {
    return process.env.ELEVENLABS_VOICE_ID || "";
  },

  // Admin/Backoffice authentication
  get backofficePassword() {
    return process.env.BACKOFFICE_PASSWORD || "";
  },

  get testUserEmail() {
    return process.env.TEST_USER_EMAIL || "";
  },

  get testUserPassword() {
    return process.env.TEST_USER_PASSWORD || "";
  },

  // Superadmin credentials - works in ALL environments (including production)
  // Use for unlimited diamonds and admin access
  get superadminEmail() {
    return process.env.SUPERADMIN_EMAIL || "";
  },

  get superadminPassword() {
    return process.env.SUPERADMIN_PASSWORD || "";
  },
} as const;

// Type for secret names (excluding functions)
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
export function validateRequiredSecrets(
  requiredSecrets: SecretName[]
): string[] {
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
  host: process.env.REDIS_HOST || "",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD || "",
  username: process.env.REDIS_USERNAME || "default",
  // Redis is only enabled if both host and password are configured
  enabled: Boolean(process.env.REDIS_HOST && process.env.REDIS_PASSWORD),
} as const;

/**
 * App URLs
 */
export const URLS = {
  get baseUrl() {
    return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  },

  get googleCallbackUrl() {
    return `${this.baseUrl}/api/auth/google/callback`;
  },

  get githubCallbackUrl() {
    return (
      process.env.GITHUB_REDIRECT_URI ||
      `${this.baseUrl}/api/auth/github/callback`
    );
  },
} as const;

/**
 * Feature flags
 */
export const FEATURES = {
  // Enable Redis caching
  useRedisCache: REDIS_CONFIG.enabled,

  // Enable Google OAuth
  useGoogleAuth: Boolean(SECRETS.googleClientId && SECRETS.googleClientSecret),

  // Enable GitHub OAuth
  useGitHubAuth: Boolean(SECRETS.githubClientId && SECRETS.githubClientSecret),

  // Enable Stripe payments
  useStripePayments: Boolean(SECRETS.stripeSecretKey),

  // Enable image APIs
  // NOTE: Pexels is disabled - set ENABLE_PEXELS=true to re-enable
  // Reason: Focusing on Unsplash only for now (simpler, works well with v0)
  usePexels:
    Boolean(SECRETS.pexelsApiKey) && process.env.ENABLE_PEXELS === "true",
  useUnsplash: Boolean(SECRETS.unsplashAccessKey),

  // Enable v0 API for code generation
  useV0Api: Boolean(SECRETS.v0ApiKey),

  // Enable OpenAI features
  useOpenAI: Boolean(SECRETS.openaiApiKey),

  // Enable ElevenLabs TTS
  useElevenLabs: Boolean(SECRETS.elevenLabsApiKey),

  // Enable Vercel REST API integration
  useVercelApi: Boolean(SECRETS.vercelApiToken),

  // Enable Vercel Blob storage (CRITICAL for AI-generated images in v0 preview!)
  // Without this, AI images will NOT appear in v0's demoUrl preview
  useVercelBlob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
} as const;

// Use globalThis to persist across hot reloads in dev mode
declare global {
  var __configLogged: boolean | undefined;
}

/**
 * Log configuration on startup (call once)
 * Uses globalThis to prevent duplicate logs during hot reload
 * SECURITY: Never log actual secret values!
 */
export function logConfig(): void {
  // Skip if already logged in this Node.js process
  if (globalThis.__configLogged) {
    return;
  }
  globalThis.__configLogged = true;

  // Compact single-line log for cleaner output
  const features = Object.entries(FEATURES)
    .filter(([, v]) => v)
    .map(([k]) =>
      k
        .replace("use", "")
        .replace(/([A-Z])/g, " $1")
        .trim()
    )
    .join(", ");

  console.log(
    `[Config] ${IS_PRODUCTION ? "PROD" : "DEV"} | DB: ${
      PATHS.database
    } | Features: ${features || "none"}`
  );
}

/**
 * Validate required environment variables
 * Call this at app startup to fail fast if critical config is missing
 */
export function validateEnv(): { valid: boolean; missing: string[] } {
  // Core required secrets for production
  const coreSecrets: SecretName[] = IS_PRODUCTION
    ? ["jwtSecret", "openaiApiKey", "v0ApiKey"]
    : [];

  const missing = validateRequiredSecrets(coreSecrets);

  if (missing.length > 0 && IS_PRODUCTION) {
    console.error(
      "[Config] CRITICAL: Missing required environment variables:",
      missing
    );
  }

  return { valid: missing.length === 0, missing };
}
