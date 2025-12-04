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
function getDataDir(): string {
  // Render persistent disk
  if (process.env.DATA_DIR) {
    return process.env.DATA_DIR;
  }

  // Production without DATA_DIR set - warn and use fallback
  if (IS_PRODUCTION) {
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
 * API Keys and secrets (with validation)
 */
export const SECRETS = {
  get jwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret && IS_PRODUCTION) {
      throw new Error("JWT_SECRET must be set in production");
    }
    return secret || "dev-secret-change-in-production";
  },

  get openaiApiKey() {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error("OPENAI_API_KEY is required");
    }
    return key;
  },

  get v0ApiKey() {
    return process.env.V0_API_KEY;
  },

  get stripeSecretKey() {
    return process.env.STRIPE_SECRET_KEY;
  },

  get stripeWebhookSecret() {
    return process.env.STRIPE_WEBHOOK_SECRET;
  },

  get unsplashAccessKey() {
    return process.env.UNSPLASH_ACCESS_KEY;
  },

  get googleClientId() {
    return process.env.GOOGLE_CLIENT_ID;
  },

  get googleClientSecret() {
    return process.env.GOOGLE_CLIENT_SECRET;
  },
} as const;

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
} as const;

/**
 * Feature flags
 */
export const FEATURES = {
  // Enable Redis caching
  useRedisCache: REDIS_CONFIG.enabled,

  // Enable Google OAuth
  useGoogleAuth: Boolean(SECRETS.googleClientId && SECRETS.googleClientSecret),

  // Enable Stripe payments
  useStripePayments: Boolean(SECRETS.stripeSecretKey),
} as const;

/**
 * Log configuration on startup (call once)
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
    stripe: FEATURES.useStripePayments,
  });
}
