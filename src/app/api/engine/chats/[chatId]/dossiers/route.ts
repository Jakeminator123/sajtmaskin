/**
 * Read-only dossier overview for the builder preview panel.
 *
 * Answers: which reusable building blocks (dossiers) are wired into this
 * chat's current build, and — for the heavier (hard) integrations — whether
 * they have been built into the active version yet and whether they still
 * need real env keys.
 *
 * Data sources (all shared with the readiness / finalize-design routes):
 *  - `resolveSelectedDossiersWithVersionPresence(...)` — the connected dossier
 *    set: snapshot-derived selection ∪ dossiers whose files are actually in
 *    the version (ONE owner, shared by panel + all F3/deploy gates).
 *  - `deriveTier3BuildSpecForVersion(versionId, selectedDossiers)` —
 *    integrations actually detected in the active version's files. A hard
 *    dossier that maps to a detected requirement is "built"; one that does
 *    not is still an F2 mockup ("not built").
 *  - `validateTier3Readiness(...)` — which built integrations still miss
 *    real BUILD env values (the F3-blocking scope → `blocked-build`).
 *    Feature-runtime keys are separately diffed against stored values to
 *    split built into `built-demo` (demo fallback runs) vs `built-live`.
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
import { selectDossiersForRequest } from "@/lib/gen/dossiers/select";
import {
  resolveDossiersPresentInVersion,
  resolveSelectedDossiersWithVersionPresence,
} from "@/lib/gen/dossiers/version-presence";
import { getVersionFiles } from "@/lib/gen/version-manager";
import { dossierRequiresF3, type SelectedDossier } from "@/lib/gen/dossiers/types";
import { extractBriefSummaryFromSnapshot } from "@/lib/gen/orchestration-snapshot";
import { deriveTier3BuildSpecForVersion } from "@/lib/integrations/tier3-readiness-gate";
import {
  mapProviderKeysToDossierCapabilities,
  validateTier3Readiness,
  type Tier3IntegrationRequirement,
} from "@/lib/integrations/tier3-build-spec";
import { getStoredProjectEnvVarMap } from "@/lib/project-env-vars";
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

  // Fetch the stored env-var map up front: it powers both the per-key
  // `hasRealValue` flags AND (fix-isconfigured) the dossier `configured`
  // signal, so it must be resolved before the snapshot selection runs.
  // `getStoredProjectEnvVarMap` only returns keys with a real stored value.
  const projectEnvVars = chat.project_id
    ? await getStoredProjectEnvVarMap(chat.project_id).catch(
        () => ({}) as Record<string, string>,
      )
    : ({} as Record<string, string>);
  const configuredEnvKeys = new Set(Object.keys(projectEnvVars));

  // Single files_json read per request (review round 2, perf): loaded once
  // here, then reused by the presence union AND every build-spec derivation
  // below via `preloadedFiles`. Best-effort: a load failure degrades to
  // snapshot-only selection + "files unavailable" spec.
  const versionFiles =
    version && version.chat_id === chat.id
      ? await getVersionFiles(version.id).catch(() => null)
      : null;

  // One owner (review round 2): snapshot ∪ version-presence — the same
  // resolver the readiness/finalize-design/stream-gate/deploy consumers use,
  // so the panel can never disagree with the gates. Covers the incident case:
  // an integration built into the version shows even when the F2-muted
  // snapshot floor dropped its capability AND the provider-key→capability
  // mapping resolves the wrong dossier (`openai` → `ai-chat` default, never
  // `ai-tool-calling`).
  const initialSelectedDossiers = resolveSelectedDossiersWithVersionPresence({
    snapshot: chat.orchestration_snapshot,
    versionFiles,
    configuredEnvKeys,
  });

  const lifecycleStage =
    version && typeof version.lifecycle_stage === "string" &&
    version.lifecycle_stage === "integrations"
      ? "integrations"
      : "design";

  // Provisional pass: detect requirements from the version's real files using
  // the union set above. Used below to discover capabilities the union still
  // misses (brief-planned or provider-key-detected); the authoritative `spec`
  // is re-derived only when reconciliation actually grew the set.
  const provisionalSpec =
    version && version.chat_id === chat.id
      ? await deriveTier3BuildSpecForVersion(version.id, initialSelectedDossiers, {
          preloadedFiles: versionFiles ?? [],
        })
      : null;

  const briefSummary = extractBriefSummaryFromSnapshot(chat.orchestration_snapshot);
  const initialCapabilities = new Set(
    initialSelectedDossiers.map((selected) => selected.entry.capability.toLowerCase()),
  );
  // `extractBriefSummaryFromSnapshot` casts (does not filter) the persisted
  // array, so legacy/malformed snapshots can carry non-string entries here.
  // Filter to strings before lowercasing — same tolerant pattern as
  // `resolveSelectedDossiersFromSnapshot` — instead of 500:ing the route.
  const plannedCapabilities = (briefSummary?.requestedCapabilities ?? [])
    .filter((capability): capability is string => typeof capability === "string")
    .map((capability) => capability.toLowerCase());
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

  // Only re-resolve (capability re-selection) when reconciliation actually
  // found something the union missed — the common case keeps the initial set.
  const capabilitySelectedDossiers =
    extraCapabilities.length > 0
      ? selectDossiersForRequest({
          requestedCapabilities: [...initialCapabilities, ...extraCapabilities],
          configuredEnvKeys,
        }).selected
      : initialSelectedDossiers;

  // The capability re-selection REPLACES the list with capability defaults,
  // which can drop a version-present non-default sibling (e.g. mongodb-atlas
  // under `database`). Re-union the presence entries (dedupe by id) so file
  // evidence always survives reconciliation. Presence is computed from the
  // already-loaded files — no extra read.
  const presentInVersionDossiers = versionFiles
    ? resolveDossiersPresentInVersion(versionFiles, configuredEnvKeys)
    : [];
  const selectedById = new Map<string, SelectedDossier>();
  for (const selected of [...capabilitySelectedDossiers, ...presentInVersionDossiers]) {
    if (!selectedById.has(selected.entry.id)) selectedById.set(selected.entry.id, selected);
  }
  const selectedDossiers = Array.from(selectedById.values());

  // Re-derive the spec (against the same preloaded files) only when a
  // FILE-based source grew the set beyond what the provisional pass saw —
  // capabilities detected via provider keys, or a presence dossier the
  // capability re-selection dropped. A brief-only "planned" capability isn't
  // in the files, so it never forces a re-derive. Failure degrades to the
  // provisional spec (review round 2) instead of 500:ing the panel.
  const presenceAddedNewDossier = presentInVersionDossiers.some(
    (present) =>
      !capabilitySelectedDossiers.some((sel) => sel.entry.id === present.entry.id),
  );
  let spec = provisionalSpec;
  if (
    (newlyDetectedCapabilities.length > 0 || presenceAddedNewDossier) &&
    version &&
    version.chat_id === chat.id
  ) {
    try {
      spec = await deriveTier3BuildSpecForVersion(version.id, selectedDossiers, {
        preloadedFiles: versionFiles ?? [],
      });
    } catch (error) {
      console.warn(
        "[API] dossier overview spec re-derivation failed — using provisional spec:",
        error instanceof Error ? error.message : error,
      );
      spec = provisionalSpec;
    }
  }
  const versionFilesAvailable = spec !== null;

  // Placeholder set powers the per-key `placeholderCovered` flag. The stored
  // env-var map (`projectEnvVars`) was already resolved up front (above).
  const placeholderKeySet = loadPlaceholderKeySet();
  const hasRealEnvValue = (key: string): boolean => {
    const value = projectEnvVars[key];
    return typeof value === "string" && value.trim().length > 0;
  };

  let missingByKey = new Map<string, string[]>();
  if (spec && spec.requirements.length > 0 && version) {
    // Mirror the readiness route's env gate: placeholders are ALWAYS accepted
    // for build keys in F3 (ägarbeslut 2026-07-22 — bygget går i demoläge och
    // riktiga nycklar fylls i via Byggblock). In F2 the strict view stays so
    // the panel honestly shows which keys still lack real values.
    const readiness = validateTier3Readiness(spec, projectEnvVars, {
      allowPlaceholdersForBuildKeys: lifecycleStage === "integrations",
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

    // Feature-runtime keys never block F3 (they are absent from the
    // readiness gate's missing set) but they DO decide demo vs live: without
    // a stored real value the dossier's shipped fallback (canned/seed/
    // success) is what actually runs. Derived from the manifest so it also
    // covers planned (not yet detected) dossiers.
    const missingLiveKeys = (entry.envVars ?? [])
      .filter(
        (env) => (env.enforcement ?? "build") === "feature-runtime" && !hasRealEnvValue(env.key),
      )
      .map((env) => env.key);
    // Build keys satisfied only via the F3 placeholder opt-in
    // (`allowPlaceholdersInF3`) clear `missingKeys` — the BUILD may proceed —
    // but the function is not live (Codex P2 on #525): live requires real
    // stored values, never placeholders.
    const buildKeysWithoutRealValue = (entry.envVars ?? [])
      .filter(
        (env) => (env.enforcement ?? "build") === "build" && !hasRealEnvValue(env.key),
      )
      .map((env) => env.key);

    let status: DossierStatus;
    let missingKeys: string[] = [];
    if (!requiresF3) {
      status = "self-contained";
    } else {
      const matched = matchRequirementForDossier(envKeys, requirements);
      if (!matched) {
        // Planned: no code in the version yet. Deliberately NOT blocked-build
        // even when a manifest build key lacks a value (Bugbot on this diff):
        // the finalize gate only validates DETECTED integrations (+ pending
        // approved providers), so labelling an undetected dossier as blocking
        // would contradict the gate. The per-key badges ("Kräver riktigt
        // värde") + inline inputs still prompt for the key, and an actual 412
        // focuses this row via the open-event with the server's key scope.
        status = "planned";
      } else {
        // Built: the F3-blocking scope is the readiness gate's verdict for
        // the matched requirement — the exact set the 412 gate would demand.
        missingKeys = missingByKey.get(matched.key) ?? [];
        if (missingKeys.length > 0) {
          status = "blocked-build";
        } else {
          status =
            missingLiveKeys.length > 0 || buildKeysWithoutRealValue.length > 0
              ? "built-demo"
              : "built-live";
        }
      }
    }

    return {
      id: entry.id,
      label: entry.label,
      class: entry.class,
      capability: entry.capability,
      summary: entry.summary,
      summarySv: entry.summarySv,
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
      missingLiveKeys,
      lastVerified: entry.lastVerified,
    };
  });

  const counts = {
    total: dossiers.length,
    hard: dossiers.filter((d) => d.class === "hard").length,
    soft: dossiers.filter((d) => d.class === "soft").length,
    builtLive: dossiers.filter((d) => d.status === "built-live").length,
    builtDemo: dossiers.filter((d) => d.status === "built-demo").length,
    blockedBuild: dossiers.filter((d) => d.status === "blocked-build").length,
    planned: dossiers.filter((d) => d.status === "planned").length,
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
