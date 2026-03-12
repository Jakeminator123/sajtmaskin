import { z } from "zod";

/**
 * Strip surrounding quotes and whitespace that some deploy platforms
 * (Render, CI) inject into env values, e.g. `"sk-..."`.
 */
function sanitize(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let t = value.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }
  return t || undefined;
}

function sanitizeProcessEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    out[key] = sanitize(value);
  }
  return out;
}

const AFFIRMATIVE_ENV_VALUES = new Set(["1", "true", "yes", "y", "on"]);

export function isAffirmativeEnvValue(value: string | undefined): boolean {
  const normalized = sanitize(value)?.toLowerCase();
  return normalized ? AFFIRMATIVE_ENV_VALUES.has(normalized) : false;
}

// ---------------------------------------------------------------------------
// Schema – single source of truth for every env var the app reads
// ---------------------------------------------------------------------------

export const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  RENDER: z.string().optional(),
  NEXT_PHASE: z.string().optional(),
  VERCEL: z.string().optional(),
  VERCEL_ENV: z.string().optional(),
  VERCEL_URL: z.string().optional(),

  // Database
  POSTGRES_URL: z.string().optional(),
  POSTGRES_PRISMA_URL: z.string().optional(),
  POSTGRES_URL_NON_POOLING: z.string().optional(),

  // Redis
  REDIS_URL: z.string().optional(),
  KV_URL: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  // Vercel Upstash integration uses these names instead
  KV_REST_API_URL: z.string().optional(),
  KV_REST_API_TOKEN: z.string().optional(),

  // Storage
  DATA_DIR: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  BLOB_CONTENT_KEY: z.string().optional(),
  BLOB_COLORS_KEY: z.string().optional(),
  STORAGE_BACKEND: z.enum(["fs", "json-blob"]).optional(),

  // Auth
  JWT_SECRET: z.string().optional(),
  INBOUND_WEBHOOK_SHARED_SECRET: z.string().optional(),

  // API keys
  V0_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  VERCEL_TOKEN: z.string().optional(),
  VERCEL_TEAM_ID: z.string().optional(),
  VERCEL_PROJECT_ID: z.string().optional(),
  VERCEL_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_10_CREDITS: z.string().optional(),
  STRIPE_PRICE_25_CREDITS: z.string().optional(),
  STRIPE_PRICE_50_CREDITS: z.string().optional(),
  UNSPLASH_ACCESS_KEY: z.string().optional(),
  PEXELS_API_KEY: z.string().optional(),
  FIGMA_ACCESS_TOKEN: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  BRAVE_API_KEY: z.string().optional(),
  LOOPIA_API_USER: z.string().optional(),
  LOOPIA_API_PASSWORD: z.string().optional(),

  // OAuth – Google
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID_DEV: z.string().optional(),
  GOOGLE_CLIENT_SECRET_DEV: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),

  // OAuth – GitHub
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID_DEV: z.string().optional(),
  GITHUB_CLIENT_SECRET_DEV: z.string().optional(),
  GITHUB_REDIRECT_URI: z.string().optional(),

  // Email
  EMAIL_FROM: z.string().default("Sajtmaskin <noreply@sajtmaskin.se>"),

  // Admin
  BACKOFFICE_PASSWORD: z.string().optional(),
  BACKOFFICE_SESSION_VERSION: z.string().optional(),
  ADMIN_EMAILS: z.string().optional(),
  ADMIN_CREDENTIALS: z.string().optional(),
  SUPERADMIN_EMAIL: z.string().optional(),
  SUPERADMIN_PASSWORD: z.string().optional(),
  SUPERADMIN_DIAMONDS: z.string().optional(),
  ENV_VAR_ENCRYPTION_KEY: z.string().optional(),
  TEMPLATE_SYNC_GITHUB_TOKEN: z.string().optional(),
  TEMPLATE_SYNC_REPO_OWNER: z.string().optional(),
  TEMPLATE_SYNC_REPO_NAME: z.string().optional(),
  TEMPLATE_SYNC_WORKFLOW_FILE: z.string().optional(),
  TEMPLATE_SYNC_REF: z.string().optional(),
  TEMPLATE_SYNC_INCLUDE_EMBEDDINGS: z.string().optional(),
  TEMPLATE_EMBEDDINGS_STORAGE: z.string().optional(),
  TEMPLATE_EMBEDDINGS_BLOB_KEY: z.string().optional(),
  TEMPLATE_EMBEDDINGS_AUTO_REBUILD: z.string().optional(),

  // Test
  TEST_USER_EMAIL: z.string().optional(),
  TEST_USER_PASSWORD: z.string().optional(),
  LEGACY_EMAIL_AUTO_VERIFY_BEFORE: z.string().optional(),
  KOSTNADSFRI_API_KEY: z.string().optional(),
  KOSTNADSFRI_PASSWORD_SEED: z.string().optional(),

  // OpenClaw (Sajtagenten)
  OPENCLAW_GATEWAY_URL: z.string().optional(),
  OPENCLAW_GATEWAY_TOKEN: z.string().optional(),

  // AI – Direct OpenAI (Responses API)
  OPENAI_API_KEY: z.string().optional(),
  AI_GATEWAY_API_KEY: z.string().optional(),
  VERCEL_OIDC_TOKEN: z.string().optional(),
  AI_BRIEF_MAX_TOKENS: z.string().optional(),
  AI_CHAT_MAX_TOKENS: z.string().optional(),
  SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS: z.string().optional(),
  SAJTMASKIN_AUTOFIX_MAX_OUTPUT_TOKENS: z.string().optional(),
  SAJTMASKIN_STREAM_SAFETY_TIMEOUT_MS: z.string().optional(),
  SAJTMASKIN_ENGINE_ROUTE_MAX_DURATION_SECONDS: z.string().optional(),
  SAJTMASKIN_ASSIST_ROUTE_MAX_DURATION_SECONDS: z.string().optional(),

  // v0 Design System
  DESIGN_SYSTEM_ID: z.string().optional(),

  // Feature flags
  ENABLE_PEXELS: z.string().optional(),
  USE_RESPONSES_API: z.string().optional(),
  AUDIT_WEB_SEARCH: z.string().optional(),
  V0_STREAMING_ENABLED: z.string().optional(),
  V0_FALLBACK_BUILDER: z.string().optional(),
  IMPLEMENT_UNDERSCORE_CLAW: z.string().optional(),
  NEXT_PUBLIC_BETA_BANNER: z.string().optional(),
  LOG_PROMPTS: z.string().optional(),
  CSP_ENFORCE: z.string().optional(),
  DB_SSL_REJECT_UNAUTHORIZED: z.string().optional(),
  AUTH_DEBUG: z.string().optional(),
  DEBUG: z.string().optional(),
  SAJTMASKIN_DEV_LOG: z.string().optional(),
  SAJTMASKIN_DEV_LOG_DOC_MAX_WORDS: z.string().optional(),
  CRON_SECRET: z.string().optional(),

  // Inspector / capture worker
  INSPECTOR_CAPTURE_WORKER_URL: z.string().optional(),
  INSPECTOR_CAPTURE_WORKER_TOKEN: z.string().optional(),
  INSPECTOR_FORCE_WORKER_ONLY: z.string().optional(),
  INSPECTOR_CAPTURE_WORKER_TIMEOUT_MS: z.string().optional(),

  // Registry / remote component source
  REGISTRY_BASE_URL: z.string().optional(),
  REGISTRY_AUTH_TOKEN: z.string().optional(),

  // Public (validated server-side; client sees them via Next.js inlining)
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  NEXT_PUBLIC_BASE_URL: z.string().optional(),
  NEXT_PUBLIC_ADMIN_EMAIL: z.string().optional(),
  NEXT_PUBLIC_ADMIN_EMAILS: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_REGISTRY_BASE_URL: z.string().optional(),
  NEXT_PUBLIC_REGISTRY_STYLE: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

// ---------------------------------------------------------------------------
// Lazy-validated singleton
// ---------------------------------------------------------------------------

let _cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (_cached) return _cached;

  const result = serverSchema.safeParse(sanitizeProcessEnv());

  if (!result.success) {
    const phase = process.env.NEXT_PHASE;
    if (phase === "phase-production-build" || phase === "phase-export") {
      _cached = serverSchema.parse({});
      return _cached;
    }
    console.error("[env] ❌ Validation failed:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    throw new Error("Invalid server environment variables");
  }

  _cached = result.data;
  return _cached;
}
