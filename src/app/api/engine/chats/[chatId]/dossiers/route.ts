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
 * ## Reconciliation against F2-mute capability loss
 *
 * `resolveSelectedDossiersFromSnapshot` resolves ONLY the capability floor
 * that drove the MOST RECENT generation round (the snapshot's top-level
 * `requestedCapabilities`, i.e. `orch.dossierRequestedCapabilities`). F2-mute
 * (`enforceFollowUpCapabilityFloor` in `orchestrate.ts`) deliberately strips
 * F3-only capabilities (payments, auth, ai-chat, …) from that floor on every
 * F2 (design) round — including rounds AFTER an F3 build already injected the
 * dossier's files. A Stripe dossier built in F3 can therefore vanish from
 * this list the moment the user sends one more design tweak, even though the
 * injected code is still sitting in the version — the panel would report
 * zero dossiers for a chat with a broken, but very much present, Stripe
 * integration.
 *
 * Before building the response we reconcile the snapshot-resolved set
 * against two independent, F2-mute-immune sources:
 *  1. `briefSummary.requestedCapabilities` — the raw, UNFILTERED brief intent
 *     (persisted straight from the Deep Brief, never passed through
 *     `filterDossierCapabilitiesForPrompt`). Surfaces dossiers the user asked
 *     for that are still F2-mocked ("planned" integrations).
 *  2. Requirements actually DETECTED in the version's real files via
 *     `deriveTier3BuildSpecForVersion` — the regex/manifest detection
 *     pipeline runs unconditionally, independent of `selectedDossiers`.
 *     Surfaces dossiers genuinely injected into the codebase regardless of
 *     what the current capability floor remembers.
 * This is read-only reporting reconciliation: no dossier selection/injection
 * logic is touched, only which already-selectable dossiers this route
 * decides to describe to the user.
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
import { selectDossiersForRequest } from "@/lib/gen/dossiers/select";
import { dossierRequiresF3 } from "@/lib/gen/dossiers/types";
import { extractBriefSummaryFromSnapshot } from "@/lib/gen/orchestration-snapshot";
import { deriveTier3BuildSpecForVersion } from "@/lib/integrations/tier3-readiness-gate";
import {
  mapProviderKeysToDossierCapabilities,
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

type OverviewResult =
  | { ok: true; response: DossierOverviewResponse }
  | { ok: false; status: number; error: string };

async function buildDossierOverview(
  request: Request,
  chatId: string,
  requestedVersionId: string | null,
): Promise<OverviewResult> {
  const chat = await getEngineChatByIdForRequest(request, chatId);
  if (!chat) return { ok: false, status: 404, error: "Chat not found" };

  const requestedVersion = requestedVersionId
    ? await getEngineVersionForChatByIdForRequest(request, chatId, requestedVersionId)
    : null;
  // When a specific versionId was requested but is not visible to the caller,
  // 404 instead of silently answering for a different version (mirrors the
  // sibling `/files` and `/version-status` routes). A missing version only
  // falls back to preferred/latest when NO versionId was requested.
  if (requestedVersionId && !requestedVersion) {
    return { ok: false, status: 404, error: "Version not found" };
  }
  const version =
    requestedVersion?.version ??
    (await getPreferredVersion(chat.id)) ??
    (await getLatestVersion(chat.id));

  const initialSelectedDossiers = resolveSelectedDossiersFromSnapshot(
    chat.orchestration_snapshot,
  );

  const lifecycleStage =
    version && typeof version.lifecycle_stage === "string" &&
    version.lifecycle_stage === "integrations"
      ? "integrations"
      : "design";

  // Provisional pass: detect requirements from the version's real files
  // using ONLY the snapshot-resolved dossiers (may already be F2-mute-lossy —
  // see module doc). Used below purely to discover capabilities the
  // snapshot floor lost; the authoritative `spec` (with correct env
  // enforcement tagging) is re-derived after the dossier set is finalized.
  const provisionalSpec =
    version && version.chat_id === chat.id
      ? await deriveTier3BuildSpecForVersion(version.id, initialSelectedDossiers)
      : null;

  const briefSummary = extractBriefSummaryFromSnapshot(chat.orchestration_snapshot);
  const initialCapabilities = new Set(
    initialSelectedDossiers.map((selected) => selected.entry.capability.toLowerCase()),
  );
  const plannedCapabilities = (briefSummary?.requestedCapabilities ?? []).map((capability) =>
    capability.toLowerCase(),
  );
  const detectedCapabilities = provisionalSpec
    ? mapProviderKeysToDossierCapabilities(
        provisionalSpec.requirements.map((requirement) => requirement.key),
      )
    : [];
  // Capabilities the snapshot floor is missing but that either the raw brief
  // intent or the version's actual files still vouch for.
  const extraCapabilities = Array.from(
    new Set([...plannedCapabilities, ...detectedCapabilities]),
  ).filter((capability) => !initialCapabilities.has(capability));
  // Subset of the above that came from FILE detection specifically. Only
  // this subset can change env-enforcement tagging (brief-only "planned"
  // capabilities aren't in the files at all, so re-scanning them would
  // reproduce the exact same `provisionalSpec` — a wasted file read).
  const newlyDetectedCapabilities = detectedCapabilities.filter(
    (capability) => !initialCapabilities.has(capability),
  );

  // Only re-resolve (and re-derive the build spec, one extra file read) when
  // reconciliation actually found something the snapshot floor missed — the
  // common, non-buggy case does exactly the same work as before.
  const selectedDossiers =
    extraCapabilities.length > 0
      ? selectDossiersForRequest({
          requestedCapabilities: [...initialCapabilities, ...extraCapabilities],
        }).selected
      : initialSelectedDossiers;

  // Derive which integrations are actually wired into the active version's
  // files, plus which of them still miss real env values. When the version
  // (or its files) can't be resolved, we can't determine "built", so hard
  // dossiers fall back to "not-built" and we flag it to the UI.
  const spec =
    newlyDetectedCapabilities.length > 0 && version && version.chat_id === chat.id
      ? await deriveTier3BuildSpecForVersion(version.id, selectedDossiers)
      : provisionalSpec;
  const versionFilesAvailable = spec !== null;

  // Fetch the stored env-var map + placeholder set once. Both are needed for
  // the per-key `hasRealValue` / `placeholderCovered` flags on every dossier
  // (not just detected ones), so we resolve them up front rather than inside
  // the readiness branch below.
  const projectEnvVars = chat.project_id
    ? await getStoredProjectEnvVarMap(chat.project_id).catch(
        () => ({}) as Record<string, string>,
      )
    : ({} as Record<string, string>);
  const placeholderKeySet = loadPlaceholderKeySet();
  const hasRealEnvValue = (key: string): boolean => {
    const value = projectEnvVars[key];
    return typeof value === "string" && value.trim().length > 0;
  };

  let missingByKey = new Map<string, string[]>();
  if (spec && spec.requirements.length > 0 && version) {
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
      placeholderEnvKeys: placeholderKeySet,
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
        hasRealValue: hasRealEnvValue(env.key),
        placeholderCovered: placeholderKeySet.has(env.key),
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
    ok: true,
    response: {
      success: true,
      projectId: chat.project_id ?? null,
      versionId: version?.id ?? null,
      lifecycleStage,
      versionFilesAvailable,
      counts,
      dossiers,
    },
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

    const result = await buildDossierOverview(request, chatId, requestedVersionId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.response);
  } catch (error) {
    console.error("[API] Failed to build dossier overview:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
