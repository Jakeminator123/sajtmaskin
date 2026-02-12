import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { TEST_USER_EMAIL } from "@/lib/db/services";
import { FEATURES, URLS } from "@/lib/config";

type EnvKeyStatus = {
  key: string;
  required: boolean;
  present: boolean;
  notes?: string;
};

type EnvKeyDefinition = Omit<EnvKeyStatus, "present">;

const ENV_KEYS: EnvKeyDefinition[] = [
  { key: "POSTGRES_URL", required: true, notes: "Primär databas (Supabase)" },
  { key: "V0_API_KEY", required: true, notes: "v0 generation" },
  { key: "JWT_SECRET", required: true, notes: "Auth tokens" },
  { key: "INBOUND_WEBHOOK_SHARED_SECRET", required: false, notes: "Webhook auth" },
  { key: "BLOB_READ_WRITE_TOKEN", required: false, notes: "Vercel Blob" },
  { key: "UPSTASH_REDIS_REST_URL", required: false, notes: "Rate limits" },
  { key: "UPSTASH_REDIS_REST_TOKEN", required: false, notes: "Rate limits" },
  { key: "REDIS_URL", required: false, notes: "Redis cache" },
  { key: "KV_URL", required: false, notes: "Redis cache" },
  { key: "OPENAI_API_KEY", required: false, notes: "Prompt‑assist (OpenAI)" },
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
  { key: "UNSPLASH_ACCESS_KEY", required: false, notes: "Unsplash" },
  { key: "FIGMA_ACCESS_TOKEN", required: false, notes: "Figma" },
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

async function isAdmin(req: NextRequest): Promise<boolean> {
  const user = await getCurrentUser(req);
  return Boolean(user?.email && user.email === TEST_USER_EMAIL);
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const keys = ENV_KEYS.map((item) => ({
    ...item,
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
    features: FEATURES,
    keys,
  });
}
