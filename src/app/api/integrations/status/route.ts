import { NextResponse } from "next/server";
import { FEATURES, REDIS_CONFIG } from "@/lib/config";

type IntegrationStatus = {
  id: string;
  label: string;
  enabled: boolean;
  required: boolean;
  requiredEnv: string[];
  affects: string;
  notes?: string;
};

function isGatewayConfigured(): { enabled: boolean; notes?: string } {
  const hasApiKey = Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
  const hasOidc = Boolean(process.env.VERCEL_OIDC_TOKEN?.trim());
  const onVercel = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
  if (hasApiKey) return { enabled: true, notes: "auth: api-key" };
  if (hasOidc) return { enabled: true, notes: "auth: oidc" };
  if (onVercel) return { enabled: true, notes: "auth: vercel" };
  return { enabled: false, notes: "auth missing" };
}

function isV0ModelApiConfigured(): boolean {
  return Boolean(process.env.V0_API_KEY?.trim());
}

function getUpstashEnv(): { enabled: boolean; notes?: string } {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return { enabled: true, notes: "ratelimit: upstash" };
  return { enabled: false, notes: "ratelimit: memory" };
}

const DB_ENV_VARS = [
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL",
] as const;

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

function resolveDbEnv(): { name: string; value: string } | null {
  for (const name of DB_ENV_VARS) {
    const raw = sanitizeEnvValue(process.env[name]);
    if (!raw) continue;
    if (/^\$\{[A-Z0-9_]+\}$/.test(raw) || /^\$[A-Z0-9_]+$/.test(raw)) {
      continue;
    }
    return { name, value: raw };
  }
  return null;
}

function getPostgresEnv(): { enabled: boolean; notes?: string } {
  const resolved = resolveDbEnv();
  if (resolved) {
    return { enabled: true, notes: `using: ${resolved.name}` };
  }
  return { enabled: false, notes: "missing" };
}

export async function GET() {
  const gateway = isGatewayConfigured();
  const upstash = getUpstashEnv();
  const postgres = getPostgresEnv();
  const items: IntegrationStatus[] = [
    {
      id: "v0-platform",
      label: "v0 Platform API",
      enabled: FEATURES.useV0Api,
      required: true,
      requiredEnv: ["V0_API_KEY"],
      affects: "Kodgenerering + preview",
    },
    {
      id: "postgres",
      label: "Postgres (DB)",
      enabled: postgres.enabled,
      required: true,
      requiredEnv: [...DB_ENV_VARS],
      affects: "Projekt, chat‑loggar, versionshistorik",
      notes: postgres.notes,
    },
    {
      id: "ai-gateway",
      label: "AI Gateway",
      enabled: gateway.enabled,
      required: false,
      requiredEnv: ["AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"],
      affects: "Prompt‑assist + AI‑anrop via gateway",
      notes: gateway.notes,
    },
    {
      id: "v0-model",
      label: "v0 Model API (openai-compat)",
      enabled: isV0ModelApiConfigured(),
      required: false,
      requiredEnv: ["V0_API_KEY"],
      affects: "Prompt‑assist via v0‑1.5‑md/lg",
    },
    {
      id: "vercel-api",
      label: "Vercel API",
      enabled: FEATURES.useVercelApi,
      required: false,
      requiredEnv: ["VERCEL_TOKEN"],
      affects: "Deploy + domänköp",
    },
    {
      id: "vercel-blob",
      label: "Vercel Blob",
      enabled: FEATURES.useVercelBlob,
      required: false,
      requiredEnv: ["BLOB_READ_WRITE_TOKEN"],
      affects: "AI‑bilder i preview",
    },
    {
      id: "redis",
      label: "Redis cache",
      enabled: FEATURES.useRedisCache,
      required: false,
      requiredEnv: ["REDIS_URL", "KV_URL"],
      affects: "Caching (optional)",
      notes: REDIS_CONFIG.enabled ? "redis cache on" : "redis cache off",
    },
    {
      id: "upstash",
      label: "Upstash (rate limits)",
      enabled: upstash.enabled,
      required: false,
      requiredEnv: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
      affects: "Rate limits (multi‑server)",
      notes: upstash.notes,
    },
    {
      id: "github-oauth",
      label: "GitHub OAuth",
      enabled: FEATURES.useGitHubAuth,
      required: false,
      requiredEnv: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
      affects: "Private repo‑import",
    },
    {
      id: "google-oauth",
      label: "Google OAuth",
      enabled: FEATURES.useGoogleAuth,
      required: false,
      requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      affects: "Inloggning via Google",
    },
    {
      id: "stripe",
      label: "Stripe",
      enabled: FEATURES.useStripePayments,
      required: false,
      requiredEnv: ["STRIPE_SECRET_KEY"],
      affects: "Betalningar",
    },
    {
      id: "unsplash",
      label: "Unsplash",
      enabled: FEATURES.useUnsplash,
      required: false,
      requiredEnv: ["UNSPLASH_ACCESS_KEY"],
      affects: "Stock‑bilder",
    },
  ];

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    items,
  });
}
