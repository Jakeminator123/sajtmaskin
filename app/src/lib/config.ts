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
 * - Production (Render): /var/data (persistent disk)
 * - Local development: ./data (relative to app root)
 */
// Track if we've already warned about DATA_DIR (avoid spam during build)
let hasWarnedAboutDataDir = false;

function getDataDir(): string {
  // Render persistent disk
  if (process.env.DATA_DIR) {
    return process.env.DATA_DIR;
  }

  // Production without DATA_DIR set - warn once (skip during build/static generation)
  // Only warn at runtime, not during build phase
  const isBuildPhase =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NEXT_PHASE === "phase-export";

  if (IS_PRODUCTION && !IS_RENDER && !hasWarnedAboutDataDir && !isBuildPhase) {
    hasWarnedAboutDataDir = true;
    console.warn(
      "[Config] WARNING: DATA_DIR not set in production. Data may be lost on restart!"
    );
  }

  // Local development: use ./data folder in app directory
  return path.join(process.cwd(), "data");
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

  // Public uploads URL path (for serving files)
  get uploadsPublicPath() {
    // In production with DATA_DIR, files are served from /var/data/uploads
    // In local dev, they're in ./data/uploads
    return "/uploads";
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
    // Don't throw during build - only at runtime when actually used
    if (!secret && IS_PRODUCTION && typeof window === "undefined") {
      console.warn("[Config] JWT_SECRET not set - using dev fallback");
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

  get googleClientId() {
    return process.env.GOOGLE_CLIENT_ID || "";
  },

  get googleClientSecret() {
    return process.env.GOOGLE_CLIENT_SECRET || "";
  },

  get googleApiKey() {
    return process.env.GOOGLE_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
  },

  get githubClientId() {
    return process.env.GITHUB_CLIENT_ID || "";
  },

  get githubClientSecret() {
    return process.env.GITHUB_CLIENT_SECRET || "";
  },

  get elevenLabsApiKey() {
    return process.env.ELEVENLABS_API_KEY || "";
  },

  get elevenLabsVoiceId() {
    return process.env.ELEVENLABS_VOICE_ID || "";
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
  host:
    process.env.REDIS_HOST ||
    "redis-12352.c135.eu-central-1-1.ec2.redns.redis-cloud.com",
  port: parseInt(process.env.REDIS_PORT || "12352"),
  password: process.env.REDIS_PASSWORD || "",
  username: process.env.REDIS_USERNAME || "default",
  enabled: Boolean(process.env.REDIS_HOST || process.env.REDIS_PASSWORD),
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
    return process.env.GITHUB_REDIRECT_URI || `${this.baseUrl}/api/auth/github/callback`;
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
  usePexels: Boolean(SECRETS.pexelsApiKey),
  useUnsplash: Boolean(SECRETS.unsplashAccessKey),

  // Enable v0 API for code generation
  useV0Api: Boolean(SECRETS.v0ApiKey),

  // Enable OpenAI features
  useOpenAI: Boolean(SECRETS.openaiApiKey),

  // Enable ElevenLabs TTS
  useElevenLabs: Boolean(SECRETS.elevenLabsApiKey),
} as const;

/**
 * Log configuration on startup (call once)
 * SECURITY: Never log actual secret values!
 */
export function logConfig(): void {
  console.log(
    "[Config] Environment:",
    IS_PRODUCTION ? "production" : "development"
  );
  console.log("[Config] Running on Render:", IS_RENDER);
  console.log("[Config] Data directory:", PATHS.dataDir);
  console.log("[Config] Database path:", PATHS.database);
  console.log("[Config] Uploads path:", PATHS.uploads);
  console.log("[Config] Features:", {
    redis: FEATURES.useRedisCache,
    googleAuth: FEATURES.useGoogleAuth,
    githubAuth: FEATURES.useGitHubAuth,
    stripe: FEATURES.useStripePayments,
    v0Api: FEATURES.useV0Api,
    openai: FEATURES.useOpenAI,
    pexels: FEATURES.usePexels,
    unsplash: FEATURES.useUnsplash,
    elevenLabs: FEATURES.useElevenLabs,
  });
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
    console.error("[Config] CRITICAL: Missing required environment variables:", missing);
  }

  return { valid: missing.length === 0, missing };
}
