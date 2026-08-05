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
import { transientDbResponseIfRetryable } from "@/lib/api/transient-db-response";
import { withRateLimit } from "@/lib/rateLimit";
import { getEngineChatByIdForRequest, getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { getLatestVersion, getPreferredVersion } from "@/lib/db/chat-repository-pg";
import { selectDossiersForRequest } from "@/lib/gen/dossiers/select";
import {
  resolveDossiersPresentInVersion,
  resolveSelectedDossiersWithVersionPresence,
} from "@/lib/gen/dossiers/version-presence";
import {
  isPlannedDossierCoveredByModelBuiltBlock,
  preferPendingIntegrationDossiers,
  resolveDossierLifecycle,
  resolvePendingIntegrationDossiers,
} from "@/lib/gen/dossiers";
import { getVersionFiles } from "@/lib/gen/version-manager";
import type { SelectedDossier } from "@/lib/gen/dossiers/types";
import {
  extractBriefSummaryFromSnapshot,
  readMutedCapabilitiesFromSnapshot,
} from "@/lib/gen/orchestration-snapshot";
import { deriveTier3BuildSpecForVersion } from "@/lib/integrations/tier3-readiness-gate";
import {
  mapProviderKeysToDossierCapabilities,
  validateTier3Readiness,
} from "@/lib/integrations/tier3-build-spec";
import { getStoredProjectEnvVarMap } from "@/lib/project-env-vars";
import { loadPlaceholderKeySet } from "@/lib/gen/preview/env-local";
import type { DossierOverviewEntry, DossierOverviewResponse } from "@/lib/builder/dossier-overview";

export const runtime = "nodejs";

type OverviewResult =
  { ok: true; response: DossierOverviewResponse } | { ok: false; status: number; error: string };

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
    ? await getStoredProjectEnvVarMap(chat.project_id).catch(() => ({}) as Record<string, string>)
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
  const snapshotAndPresenceDossiers = resolveSelectedDossiersWithVersionPresence({
    snapshot: chat.orchestration_snapshot,
    versionFiles,
    configuredEnvKeys,
  });
  const pendingDossiers = resolvePendingIntegrationDossiers({
    snapshot: chat.orchestration_snapshot as Record<string, unknown> | null,
    versionFiles,
    configuredEnvKeys,
  });
  // Preserve the provider-specific pending identity captured in F2. The older
  // capability-only reconciliation below remains as a legacy fallback.
  const presentInVersionDossiers = versionFiles
    ? resolveDossiersPresentInVersion(versionFiles, configuredEnvKeys)
    : [];
  const presentDossierIds = new Set(presentInVersionDossiers.map((selected) => selected.entry.id));
  const initialSelectedDossiers = preferPendingIntegrationDossiers({
    selected: snapshotAndPresenceDossiers,
    pending: pendingDossiers,
    preserveDossierIds: presentDossierIds,
  });

  const lifecycleStage =
    version &&
    typeof version.lifecycle_stage === "string" &&
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
  // Third planned source (spår 01 steg 3): capabilities the design stage
  // deliberately deferred. The brief only carries what the INIT prompt asked
  // for, so a newsletter requested in a follow-up ("koppla på Mailchimp")
  // showed up nowhere — the mute dropped it from the floor and the user got
  // no sign that it was registered at all.
  const plannedCapabilities = [
    ...(briefSummary?.requestedCapabilities ?? []).filter(
      (capability): capability is string => typeof capability === "string",
    ),
    ...readMutedCapabilitiesFromSnapshot(chat.orchestration_snapshot),
  ].map((capability) => capability.toLowerCase());
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
  const selectedById = new Map<string, SelectedDossier>();
  for (const selected of [...capabilitySelectedDossiers, ...presentInVersionDossiers]) {
    if (!selectedById.has(selected.entry.id)) selectedById.set(selected.entry.id, selected);
  }
  const selectedDossiers = preferPendingIntegrationDossiers({
    selected: Array.from(selectedById.values()),
    pending: pendingDossiers,
    preserveDossierIds: presentDossierIds,
  });

  // Re-derive the spec (against the same preloaded files) only when a
  // FILE-based source grew the set beyond what the provisional pass saw —
  // capabilities detected via provider keys, or a presence dossier the
  // capability re-selection dropped. A brief-only "planned" capability isn't
  // in the files, so it never forces a re-derive. Failure degrades to the
  // provisional spec (review round 2) instead of 500:ing the panel.
  const presenceAddedNewDossier = presentInVersionDossiers.some(
    (present) => !capabilitySelectedDossiers.some((sel) => sel.entry.id === present.entry.id),
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
  const realEnvKeys = new Set(Object.keys(projectEnvVars).filter((key) => hasRealEnvValue(key)));

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
    missingByKey = new Map(readiness.missingByIntegration.map((m) => [m.key, m.missing]));
  }

  const lifecycleRequirements = spec
    ? spec.requirements.map((requirement) => ({
        key: requirement.key,
        envKeys: [
          ...requirement.requiredRealEnvKeys,
          ...requirement.placeholderOkEnvKeys,
          ...requirement.featureRuntimeEnvKeys,
          ...requirement.warnOnlyEnvKeys,
        ],
        missingBuildKeys: missingByKey.get(requirement.key) ?? [],
      }))
    : null;

  const pendingDossierIds = new Set(pendingDossiers.map((pending) => pending.entry.id));

  const dossiers: DossierOverviewEntry[] = selectedDossiers.map((selected) => {
    const { entry } = selected;
    const lifecycle = resolveDossierLifecycle({
      entry,
      configuredBySelection: selected.configured,
      materialized: versionFiles === null ? null : presentDossierIds.has(entry.id),
      pending: pendingDossierIds.has(entry.id),
      realEnvKeys,
      requirements: lifecycleRequirements,
      versionFiles,
    });

    return {
      id: entry.id,
      label: entry.label,
      class: entry.class,
      capability: entry.capability,
      summary: entry.summary,
      summarySv: entry.summarySv,
      complexity: entry.complexity,
      requiresF3: lifecycle.requiresF3,
      mock: entry.mock,
      configured: selected.configured,
      dependencies: entry.dependencies ?? [],
      envVars: (entry.envVars ?? []).map((env) => ({
        key: env.key,
        required: env.required,
        enforcement: env.enforcement ?? "build",
        purpose: env.purpose,
        setupUrl: env.setupUrl,
        hasRealValue: hasRealEnvValue(env.key),
        placeholderCovered: placeholderKeySet.has(env.key),
      })),
      status: lifecycle.overviewStatus,
      missingKeys: lifecycle.missingBuildKeys,
      missingLiveKeys: lifecycle.missingFeatureRuntimeKeys,
      lastVerified: entry.lastVerified,
    };
  });

  // M#li6: hide a "planned" post whose function is already covered by a
  // MODEL-BUILT block — a built entry (requirement matched in the version's
  // code) WITHOUT dossier file presence. Coverage join + why dossier-injected
  // built blocks are excluded (provider migration): see
  // `isPlannedDossierCoveredByModelBuiltBlock`. View-level only — the
  // pending signal itself is untouched, so "Bygg integrationer" still knows
  // what F2 deferred.
  const modelBuiltBlocks = dossiers
    .filter(
      (d) =>
        (d.status === "built-live" || d.status === "built-demo" || d.status === "blocked-build") &&
        !presentDossierIds.has(d.id),
    )
    .map((d) => ({
      capability: d.capability,
      envKeys: d.envVars.map((env) => env.key),
    }));
  const visibleDossiers =
    modelBuiltBlocks.length === 0
      ? dossiers
      : dossiers.filter(
          (d) =>
            d.status !== "planned" ||
            !isPlannedDossierCoveredByModelBuiltBlock({
              planned: {
                capability: d.capability,
                envKeys: d.envVars.map((env) => env.key),
              },
              modelBuiltBlocks,
            }),
        );

  const counts = {
    total: visibleDossiers.length,
    hard: visibleDossiers.filter((d) => d.class === "hard").length,
    soft: visibleDossiers.filter((d) => d.class === "soft").length,
    builtLive: visibleDossiers.filter((d) => d.status === "built-live").length,
    builtDemo: visibleDossiers.filter((d) => d.status === "built-demo").length,
    blockedBuild: visibleDossiers.filter((d) => d.status === "blocked-build").length,
    planned: visibleDossiers.filter((d) => d.status === "planned").length,
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
      dossiers: visibleDossiers,
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
    // A1: transient pool/connection failures degrade to a retryable 503 so the
    // SWR poller backs off instead of surfacing a hard 500.
    const degraded = transientDbResponseIfRetryable(error, "[API] dossiers");
    if (degraded) return degraded;
    console.error("[API] Failed to build dossier overview:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
