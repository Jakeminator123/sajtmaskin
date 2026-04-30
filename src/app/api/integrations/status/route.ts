import { NextResponse } from "next/server";
import { FEATURES, REDIS_CONFIG } from "@/lib/config";
import { DB_ENV_VARS, resolveConfiguredDbEnv } from "@/lib/db/env";

type IntegrationStatus = {
  id: string;
  label: string;
  enabled: boolean;
  required: boolean;
  requiredEnv: string[];
  affects: string;
  notes?: string;
  layer: "platform" | "optional";
};

function getUpstashEnv(): { enabled: boolean; notes?: string } {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) return { enabled: true, notes: "ratelimit: upstash" };
  return { enabled: false, notes: "ratelimit: memory" };
}

function getPostgresEnv(): { enabled: boolean; notes?: string } {
  const resolved = resolveConfiguredDbEnv();
  if (resolved) {
    return { enabled: true, notes: `using: ${resolved.name}` };
  }
  return { enabled: false, notes: "missing" };
}

function isOwnEngineConfigured(): { enabled: boolean; notes?: string } {
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY?.trim());
  if (hasOpenAI) return { enabled: true, notes: "OPENAI_API_KEY present" };
  return { enabled: false, notes: "OPENAI_API_KEY missing" };
}

export async function GET() {
  const upstash = getUpstashEnv();
  const postgres = getPostgresEnv();
  const ownEngine = isOwnEngineConfigured();

  const items: IntegrationStatus[] = [
    {
      id: "own-engine",
      label: "Egen motor (OpenAI)",
      enabled: ownEngine.enabled,
      required: true,
      requiredEnv: ["OPENAI_API_KEY"],
      affects: "Kodgenerering, plan mode, autofix",
      notes: ownEngine.notes,
      layer: "platform",
    },
    {
      id: "postgres",
      label: "Postgres (Sajtmaskin-appens DB)",
      enabled: postgres.enabled,
      required: true,
      requiredEnv: [...DB_ENV_VARS],
      affects:
        "Chattar, versioner, projekt — själva Sajtmaskin-databasen. Supabase funkar om anslutningssträngen ligger i POSTGRES_URL. Det är inte samma sak som slutanvändarens Supabase i en genererad sajt.",
      notes: postgres.notes,
      layer: "platform",
    },
    {
      id: "vercel-api",
      label: "Vercel API",
      enabled: FEATURES.useVercelApi,
      required: false,
      requiredEnv: ["VERCEL_TOKEN"],
      affects: "Deploy + domänköp",
      layer: "platform",
    },
    {
      id: "vercel-blob",
      label: "Vercel Blob",
      enabled: FEATURES.useVercelBlob,
      required: false,
      requiredEnv: ["BLOB_READ_WRITE_TOKEN"],
      affects: "AI-bilder i preview, mediauppladdningar",
      layer: "optional",
    },
    {
      id: "redis",
      label: "Redis cache (redis:// / ioredis)",
      enabled: FEATURES.useRedisCache,
      required: false,
      requiredEnv: ["REDIS_URL", "KV_URL"],
      affects: "Valfri server-side cache via Redis-protokoll.",
      notes: REDIS_CONFIG.enabled
        ? "Cache aktiv (REDIS_URL eller KV_URL)."
        : "Av — vanligt om du bara har Upstash REST nedan. Appen faller tillbaka till minnescache.",
      layer: "optional",
    },
    {
      id: "upstash",
      label: "Upstash REST (rate limits)",
      enabled: upstash.enabled,
      required: false,
      requiredEnv: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
      affects: "Rate limiting m.m. via HTTPS REST — annan kodväg än Redis-raden ovan.",
      notes: upstash.enabled
        ? upstash.notes
        : "Saknas — rate limits failar stängt i production om inte SAJTMASKIN_RATE_LIMIT_ALLOW_MEMORY_IN_PROD är explicit satt.",
      layer: "optional",
    },
    {
      id: "unsplash",
      label: "Unsplash",
      enabled: FEATURES.useUnsplash,
      required: false,
      requiredEnv: ["UNSPLASH_ACCESS_KEY"],
      affects: "Stock-bilder",
      layer: "optional",
    },
    {
      id: "github-oauth",
      label: "GitHub OAuth",
      enabled: FEATURES.useGitHubAuth,
      required: false,
      requiredEnv: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
      affects: "Repo-import",
      layer: "optional",
    },
    {
      id: "google-oauth",
      label: "Google OAuth",
      enabled: FEATURES.useGoogleAuth,
      required: false,
      requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      affects: "Inloggning via Google",
      layer: "optional",
    },
    {
      id: "stripe",
      label: "Stripe (plattform)",
      enabled: FEATURES.useStripePayments,
      required: false,
      requiredEnv: ["STRIPE_SECRET_KEY"],
      affects: "Betalningar för Sajtmaskin-kontot",
      layer: "optional",
    },
  ];

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    items,
  });
}
