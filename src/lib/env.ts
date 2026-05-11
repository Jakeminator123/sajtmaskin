import { z } from "zod";
import { sanitizeEnvString } from "./env-affirmative";

function sanitizeProcessEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    out[key] = sanitizeEnvString(value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Schema – single source of truth for every env var the app reads
// ---------------------------------------------------------------------------

export const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  RENDER: z.string().optional(),
  NEXT_PHASE: z.string().optional(),
  VERCEL: z.string().optional(),
  VERCEL_ENV: z.string().optional(),
  VERCEL_URL: z.string().optional(),

  // Database
  POSTGRES_URL: z.string().optional(),
  POSTGRES_URL_NON_POOLING: z.string().optional(),
  POSTGRES_POOL_MAX: z.string().optional(),
  POSTGRES_POOL_IDLE_TIMEOUT_MS: z.string().optional(),

  // Redis
  REDIS_URL: z.string().optional(),
  KV_URL: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  // Vercel Upstash integration uses these names instead
  KV_REST_API_URL: z.string().optional(),
  KV_REST_API_TOKEN: z.string().optional(),
  SAJTMASKIN_RATE_LIMIT_ALLOW_MEMORY_IN_PROD: z.string().optional(),
  SAJTMASKIN_TRUST_X_FORWARDED_FOR: z.string().optional(),

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
  GITHUB_WORKFLOW_TOKEN: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  TEMPLATE_SYNC_REPO_OWNER: z.string().optional(),
  TEMPLATE_SYNC_REPO_NAME: z.string().optional(),
  TEMPLATE_SYNC_WORKFLOW_FILE: z.string().optional(),
  TEMPLATE_SYNC_REF: z.string().optional(),
  TEMPLATE_SYNC_INCLUDE_EMBEDDINGS: z.string().optional(),

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
  VERCEL_OIDC_TOKEN: z.string().optional(),
  /** Fail fast when required generated template/scaffold artifacts are missing or empty outside test. */
  SAJTMASKIN_STRICT_GENERATED_ARTIFACTS: z.string().optional(),
  /** Fly (or other) preview-host service base URL — tier-2 runtime option. */
  SAJTMASKIN_PREVIEW_HOST_BASE_URL: z.string().optional(),
  /** Bearer token for preview-host HTTP API (`PREVIEW_HOST_API_KEY` on the host); required when preview-host runs outside local dev. */
  SAJTMASKIN_PREVIEW_HOST_API_KEY: z.string().optional(),
  /** Canonical server-side default for own-engine reasoning/thinking when the client omits an explicit toggle. */
  SAJTMASKIN_DEFAULT_THINKING: z.string().optional(),
  AI_BRIEF_MAX_TOKENS: z.string().optional(),
  AI_CHAT_MAX_TOKENS: z.string().optional(),
  SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS: z.string().optional(),
  SAJTMASKIN_AUTOFIX_MAX_OUTPUT_TOKENS: z.string().optional(),
  SAJTMASKIN_LLM_FIXER_TIMEOUT_MS: z.string().optional(),
  SAJTMASKIN_LLM_FIXER_TIMEOUT_RETRY_MS: z.string().optional(),
  SAJTMASKIN_ASSIST_MAX_OUTPUT_TOKENS: z.string().optional(),
  SAJTMASKIN_MAX_PROMPT_LENGTH: z.string().optional(),
  SAJTMASKIN_WARN_PROMPT_LENGTH: z.string().optional(),
  SAJTMASKIN_MAX_PROMPT_HANDOFF_CHARS: z.string().optional(),
  SAJTMASKIN_MAX_AI_BRIEF_PROMPT_CHARS: z.string().optional(),
  SAJTMASKIN_MAX_AI_CHAT_MESSAGE_CHARS: z.string().optional(),
  SAJTMASKIN_MAX_SYSTEM_LENGTH: z.string().optional(),
  SAJTMASKIN_WARN_SYSTEM_LENGTH: z.string().optional(),
  SAJTMASKIN_PHASE_FORCE_CHARS: z.string().optional(),
  SAJTMASKIN_PHASE_FORCE_AUDIT_CHARS: z.string().optional(),
  SAJTMASKIN_SOFT_TARGET_FREEFORM_CHARS: z.string().optional(),
  SAJTMASKIN_SOFT_TARGET_WIZARD_CHARS: z.string().optional(),
  SAJTMASKIN_SOFT_TARGET_AUDIT_CHARS: z.string().optional(),
  SAJTMASKIN_SOFT_TARGET_TEMPLATE_CHARS: z.string().optional(),
  SAJTMASKIN_SOFT_TARGET_FOLLOWUP_CHARS: z.string().optional(),
  SAJTMASKIN_SOFT_TARGET_TECHNICAL_CHARS: z.string().optional(),
  SAJTMASKIN_SOFT_TARGET_APP_CHARS: z.string().optional(),
  SAJTMASKIN_VERIFIER_MAX_OUTPUT_TOKENS: z.string().optional(),
  SAJTMASKIN_VERIFIER_TIMEOUT_MS: z.string().optional(),
  SAJTMASKIN_VERIFIER_SNIPPET_CHARS_PER_FILE: z.string().optional(),
  SAJTMASKIN_STREAM_SAFETY_TIMEOUT_MS: z.string().optional(),
  SAJTMASKIN_ENGINE_ROUTE_MAX_DURATION_SECONDS: z.string().optional(),
  SAJTMASKIN_ASSIST_ROUTE_MAX_DURATION_SECONDS: z.string().optional(),

  // AI – Model overrides per tier (see src/lib/models/catalog.ts, src/lib/gen/defaults.ts)
  SAJTMASKIN_MODEL_FAST: z.string().optional(),
  SAJTMASKIN_MODEL_PRO: z.string().optional(),
  SAJTMASKIN_MODEL_MAX: z.string().optional(),
  SAJTMASKIN_MODEL_CODEX: z.string().optional(),
  SAJTMASKIN_MODEL_ANTHROPIC: z.string().optional(),
  SAJTMASKIN_ASSIST_MODEL: z.string().optional(),
  SAJTMASKIN_POLISH_MODEL: z.string().optional(),
  SAJTMASKIN_VERIFIER_PASS: z.string().optional(),
  SAJTMASKIN_BRIEF_MODEL: z.string().optional(),
  SAJTMASKIN_AUTO_BRIEF_MODEL_OPENAI: z.string().optional(),
  SAJTMASKIN_AUTO_BRIEF_MODEL_ANTHROPIC: z.string().optional(),
  // v0 Design System
  DESIGN_SYSTEM_ID: z.string().optional(),

  // Feature flags
  ENABLE_PEXELS: z.string().optional(),
  USE_RESPONSES_API: z.string().optional(),
  AUDIT_WEB_SEARCH: z.string().optional(),
  /** Dossier system v2: deterministic capability-driven selection from data/dossiers/{hard,soft}/ injected into prompt. Default is on unless explicitly set to false/0. See docs/architecture/dossier-system.md. */
  SAJTMASKIN_DOSSIER_PIPELINE: z.string().optional(),
  /** When true/1, init generations may plan multiple routes but only fully realize the primary route while extras become lightweight shells. */
  SAJTMASKIN_DEFER_EXTRA_ROUTES_ON_INIT: z.string().optional(),
  /** F2 Product Postcheck: server-side Playwright DOM checks for preview URLs. Default off. */
  SAJTMASKIN_F2_PRODUCT_POSTCHECK: z.string().optional(),
  SAJTMASKIN_PRE_VM_TYPECHECK: z.string().optional(),
  SAJTMASKIN_PRE_VM_TYPECHECK_CACHE_ROOT: z.string().optional(),
  SAJTMASKIN_BLOCKING_ESLINT: z.string().optional(),
  SAJTMASKIN_BLOCKING_ESLINT_MAX_WARNINGS: z.string().optional(),
  SAJTMASKIN_AUTO_REPAIR_BUILD_ERROR: z.string().optional(),
  /** Static visual-QA heuristic on exportable files (no screenshot). Optional, default off. Read via `isVisualQAEnabled` in `src/lib/gen/verify/visual-qa.ts`. */
  SAJTMASKIN_VISUAL_QA: z.string().optional(),
  SAJTMASKIN_SCAFFOLD_KEYWORD_MATCH: z.string().optional(),
  SAJTMASKIN_SCAFFOLD_EMBED_VS_KEYWORD_BIAS: z.string().optional(),
  SAJTMASKIN_SCAFFOLD_SEO_SITE_URL: z.string().optional(),
  SAJTMASKIN_METRICS_TOKEN: z.string().optional(),
  SAJTMASKIN_DISABLE_SERVER_AUTO_BRIEF: z.string().optional(),
  SAJTMASKIN_STRICT_SYSTEM_PROMPT_ASSERT: z.string().optional(),
  SAJTMASKIN_SANITY_ALLOW_UNRESOLVED_IMPORT_WARNINGS: z.string().optional(),
  SAJTMASKIN_EVAL_RETENTION_PROMPT_DIRS: z.string().optional(),
  IMPLEMENT_UNDERSCORE_CLAW: z.string().optional(),
  NEXT_PUBLIC_BETA_BANNER: z.string().optional(),
  LOG_PROMPTS: z.string().optional(),
  CSP_ENFORCE: z.string().optional(),
  DB_SSL_REJECT_UNAUTHORIZED: z.string().optional(),
  AUTH_DEBUG: z.string().optional(),
  DEBUG: z.string().optional(),
  SAJTMASKIN_DEV_LOG: z.string().optional(),
  GENERATIONSLOGG: z.string().optional(),
  SAJTMASKIN_PROMPT_DUMP: z.string().optional(),
  SAJTMASKIN_SHIM_PREVIEW_DISABLED: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  SAJTMASKIN_BUILDER_INSPECTOR: z.string().optional(),

  // Inspector / capture worker
  INSPECTOR_CAPTURE_WORKER_URL: z.string().optional(),
  INSPECTOR_CAPTURE_WORKER_TOKEN: z.string().optional(),
  INSPECTOR_FORCE_WORKER_ONLY: z.string().optional(),
  INSPECTOR_CAPTURE_WORKER_TIMEOUT_MS: z.string().optional(),

  // Registry / remote component source (auth token for private registries)
  REGISTRY_AUTH_TOKEN: z.string().optional(),

  // Public (validated server-side; client sees them via Next.js inlining)
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  NEXT_PUBLIC_BASE_URL: z.string().optional(),
  NEXT_PUBLIC_ADMIN_EMAIL: z.string().optional(),
  NEXT_PUBLIC_ADMIN_EMAILS: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_AVATAR_AGENT_ID: z.string().optional(),
  NEXT_PUBLIC_AVATAR_CLIENT_KEY: z.string().optional(),
  NEXT_PUBLIC_REGISTRY_BASE_URL: z.string().optional(),
  NEXT_PUBLIC_REGISTRY_STYLE: z.string().optional(),
  NEXT_PUBLIC_SAJTMASKIN_BUILDER_INSPECTOR: z.string().optional(),
  NEXT_PUBLIC_AUTOFIX_MAX_PER_REASON: z.string().optional(),
  NEXT_PUBLIC_AUTOFIX_MAX_PER_CHAT: z.string().optional(),
  NEXT_PUBLIC_AUTOFIX_DEDUPE_TTL_MS: z.string().optional(),
  /** Comma-separated hostname suffixes for tier-2 preview URLs (e.g. `.fly.dev`) — iframe live detection. */
  NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES: z.string().optional(),
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

/**
 * Test-only: reset the cached parsed env so `vi.stubEnv()` changes take
 * effect on the next `getServerEnv()` call. Production code must never
 * call this — it is a deliberate escape hatch for unit tests that mutate
 * `process.env` after the singleton has already been computed.
 */
export function resetServerEnvCacheForTests(): void {
  _cached = null;
}

