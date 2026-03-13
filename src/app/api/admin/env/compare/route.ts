import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/admin";
import { serverSchema } from "@/lib/env";
import {
  listEnvironmentVariables,
  isVercelConfigured,
} from "@/lib/vercel/vercel-client";
import {
  getEnvRule,
  getKnownEnvKeys,
  hasAllTargets,
  inspectEnvValue,
  type EnvClassification,
  type EnvValueState,
} from "@/lib/env-audit";

type CompareStatus = "both" | "local_only" | "vercel_only" | "schema_only";
type SyncRecommendation =
  | "none"
  | "push_local_to_vercel"
  | "pull_from_vercel"
  | "review_manually";

interface CompareRow {
  key: string;
  status: CompareStatus;
  inSchema: boolean;
  inLocal: boolean;
  inVercel: boolean;
  localState: EnvValueState;
  classification: EnvClassification;
  syncRecommendation: SyncRecommendation;
  notes?: string;
  vercelTargets: string[];
  recommendedVercelTargets: string[];
  hasTargetCoverage: boolean;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) {
    return admin.response;
  }

  const schemaKeys = new Set(Object.keys(serverSchema.shape));
  const knownKeys = new Set(getKnownEnvKeys());

  const localStates = new Map<string, EnvValueState>();
  for (const key of knownKeys) {
    localStates.set(key, inspectEnvValue(process.env[key]));
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

  const allKeys = new Set([...knownKeys, ...vercelKeys.keys()]);

  const rows: CompareRow[] = [];
  for (const key of allKeys) {
    const inSchema = schemaKeys.has(key);
    const localState = localStates.get(key) ?? inspectEnvValue(process.env[key]);
    const inLocal = localState === "set";
    const inVercel = vercelKeys.has(key);
    const vercelTargets = vercelKeys.get(key) ?? [];
    const rule = getEnvRule(key);
    const hasTargetCoverage = hasAllTargets(
      vercelTargets,
      rule.recommendedVercelTargets,
    );

    let status: CompareStatus;
    if (inLocal && inVercel) status = "both";
    else if (inLocal && !inVercel) status = "local_only";
    else if (!inLocal && inVercel) status = "vercel_only";
    else status = "schema_only";

    let syncRecommendation: SyncRecommendation = "none";
    if (
      rule.classification !== "local_only" &&
      rule.classification !== "vercel_managed"
    ) {
      if (rule.classification === "environment_specific") {
        syncRecommendation =
          !hasTargetCoverage || localState !== "set" || !inVercel
            ? "review_manually"
            : "none";
      } else if (localState === "placeholder") {
        syncRecommendation = "review_manually";
      } else if (inLocal && (!inVercel || !hasTargetCoverage)) {
        syncRecommendation = "push_local_to_vercel";
      } else if (!inLocal && inVercel) {
        syncRecommendation = "pull_from_vercel";
      }
    }

    rows.push({
      key,
      status,
      inSchema,
      inLocal,
      inVercel,
      localState,
      classification: rule.classification,
      syncRecommendation,
      notes: rule.notes,
      vercelTargets,
      recommendedVercelTargets: rule.recommendedVercelTargets,
      hasTargetCoverage,
    });
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
    pushToVercel: rows.filter((r) => r.syncRecommendation === "push_local_to_vercel").length,
    pullFromVercel: rows.filter((r) => r.syncRecommendation === "pull_from_vercel").length,
    reviewManually: rows.filter((r) => r.syncRecommendation === "review_manually").length,
  };

  return NextResponse.json({
    success: true,
    vercelError,
    summary,
    rows,
  });
}
