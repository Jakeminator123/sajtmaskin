/**
 * Shared F3 (integrations) env-readiness gate — single owner for the
 * "may this version start an F3 build?" decision (M#818-2).
 *
 * Consumers:
 *  - `POST /api/engine/chats/[chatId]/finalize-design` — the intended F3
 *    entry point (returns 412 + missing keys when not ready).
 *  - `POST /api/engine/chats/[chatId]/stream` with
 *    `meta.lifecycleStage: "integrations"` — previously started F3 codegen
 *    WITHOUT any readiness check, so a client that skipped finalize-design
 *    burned credits on a generation whose build gate was guaranteed to fail
 *    on missing real env keys. Both routes now consult this module.
 */

import { getVersionFiles } from "@/lib/gen/version-manager";
import { detectIntegrationsFromVersionFiles } from "@/lib/gen/detect-integrations";
import { getLatestEngineVersionErrorLogs } from "@/lib/db/services/version-errors";
import { loadPlaceholderKeySet } from "@/lib/gen/preview/env-local";
import { getStoredProjectEnvVarMap } from "@/lib/project-env-vars";
import {
  deriveTier3BuildSpec,
  deriveTier3BuildSpecForProviderKeys,
  mapProviderKeysToBackingDossierIds,
  validateTier3Readiness,
  type Tier3BuildSpec,
  type Tier3IntegrationRequirement,
  type Tier3ReadinessReport,
} from "@/lib/integrations/tier3-build-spec";
import { getDossierById } from "@/lib/gen/dossiers/registry";
import { resolveSelectedDossiersWithVersionPresence } from "@/lib/gen/dossiers/version-presence";
import type {
  PlanContracts,
  PlanIntegrationContract,
} from "@/lib/gen/plan/schema";
import type { CodeFile } from "@/lib/gen/parser";
import type { SelectedDossier } from "@/lib/gen/dossiers/types";

export function buildContractsFromDetectedIntegrations(
  detected: ReturnType<typeof detectIntegrationsFromVersionFiles>,
): PlanContracts {
  const integrations: PlanIntegrationContract[] = detected
    .filter((d) => d.key !== "custom-env")
    .map((d): PlanIntegrationContract => ({
      provider: d.provider ?? d.key,
      name: d.name,
      reason: typeof d.intent === "string" ? d.intent : "detected from generated code",
      status: "chosen",
      envVars: d.envVars,
      // P31 follow-up: propagate the per-key enforcement classification
      // so `tier3-build-spec.ts` can partition tier-3 keys into build /
      // feature-runtime / warn-only buckets — matching what the readiness
      // route surfaces. Without this, finalize-design treats every tier-3
      // key as build-blocking even when the readiness card already passed.
      ...(d.envEnforcement && Object.keys(d.envEnforcement).length > 0
        ? { envEnforcement: d.envEnforcement }
        : {}),
    }));
  return {
    dataMode: integrations.length > 0 ? "persisted" : "none",
    integrations,
    envVars: [],
  };
}

export async function deriveTier3BuildSpecForVersion(
  versionId: string,
  selectedDossiers: SelectedDossier[],
  options?: {
    /**
     * Version files the caller already loaded (perf: the dossiers/readiness/
     * finalize-design flows read `files_json` once per request and thread it
     * here so the spec derivation never re-reads it). `undefined` keeps the
     * legacy load-by-versionId behavior; an empty array means "the caller
     * loaded and got nothing" and resolves to null (files unavailable) without
     * a redundant second read.
     */
    preloadedFiles?: CodeFile[] | null;
  },
): Promise<Tier3BuildSpec | null> {
  const codeFiles = Array.isArray(options?.preloadedFiles)
    ? options.preloadedFiles
    : await getVersionFiles(versionId);
  if (!codeFiles || codeFiles.length === 0) {
    // G#21: the version exists (caller already resolved it) but its files
    // could not be loaded/parsed (empty or corrupt `files_json`). Returning
    // `{ requirements: [] }` here previously made the route answer
    // `ready: true` ("no integrations detected") — a false green that lets
    // F3 start against a project we never actually inspected. Signal
    // "could not determine" so the caller blocks instead of greenlighting.
    return null;
  }
  const detected = detectIntegrationsFromVersionFiles(
    codeFiles
      .filter((f) => typeof f?.path === "string" && typeof f?.content === "string")
      .map((f) => ({ name: f.path as string, content: f.content as string })),
    { selectedDossiers },
  );
  const contracts = buildContractsFromDetectedIntegrations(detected);
  return deriveTier3BuildSpec(contracts);
}

export type Tier3GateResult =
  | { ok: true; spec: Tier3BuildSpec }
  | { ok: false; reason: "version_files_unavailable" }
  | { ok: false; reason: "product_postcheck_blocked" }
  | {
      ok: false;
      reason: "missing_env";
      spec: Tier3BuildSpec;
      readiness: Tier3ReadinessReport;
    };

/**
 * Server-side Product Postcheck block (Codex P1 rounds 3+5 on #353) — shared
 * by BOTH F3 entry points (`/finalize-design` and the stream route via
 * {@link checkTier3ReadinessForVersion}), so a client that skips
 * finalize-design cannot lift a product-blocked F2 version to F3 either.
 * The F3 trigger button reads `product_postcheck.summary` from `/error-log`
 * once on mount and can be stale; this is the authoritative check. The
 * newest summary row wins (a later passing postcheck unblocks). Read
 * failures fail open with a log — defense-in-depth on top of the client
 * button; a telemetry hiccup must not brick the legit F3 flow.
 */
export async function isProductPostcheckBlocked(versionId: string): Promise<boolean> {
  try {
    const logs = await getLatestEngineVersionErrorLogs(versionId, 200);
    const summary = logs.find((log) => log.category === "product_postcheck.summary");
    const meta =
      summary?.meta && typeof summary.meta === "object"
        ? (summary.meta as Record<string, unknown>)
        : null;
    return meta?.productBlocked === true;
  } catch (err) {
    console.warn(
      "[tier3-readiness-gate] product-postcheck block read failed (fail-open):",
      err,
    );
    return false;
  }
}

function dedupeApprovedProviderKeys(providerKeys: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of providerKeys) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    normalized.push(trimmed);
  }
  return normalized;
}

function mergeUnique(listA: readonly string[], listB: readonly string[]): string[] {
  return Array.from(new Set([...listA, ...listB]));
}

function cloneRequirement(
  requirement: Tier3IntegrationRequirement,
): Tier3IntegrationRequirement {
  return {
    ...requirement,
    requiredRealEnvKeys: [...requirement.requiredRealEnvKeys],
    placeholderOkEnvKeys: [...requirement.placeholderOkEnvKeys],
    featureRuntimeEnvKeys: [...requirement.featureRuntimeEnvKeys],
    warnOnlyEnvKeys: [...requirement.warnOnlyEnvKeys],
    buildInstructions: [...requirement.buildInstructions],
  };
}

function mergeBuildSpecs(
  baseSpec: Tier3BuildSpec,
  pendingSpec: Tier3BuildSpec,
): Tier3BuildSpec {
  if (pendingSpec.requirements.length === 0) return baseSpec;
  const byKey = new Map<string, Tier3IntegrationRequirement>();
  const upsert = (requirement: Tier3IntegrationRequirement) => {
    const key = requirement.key.toLowerCase();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, cloneRequirement(requirement));
      return;
    }
    existing.name = existing.name || requirement.name;
    existing.provider = existing.provider || requirement.provider;
    existing.requiredRealEnvKeys = mergeUnique(
      existing.requiredRealEnvKeys,
      requirement.requiredRealEnvKeys,
    );
    existing.placeholderOkEnvKeys = mergeUnique(
      existing.placeholderOkEnvKeys,
      requirement.placeholderOkEnvKeys,
    );
    existing.featureRuntimeEnvKeys = mergeUnique(
      existing.featureRuntimeEnvKeys,
      requirement.featureRuntimeEnvKeys,
    );
    existing.warnOnlyEnvKeys = mergeUnique(
      existing.warnOnlyEnvKeys,
      requirement.warnOnlyEnvKeys,
    );
    existing.buildInstructions = mergeUnique(
      existing.buildInstructions,
      requirement.buildInstructions,
    );
    existing.setupGuide = existing.setupGuide || requirement.setupGuide;
    existing.hasConfigNoticeComponent =
      existing.hasConfigNoticeComponent || requirement.hasConfigNoticeComponent;
  };
  for (const requirement of baseSpec.requirements) upsert(requirement);
  for (const requirement of pendingSpec.requirements) upsert(requirement);
  return {
    requirements: Array.from(byKey.values()).sort((a, b) =>
      a.key.localeCompare(b.key),
    ),
  };
}

function promotePendingProviderBuildKeys(
  pendingSpec: Tier3BuildSpec,
): Tier3BuildSpec {
  if (pendingSpec.requirements.length === 0) return pendingSpec;
  return {
    requirements: pendingSpec.requirements.map((requirement) => {
      const strictBackingIds = mapProviderKeysToBackingDossierIds([requirement.key]);
      if (strictBackingIds.length === 0) return requirement;
      const enforcedBuildKeys = new Set<string>();
      for (const dossierId of strictBackingIds) {
        const dossier = getDossierById(dossierId);
        if (!dossier || dossier.class !== "hard") continue;
        for (const envVar of dossier.envVars ?? []) {
          if (typeof envVar?.key !== "string" || !envVar.key.trim()) continue;
          if (envVar.required === false) continue;
          if ((envVar.enforcement ?? "build") === "build") {
            enforcedBuildKeys.add(envVar.key);
          }
        }
      }
      if (enforcedBuildKeys.size === 0) return requirement;
      const promotedBuildKeys = mergeUnique(
        requirement.requiredRealEnvKeys,
        Array.from(enforcedBuildKeys),
      );
      const promotedSet = new Set(promotedBuildKeys);
      return {
        ...requirement,
        requiredRealEnvKeys: promotedBuildKeys,
        placeholderOkEnvKeys: requirement.placeholderOkEnvKeys.filter(
          (key) => !promotedSet.has(key),
        ),
        featureRuntimeEnvKeys: requirement.featureRuntimeEnvKeys.filter(
          (key) => !promotedSet.has(key),
        ),
        warnOnlyEnvKeys: requirement.warnOnlyEnvKeys.filter(
          (key) => !promotedSet.has(key),
        ),
      };
    }),
  };
}

/**
 * Full readiness decision for starting F3 from `versionId`: enforce the
 * Product Postcheck block, derive the file-based build spec, load the
 * project's stored env values, and validate every required real key.
 * Placeholders are ALWAYS accepted for build keys (owner decision
 * 2026-07-22) — F3 builds in demo mode and real keys land later via the
 * Byggblock panel.
 *
 * Dossier scoping is resolved INTERNALLY from the chat's orchestration
 * snapshot ∪ the version's file evidence
 * (`resolveSelectedDossiersWithVersionPresence`) — the same set the dossiers
 * panel and readiness route report, so gate and panel can never disagree on
 * which dossier owns an env key's enforcement. The version files are read
 * exactly once and reused for the spec derivation.
 */
export async function checkTier3ReadinessForVersion(params: {
  versionId: string;
  /**
   * Version whose CapabilitySmoke/Product Postcheck guards the F3 transition.
   * Deterministic F3 forks verify their own exact files but inherit this guard
   * from the selected F2 parent, where the preview smoke actually ran.
   */
  productPostcheckVersionId?: string;
  /** The chat's `orchestration_snapshot` (or null when absent). */
  orchestrationSnapshot: unknown;
  projectId: string | null;
  /**
   * Version files the caller already read (TOCTOU fix in the quality-gate
   * route: the fileset is read exactly once under the version lease and threaded
   * here so readiness evaluates the SAME snapshot verify/promotion will use).
   * `undefined` keeps the legacy load-by-versionId behavior; any explicit value
   * (incl. `null`/empty) is used verbatim without a second read.
   */
  preloadedFiles?: CodeFile[] | null;
  /**
   * Provider approvals carried by a pending F3 continuation marker. Their
   * build-key requirements are unioned into the readiness validation so a
   * newly approved integration (no parent-file evidence yet) can still block
   * with `missing_env` before credits/codegen.
   */
  pendingApprovedProviderKeys?: readonly string[];
}): Promise<Tier3GateResult> {
  if (
    await isProductPostcheckBlocked(
      params.productPostcheckVersionId ?? params.versionId,
    )
  ) {
    return { ok: false, reason: "product_postcheck_blocked" };
  }
  const versionFiles =
    params.preloadedFiles !== undefined
      ? params.preloadedFiles
      : await getVersionFiles(params.versionId);
  const selectedDossiers = resolveSelectedDossiersWithVersionPresence({
    snapshot: params.orchestrationSnapshot,
    versionFiles,
  });
  const spec = await deriveTier3BuildSpecForVersion(
    params.versionId,
    selectedDossiers,
    { preloadedFiles: versionFiles ?? [] },
  );
  if (!spec) {
    return { ok: false, reason: "version_files_unavailable" };
  }
  const normalizedPendingApproved = dedupeApprovedProviderKeys(
    params.pendingApprovedProviderKeys ?? [],
  );
  const pendingApprovalSpec =
    normalizedPendingApproved.length > 0
      ? promotePendingProviderBuildKeys(
          deriveTier3BuildSpecForProviderKeys(normalizedPendingApproved),
        )
      : { requirements: [] };
  const readinessSpec = mergeBuildSpecs(spec, pendingApprovalSpec);
  if (readinessSpec.requirements.length === 0) {
    return { ok: true, spec };
  }

  const projectEnvVars = params.projectId
    ? await getStoredProjectEnvVarMap(params.projectId).catch(
        () => ({}) as Record<string, string>,
      )
    : ({} as Record<string, string>);
  // Ägarbeslut 2026-07-22: placeholders är ALLTID tillåtna i F3 — bygget ska
  // gå igenom i demoläge utan riktiga nycklar, och Byggblock-panelen är ytan
  // där riktiga värden fylls i efteråt (built-demo → built-live). Den gamla
  // per-projekt-opt-in:en (`allowPlaceholdersInF3`) är borttagen.
  const readiness = validateTier3Readiness(readinessSpec, projectEnvVars, {
    allowPlaceholdersForBuildKeys: true,
    placeholderEnvKeys: loadPlaceholderKeySet(),
  });
  if (!readiness.ready) {
    return { ok: false, reason: "missing_env", spec, readiness };
  }
  return { ok: true, spec };
}
