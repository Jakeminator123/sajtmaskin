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

// ---------------------------------------------------------------------------
// Schema – single source of truth for every env var the app reads
// ---------------------------------------------------------------------------

export const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  RENDER: z.string().optional(),
  NEXT_PHASE: z.string().optional(),

  // Database
  POSTGRES_URL: z.string().optional(),
  POSTGRES_PRISMA_URL: z.string().optional(),
  POSTGRES_URL_NON_POOLING: z.string().optional(),

  // Redis
  REDIS_URL: z.string().optional(),
  KV_URL: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Storage
  DATA_DIR: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  BLOB_CONTENT_KEY: z.string().optional(),
  BLOB_COLORS_KEY: z.string().optional(),
  STORAGE_BACKEND: z.enum(["fs", "json-blob"]).optional(),

  // Auth
  JWT_SECRET: z.string().optional(),

  // API keys
  V0_API_KEY: z.string().optional(),
  VERCEL_TOKEN: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  UNSPLASH_ACCESS_KEY: z.string().optional(),
  PEXELS_API_KEY: z.string().optional(),
  FIGMA_ACCESS_TOKEN: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  BRAVE_API_KEY: z.string().optional(),

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
  SUPERADMIN_EMAIL: z.string().optional(),
  SUPERADMIN_PASSWORD: z.string().optional(),
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

  // OpenClaw (Sajtagenten)
  OPENCLAW_GATEWAY_URL: z.string().optional(),
  OPENCLAW_GATEWAY_TOKEN: z.string().optional(),

  // AI – Direct OpenAI (Responses API)
  OPENAI_API_KEY: z.string().optional(),
  AI_GATEWAY_API_KEY: z.string().optional(),
  VERCEL_OIDC_TOKEN: z.string().optional(),

  // v0 Design System
  DESIGN_SYSTEM_ID: z.string().optional(),

  // MCP integration (generated code access)
  MCP_GENERATED_CODE_API_KEY: z.string().optional(),

  // Feature flags
  ENABLE_PEXELS: z.string().optional(),
  USE_RESPONSES_API: z.string().optional(),
  AUDIT_WEB_SEARCH: z.string().optional(),
  V0_STREAMING_ENABLED: z.string().optional(),
  V0_FALLBACK_BUILDER: z.string().optional(),
  LOG_PROMPTS: z.string().optional(),
  CSP_ENFORCE: z.string().optional(),
  DB_SSL_REJECT_UNAUTHORIZED: z.string().optional(),

  // Public (validated server-side; client sees them via Next.js inlining)
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
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
