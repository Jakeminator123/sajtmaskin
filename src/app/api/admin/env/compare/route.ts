import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { SECRETS } from "@/lib/config";
import { serverSchema } from "@/lib/env";
import {
  listEnvironmentVariables,
  isVercelConfigured,
} from "@/lib/vercel/vercel-client";

const EXTRA_KNOWN_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "AI_GATEWAY_API_KEY",
  "VERCEL_TEAM_ID",
  "VERCEL_PROJECT_ID",
  "INBOUND_WEBHOOK_SHARED_SECRET",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "DB_SSL_REJECT_UNAUTHORIZED",
  "V0_STREAMING_ENABLED",
  "LOG_PROMPTS",
  "CSP_ENFORCE",
  "DATA_DIR",
  "BACKOFFICE_SESSION_VERSION",
  "STORAGE_BACKEND",
  "BLOB_CONTENT_KEY",
  "BLOB_COLORS_KEY",
  "STRIPE_PRICE_10_CREDITS",
  "STRIPE_PRICE_25_CREDITS",
  "STRIPE_PRICE_50_CREDITS",
  "NEXT_PUBLIC_ADMIN_EMAIL",
  "ADMIN_EMAILS",
];

type CompareStatus = "both" | "local_only" | "vercel_only" | "schema_only";

interface CompareRow {
  key: string;
  status: CompareStatus;
  inSchema: boolean;
  inLocal: boolean;
  inVercel: boolean;
  vercelTargets: string[];
}

const TEST_USER_EMAIL = SECRETS.testUserEmail || SECRETS.superadminEmail || "";

function isUnresolved(value: string | undefined): boolean {
  if (!value) return true;
  const t = value.trim();
  if (!t) return true;
  if (/^\$\{[A-Z0-9_]+\}$/.test(t) || /^\$[A-Z0-9_]+$/.test(t)) return true;
  return false;
}

async function isAdmin(req: NextRequest): Promise<boolean> {
  const user = await getCurrentUser(req);
  return Boolean(user?.email && user.email === TEST_USER_EMAIL);
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const schemaKeys = new Set(Object.keys(serverSchema.shape));
  for (const k of EXTRA_KNOWN_KEYS) schemaKeys.add(k);

  const localKeys = new Map<string, boolean>();
  for (const key of schemaKeys) {
    localKeys.set(key, !isUnresolved(process.env[key]));
  }

  const vercelKeys = new Map<string, string[]>();
  let vercelError: string | null = null;

  if (isVercelConfigured()) {
    try {
      const projectId = process.env.VERCEL_PROJECT_ID?.trim() || "";
      const teamId = process.env.VERCEL_TEAM_ID?.trim() || undefined;

      if (projectId) {
        const envs = await listEnvironmentVariables(projectId, teamId);
        for (const env of envs) {
          vercelKeys.set(env.key, env.target ?? []);
        }
      } else {
        vercelError = "VERCEL_PROJECT_ID not set";
      }
    } catch (e) {
      vercelError = e instanceof Error ? e.message : "Failed to fetch Vercel env";
    }
  } else {
    vercelError = "Vercel not configured (VERCEL_TOKEN missing)";
  }

  const allKeys = new Set([...schemaKeys, ...vercelKeys.keys()]);

  const rows: CompareRow[] = [];
  for (const key of allKeys) {
    const inSchema = schemaKeys.has(key);
    const inLocal = localKeys.get(key) ?? false;
    const inVercel = vercelKeys.has(key);
    const vercelTargets = vercelKeys.get(key) ?? [];

    let status: CompareStatus;
    if (inLocal && inVercel) status = "both";
    else if (inLocal && !inVercel) status = "local_only";
    else if (!inLocal && inVercel) status = "vercel_only";
    else status = "schema_only";

    rows.push({ key, status, inSchema, inLocal, inVercel, vercelTargets });
  }

  rows.sort((a, b) => {
    const order: Record<CompareStatus, number> = {
      schema_only: 0,
      vercel_only: 1,
      local_only: 2,
      both: 3,
    };
    return order[a.status] - order[b.status] || a.key.localeCompare(b.key);
  });

  const summary = {
    total: rows.length,
    both: rows.filter((r) => r.status === "both").length,
    localOnly: rows.filter((r) => r.status === "local_only").length,
    vercelOnly: rows.filter((r) => r.status === "vercel_only").length,
    schemaOnly: rows.filter((r) => r.status === "schema_only").length,
  };

  return NextResponse.json({
    success: true,
    vercelError,
    summary,
    rows,
  });
}
