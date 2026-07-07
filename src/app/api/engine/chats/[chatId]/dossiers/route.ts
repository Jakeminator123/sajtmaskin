/**
 * Read-only dossier overview for the builder preview panel.
 *
 * Answers: which reusable building blocks (dossiers) are wired into this
 * chat's current build, and — for the heavier (hard) integrations — whether
 * they have been built into the active version yet and whether they still
 * need real env keys.
 *
 * Data sources (all already used by the readiness / finalize-design routes):
 *  - `resolveSelectedDossiersFromSnapshot(chat.orchestration_snapshot)` —
 *    the connected dossier set (capability-driven, persisted at gen time).
 *  - `deriveTier3BuildSpecForVersion(versionId, selectedDossiers)` —
 *    integrations actually detected in the active version's files. A hard
 *    dossier that maps to a detected requirement is "built"; one that does
 *    not is still an F2 mockup ("not built").
 *  - `validateTier3Readiness(...)` — which built integrations still miss
 *    real env values (so the UI can say "built, needs keys").
 *
 * Purely informational — no mutation, no F3 trigger. F2-mute safe: it only
 * reports status, it never asks the chat for env keys.
 */
import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import {
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
} from "@/lib/tenant";
import { getLatestVersion, getPreferredVersion } from "@/lib/db/chat-repository-pg";
import { resolveSelectedDossiersFromSnapshot } from "@/lib/gen/dossiers/snapshot-selection";
import { dossierRequiresF3 } from "@/lib/gen/dossiers/types";
import { deriveTier3BuildSpecForVersion } from "@/lib/integrations/tier3-readiness-gate";
import {
  validateTier3Readiness,
  type Tier3IntegrationRequirement,
} from "@/lib/integrations/tier3-build-spec";
import { getStoredProjectEnvVarMap, readAllowPlaceholdersInF3 } from "@/lib/project-env-vars";
import { loadPlaceholderKeySet } from "@/lib/gen/preview/env-local";
import type {
  DossierOverviewEntry,
  DossierOverviewResponse,
  DossierStatus,
} from "@/lib/builder/dossier-overview";

export const runtime = "nodejs";

/** Full env-key surface a detected tier-3 requirement owns. */
function requirementEnvSurface(req: Tier3IntegrationRequirement): Set<string> {
  return new Set<string>([
    ...req.requiredRealEnvKeys,
    ...req.placeholderOkEnvKeys,
    ...req.featureRuntimeEnvKeys,
    ...req.warnOnlyEnvKeys,
  ]);
}

/**
 * Match a dossier to the detected tier-3 requirement with the most env-key
 * overlap (any-overlap = same vendor). Mirrors `findMatchingCluster` in
 * `detect-integrations.ts` so the join is consistent with how enforcement
 * tags are already threaded.
 */
function matchRequirementForDossier(
  dossierEnvKeys: string[],
  requirements: Tier3IntegrationRequirement[],
): Tier3IntegrationRequirement | undefined {
  let best: Tier3IntegrationRequirement | undefined;
  let bestOverlap = 0;
  for (const req of requirements) {
    const surface = requirementEnvSurface(req);
    let overlap = 0;
    for (const key of dossierEnvKeys) {
      if (surface.has(key)) overlap += 1;
    }
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = req;
    }
  }
  return best;
}

async function buildDossierOverview(
  request: Request,
  chatId: string,
  requestedVersionId: string | null,
): Promise<DossierOverviewResponse | null> {
  const chat = await getEngineChatByIdForRequest(request, chatId);
  if (!chat) return null;

  const requestedVersion = requestedVersionId
    ? await getEngineVersionForChatByIdForRequest(request, chatId, requestedVersionId)
    : null;
  const version =
    requestedVersion?.version ??
    (await getPreferredVersion(chat.id)) ??
    (await getLatestVersion(chat.id));

  const selectedDossiers = resolveSelectedDossiersFromSnapshot(
    chat.orchestration_snapshot,
  );

  const lifecycleStage =
    version && typeof version.lifecycle_stage === "string" &&
    version.lifecycle_stage === "integrations"
      ? "integrations"
      : "design";

  // Derive which integrations are actually wired into the active version's
  // files, plus which of them still miss real env values. When the version
  // (or its files) can't be resolved, we can't determine "built", so hard
  // dossiers fall back to "not-built" and we flag it to the UI.
  const spec =
    version && version.chat_id === chat.id
      ? await deriveTier3BuildSpecForVersion(version.id, selectedDossiers)
      : null;
  const versionFilesAvailable = spec !== null;

  let missingByKey = new Map<string, string[]>();
  if (spec && spec.requirements.length > 0 && version) {
    const projectEnvVars = chat.project_id
      ? await getStoredProjectEnvVarMap(chat.project_id).catch(
          () => ({}) as Record<string, string>,
        )
      : ({} as Record<string, string>);
    // Mirror the readiness route's env gate: placeholder values only count as
    // "satisfied" once the version is in F3 (`integrations`). Accepting them in
    // F2 would let this panel show `built-ready` while the canonical readiness /
    // env gate still treats the same keys as missing (a false green).
    const allowPlaceholdersInF3 =
      lifecycleStage === "integrations"
        ? await readAllowPlaceholdersInF3(chat.project_id)
        : false;
    const readiness = validateTier3Readiness(spec, projectEnvVars, {
      allowPlaceholdersForBuildKeys: allowPlaceholdersInF3,
      placeholderEnvKeys: loadPlaceholderKeySet(),
    });
    missingByKey = new Map(
      readiness.missingByIntegration.map((m) => [m.key, m.missing]),
    );
  }

  const requirements = spec?.requirements ?? [];

  const dossiers: DossierOverviewEntry[] = selectedDossiers.map((selected) => {
    const { entry } = selected;
    const requiresF3 = dossierRequiresF3(entry);
    const envKeys = (entry.envVars ?? []).map((env) => env.key);

    let status: DossierStatus;
    let missingKeys: string[] = [];
    if (!requiresF3) {
      status = "self-contained";
    } else {
      const matched = matchRequirementForDossier(envKeys, requirements);
      if (!matched) {
        status = "not-built";
      } else {
        missingKeys = missingByKey.get(matched.key) ?? [];
        status = missingKeys.length > 0 ? "built-needs-keys" : "built-ready";
      }
    }

    return {
      id: entry.id,
      label: entry.label,
      class: entry.class,
      capability: entry.capability,
      summary: entry.summary,
      complexity: entry.complexity,
      requiresF3,
      configured: selected.configured,
      dependencies: entry.dependencies ?? [],
      envVars: (entry.envVars ?? []).map((env) => ({
        key: env.key,
        required: env.required,
        enforcement: env.enforcement ?? "build",
        purpose: env.purpose,
      })),
      status,
      missingKeys,
      lastVerified: entry.lastVerified,
    };
  });

  const counts = {
    total: dossiers.length,
    hard: dossiers.filter((d) => d.class === "hard").length,
    soft: dossiers.filter((d) => d.class === "soft").length,
    builtReady: dossiers.filter((d) => d.status === "built-ready").length,
    builtNeedsKeys: dossiers.filter((d) => d.status === "built-needs-keys").length,
    notBuilt: dossiers.filter((d) => d.status === "not-built").length,
  };

  return {
    success: true,
    versionId: version?.id ?? null,
    lifecycleStage,
    versionFilesAvailable,
    counts,
    dossiers,
  };
}

export async function GET(request: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(request, "engine:dossiers", () => handleGET(request, ctx));
}

async function handleGET(request: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await ctx.params;
    const { searchParams } = new URL(request.url);
    const requestedVersionId = searchParams.get("versionId");

    const overview = await buildDossierOverview(request, chatId, requestedVersionId);
    if (!overview) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    return NextResponse.json(overview);
  } catch (error) {
    console.error("[API] Failed to build dossier overview:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
