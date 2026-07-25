import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/admin";
import { FEATURES, URLS } from "@/lib/config";
import {
  getEnvRule,
  getKnownEnvKeys,
  inspectEnvValue,
  type EnvClassification,
} from "@/lib/env-audit";
import { checkOpenClawGatewayHealth } from "@/lib/openclaw/status";

type EnvKeyStatus = {
  key: string;
  required: boolean;
  present: boolean;
  classification: EnvClassification;
  notes?: string;
};

/**
 * Keys the app genuinely cannot run without. Everything else is optional and
 * degrades a specific feature.
 *
 * This is the ONLY hand-maintained env knowledge left in this route: the key
 * list, notes and classification now come from the canonical policy
 * (`src/lib/env-audit.ts` → `config/env-policy.json` + the zod server schema),
 * the same source `/api/admin/env/compare` uses. Before 2026-07-24 this file
 * carried its own ~45-entry list that silently drifted from the policy.
 *
 * Required-ness cannot be derived from the schema: every field there is
 * `optional()` so the app can boot in degraded mode.
 */
const CRITICAL_KEYS = new Set(["POSTGRES_URL", "JWT_SECRET"]);

/** At least one code-generation provider key must be present. */
const CODEGEN_PROVIDER_KEYS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"];

function isPresent(key: string): boolean {
  return inspectEnvValue(process.env[key]) === "set";
}

export async function GET(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) {
    return admin.response;
  }

  const openclaw = await checkOpenClawGatewayHealth();

  const hasAnyCodegenKey = CODEGEN_PROVIDER_KEYS.some(isPresent);

  const keys: EnvKeyStatus[] = getKnownEnvKeys().map((key) => {
    const rule = getEnvRule(key);
    return {
      key,
      // A codegen provider key is only reported as required while NO provider is
      // configured — otherwise both would show up as "missing" when one is set.
      required:
        CRITICAL_KEYS.has(key) || (CODEGEN_PROVIDER_KEYS.includes(key) && !hasAnyCodegenKey),
      present: isPresent(key),
      classification: rule.classification,
      notes: rule.notes,
    };
  });

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
