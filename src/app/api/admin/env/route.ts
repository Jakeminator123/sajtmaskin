import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/admin";
import { FEATURES, URLS } from "@/lib/config";
import { checkOpenClawGatewayHealth } from "@/lib/openclaw/status";

type EnvKeyStatus = {
  key: string;
  required: boolean;
  present: boolean;
  notes?: string;
};

type EnvKeyDefinition = Omit<EnvKeyStatus, "present" | "required"> & {
  required: boolean | (() => boolean);
};

function isV0FallbackEnabled(): boolean {
  const raw = process.env.V0_FALLBACK_BUILDER?.trim().toLowerCase() ?? "";
  return raw === "y" || raw === "yes" || raw === "true" || raw === "1";
}

const ENV_KEYS: EnvKeyDefinition[] = [
  { key: "POSTGRES_URL", required: true, notes: "Primär databas (Supabase)" },
  { key: "DB_SSL_REJECT_UNAUTHORIZED", required: false, notes: "DB TLS strictness" },
  {
    key: "V0_API_KEY",
    required: () => isV0FallbackEnabled(),
    notes: "v0 Platform API (required when V0_FALLBACK_BUILDER=y for fallback mode)",
  },
  { key: "V0_STREAMING_ENABLED", required: false, notes: "v0 streaming feature flag" },
  { key: "JWT_SECRET", required: true, notes: "Auth tokens" },
  { key: "CSP_ENFORCE", required: false, notes: "Enable CSP enforce mode" },
  { key: "LOG_PROMPTS", required: false, notes: "Allow prompt logging in production" },
  { key: "INBOUND_WEBHOOK_SHARED_SECRET", required: false, notes: "Webhook auth" },
  { key: "BLOB_READ_WRITE_TOKEN", required: false, notes: "Vercel Blob" },
  { key: "BLOB_CONTENT_KEY", required: false, notes: "Backoffice Blob content key" },
  { key: "BLOB_COLORS_KEY", required: false, notes: "Backoffice Blob colors key" },
  { key: "STORAGE_BACKEND", required: false, notes: "Backoffice storage backend" },
  { key: "BACKOFFICE_SESSION_VERSION", required: false, notes: "Backoffice session revocation" },
  { key: "DATA_DIR", required: false, notes: "Local file fallback directory" },
  { key: "UPSTASH_REDIS_REST_URL", required: false, notes: "Rate limits" },
  { key: "UPSTASH_REDIS_REST_TOKEN", required: false, notes: "Rate limits" },
  { key: "REDIS_URL", required: false, notes: "Redis cache" },
  { key: "KV_URL", required: false, notes: "Redis cache" },
  { key: "OPENCLAW_GATEWAY_URL", required: false, notes: "OpenClaw gateway URL" },
  { key: "OPENCLAW_GATEWAY_TOKEN", required: false, notes: "OpenClaw gateway auth" },
  {
    key: "IMPLEMENT_UNDERSCORE_CLAW",
    required: false,
    notes: "Enables the OpenClaw UI surface when the gateway is configured",
  },
  {
    key: "OPENAI_API_KEY",
    required: () => !isV0FallbackEnabled(),
    notes: "Code generation (default engine), prompt-assist. Required when V0_FALLBACK_BUILDER is not set.",
  },
  {
    key: "SAJTMASKIN_ENGINE_MAX_OUTPUT_TOKENS",
    required: false,
    notes: "Own engine max output token budget for long page/site generations",
  },
  {
    key: "SAJTMASKIN_AUTOFIX_MAX_OUTPUT_TOKENS",
    required: false,
    notes: "Autofix max output token budget",
  },
  {
    key: "SAJTMASKIN_STREAM_SAFETY_TIMEOUT_MS",
    required: false,
    notes: "Client stream safety timeout before aborting stalled generations",
  },
  {
    key: "SAJTMASKIN_ENGINE_ROUTE_MAX_DURATION_SECONDS",
    required: false,
    notes: "Max route duration for build/refine streaming routes",
  },
  {
    key: "SAJTMASKIN_ASSIST_ROUTE_MAX_DURATION_SECONDS",
    required: false,
    notes: "Max route duration for prompt-assist and brief routes",
  },
  { key: "ANTHROPIC_API_KEY", required: false, notes: "Prompt‑assist (Anthropic)" },
  { key: "AI_GATEWAY_API_KEY", required: false, notes: "AI Gateway" },
  { key: "VERCEL_TOKEN", required: false, notes: "Vercel API" },
  { key: "VERCEL_TEAM_ID", required: false, notes: "Vercel team" },
  { key: "VERCEL_PROJECT_ID", required: false, notes: "Vercel project" },
  { key: "STRIPE_SECRET_KEY", required: false, notes: "Stripe payments" },
  { key: "STRIPE_WEBHOOK_SECRET", required: false, notes: "Stripe webhooks" },
  { key: "STRIPE_PRICE_10_CREDITS", required: false, notes: "Stripe Price ID 10 credits" },
  { key: "STRIPE_PRICE_25_CREDITS", required: false, notes: "Stripe Price ID 25 credits" },
  { key: "STRIPE_PRICE_50_CREDITS", required: false, notes: "Stripe Price ID 50 credits" },
  { key: "NEXT_PUBLIC_APP_URL", required: false, notes: "Public app URL" },
  { key: "NEXT_PUBLIC_ADMIN_EMAIL", required: false, notes: "Admin UI email" },
  { key: "GOOGLE_CLIENT_ID", required: false, notes: "Google OAuth" },
  { key: "GOOGLE_CLIENT_SECRET", required: false, notes: "Google OAuth" },
  { key: "GITHUB_CLIENT_ID", required: false, notes: "GitHub OAuth" },
  { key: "GITHUB_CLIENT_SECRET", required: false, notes: "GitHub OAuth" },
  { key: "TEMPLATE_SYNC_GITHUB_TOKEN", required: false, notes: "GitHub workflow dispatch token" },
  { key: "TEMPLATE_SYNC_REPO_OWNER", required: false, notes: "Repo owner for template sync" },
  { key: "TEMPLATE_SYNC_REPO_NAME", required: false, notes: "Repo name for template sync" },
  { key: "TEMPLATE_SYNC_WORKFLOW_FILE", required: false, notes: "Workflow file name (default weekly-template-sync.yml)" },
  { key: "TEMPLATE_SYNC_REF", required: false, notes: "Branch/ref for workflow dispatch" },
  { key: "TEMPLATE_SYNC_INCLUDE_EMBEDDINGS", required: false, notes: "Default include embeddings true/false" },
  { key: "TEMPLATE_EMBEDDINGS_STORAGE", required: false, notes: "Embeddings storage mode: auto/blob/local" },
  { key: "TEMPLATE_EMBEDDINGS_BLOB_KEY", required: false, notes: "Blob path for template embeddings JSON" },
  { key: "TEMPLATE_EMBEDDINGS_AUTO_REBUILD", required: false, notes: "Enable weekly cron rebuild for embeddings" },
  { key: "UNSPLASH_ACCESS_KEY", required: false, notes: "Unsplash" },
  { key: "FIGMA_ACCESS_TOKEN", required: false, notes: "Figma" },
  { key: "RESEND_API_KEY", required: false, notes: "Resend — kontaktformulär, e-postverifiering, återställ lösenord" },
];

function sanitizeEnvValue(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const stripped = trimmed.slice(1, -1).trim();
    return stripped || null;
  }
  return trimmed;
}

function hasEnv(key: string): boolean {
  const raw = sanitizeEnvValue(process.env[key]);
  if (!raw) return false;
  if (/^\$\{[A-Z0-9_]+\}$/.test(raw) || /^\$[A-Z0-9_]+$/.test(raw)) {
    return false;
  }
  return true;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) {
    return admin.response;
  }

  const openclaw = await checkOpenClawGatewayHealth();
  const keys = ENV_KEYS.map((item) => ({
    ...item,
    required: typeof item.required === "function" ? item.required() : item.required,
    present: hasEnv(item.key),
  }));

  return NextResponse.json({
    success: true,
    runtime: {
      nodeEnv: process.env.NODE_ENV || null,
      vercelEnv: process.env.VERCEL_ENV || null,
      vercel: process.env.VERCEL || null,
      appUrl: process.env.NEXT_PUBLIC_APP_URL || null,
      baseUrl: URLS.baseUrl,
      vercelUrl: process.env.VERCEL_URL || null,
    },
    vercel: {
      teamId: process.env.VERCEL_TEAM_ID || null,
      projectId: process.env.VERCEL_PROJECT_ID || null,
    },
    openclaw: {
      ...openclaw,
      healthEndpoint: "/api/openclaw/health",
    },
    features: FEATURES,
    keys,
  });
}
