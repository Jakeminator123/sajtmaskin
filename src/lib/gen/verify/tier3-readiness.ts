/**
 * Shared server-owned F3 readiness (L1).
 *
 * Invariant: no F3 promotion without this check under a distributed lease
 * (`runId`) against the exact file snapshot that verify/promotion will use.
 *
 * Owner for both `POST .../quality-gate` and `triggerServerVerification`.
 * A client that skips `/quality-gate` for integrations versions cannot bypass
 * env, F2-parent, Product Postcheck domain, or preview-identity checks.
 */

import { createHash } from "node:crypto";
import { getVersionFiles } from "@/lib/gen/version-manager";
import { detectIntegrationsFromVersionFiles } from "@/lib/gen/detect-integrations";
import { getEngineVersionErrorLogsForCategories } from "@/lib/db/services/version-errors";
import { getRunningProductPostcheckClaimForVersion } from "@/lib/db/services/product-postcheck-runs";
import { getVersionById } from "@/lib/db/chat-repository-pg";
import { loadPlaceholderKeySet } from "@/lib/gen/preview/env-local";
import { getStoredProjectEnvVarMap } from "@/lib/projects/project-env-vars";
import {
  deriveTier3BuildSpec,
  deriveTier3BuildSpecForDossierIds,
  deriveTier3BuildSpecForProviderKeys,
  mapProviderKeysToBackingDossierIds,
  validateTier3Readiness,
  type Tier3BuildSpec,
  type Tier3IntegrationRequirement,
  type Tier3ReadinessReport,
} from "@/lib/integrations/tier3-build-spec";
import { getDossierById } from "@/lib/gen/dossiers/registry";
import { preferPendingIntegrationDossiers } from "@/lib/gen/dossiers/pending-integrations";
import {
  resolveDossiersPresentInVersion,
  resolveSelectedDossiersWithVersionPresence,
} from "@/lib/gen/dossiers/version-presence";
import type {
  PlanContracts,
  PlanIntegrationContract,
} from "@/lib/gen/plan/schema";
import type { CodeFile } from "@/lib/gen/parser";
import type { SelectedDossier } from "@/lib/gen/dossiers/types";
import {
  f3MayReleaseOnVerdict,
  interpretProductPostcheckClaim,
  interpretProductPostcheckLogs,
  isRetryableProductPostcheckVerdict,
  PRODUCT_POSTCHECK_SKIPPED_CATEGORY,
  PRODUCT_POSTCHECK_SUMMARY_CATEGORY,
  productPostcheckF3GateReason,
  type ProductPostcheckF3GateReason,
  type ProductPostcheckVerdict,
} from "@/lib/gen/verify/product-postcheck-verdict";
import {
  matchesExactPreviewReadinessTuple,
  type ProductPostcheckPreviewProbe,
} from "@/lib/gen/verify/product-postcheck-preview-wait";

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
    preloadedFiles?: CodeFile[] | null;
  },
): Promise<Tier3BuildSpec | null> {
  const codeFiles = Array.isArray(options?.preloadedFiles)
    ? options.preloadedFiles
    : await getVersionFiles(versionId);
  if (!codeFiles || codeFiles.length === 0) {
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

export type Tier3ReadinessReason =
  | "missing_env"
  | "version_files_unavailable"
  | "f3_parent_version_missing"
  | ProductPostcheckF3GateReason
  | "preview_not_ready"
  | "readiness_unavailable";

export type Tier3ProductPostcheckHold = {
  ready: false;
  ok: false;
  reason: ProductPostcheckF3GateReason;
  verdict: ProductPostcheckVerdict;
  retryable: boolean;
};

export type Tier3ReadinessResult =
  | { ready: true; ok: true; spec: Tier3BuildSpec }
  | { ready: false; ok: false; reason: "version_files_unavailable"; retryable: true }
  | { ready: false; ok: false; reason: "f3_parent_version_missing"; retryable: false }
  | { ready: false; ok: false; reason: "preview_not_ready"; retryable: true }
  | { ready: false; ok: false; reason: "readiness_unavailable"; retryable: true }
  | Tier3ProductPostcheckHold
  | {
      ready: false;
      ok: false;
      reason: "missing_env";
      retryable: false;
      spec: Tier3BuildSpec;
      readiness: Tier3ReadinessReport;
    };

/** @deprecated Use {@link Tier3ReadinessResult}. Kept as the historical alias. */
export type Tier3GateResult = Tier3ReadinessResult;

export type ProductPostcheckVerdictRead = {
  verdict: ProductPostcheckVerdict;
  retryable: boolean;
};

export type ServerOwnedF3ReadinessInput = {
  versionId: string;
  chatId: string;
  parentVersionId: string | null;
  filesRevision: string | null;
  preloadedFiles: CodeFile[] | null;
  orchestrationSnapshot: unknown;
  projectId: string | null;
  previewIdentity?: ProductPostcheckPreviewProbe | null;
};

/**
 * Canonical argument bag for the quality-gate route and server-verify so both
 * lanes call {@link checkTier3ReadinessForVersion} with the same shape.
 */
export function serverOwnedF3ReadinessParams(
  input: ServerOwnedF3ReadinessInput,
): CheckTier3ReadinessForVersionParams {
  return {
    versionId: input.versionId,
    chatId: input.chatId,
    parentVersionId: input.parentVersionId,
    requireF2Parent: true,
    filesRevision: input.filesRevision,
    preloadedFiles: input.preloadedFiles,
    productPostcheckVersionId: input.parentVersionId ?? undefined,
    orchestrationSnapshot: input.orchestrationSnapshot,
    projectId: input.projectId,
    previewIdentity: input.previewIdentity ?? undefined,
  };
}

export function md5FilesRevision(filesJson: string): string {
  return createHash("md5").update(filesJson).digest("hex");
}

/**
 * L2 domain reader. A missing summary is `pending`, never pass. A DB read
 * error is `indeterminate`, never pass. Only `passed` / `allowed_skip` release.
 *
 * L6: an unexpired `running` claim holds F3 as `pending` even when an older
 * `passed` summary exists. Callers may pass `claim` explicitly (product-postcheck
 * route); otherwise the live claim row is loaded here.
 */
export async function readProductPostcheckVerdictForVersion(
  versionId: string,
  options?: { claim?: { status?: string | null } | null },
): Promise<ProductPostcheckVerdictRead> {
  try {
    const claim =
      options && "claim" in options
        ? options.claim
        : await getRunningProductPostcheckClaimForVersion(versionId);
    if (interpretProductPostcheckClaim(claim) === "pending") {
      return { verdict: "pending", retryable: true };
    }
    const logs = await getEngineVersionErrorLogsForCategories(versionId, [
      PRODUCT_POSTCHECK_SUMMARY_CATEGORY,
      PRODUCT_POSTCHECK_SKIPPED_CATEGORY,
    ]);
    const verdict = interpretProductPostcheckLogs(logs, { claim });
    return {
      verdict,
      retryable: isRetryableProductPostcheckVerdict(verdict),
    };
  } catch (err) {
    console.warn(
      "[tier3-readiness] product-postcheck verdict read failed (indeterminate):",
      err,
    );
    return { verdict: "indeterminate", retryable: true };
  }
}

/** @deprecated L2 — use {@link readProductPostcheckVerdictForVersion}. */
export async function isProductPostcheckBlocked(versionId: string): Promise<boolean> {
  const read = await readProductPostcheckVerdictForVersion(versionId);
  return read.verdict === "blocked";
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

export type CheckTier3ReadinessForVersionParams = {
  versionId: string;
  /**
   * Version whose CapabilitySmoke/Product Postcheck guards the F3 transition.
   * Deterministic F3 forks verify their own exact files but inherit this guard
   * from the selected F2 parent, where the preview smoke actually ran.
   */
  productPostcheckVersionId?: string;
  /** Chat id — used to confirm the F2 parent belongs to the same chat. */
  chatId?: string;
  /** F3 lineage. Required when {@link requireF2Parent} is set. */
  parentVersionId?: string | null;
  /**
   * Integrations verify/promote path. Missing or cross-chat parent is never
   * ready. Finalize-design / stream (F2 → F3 start) leave this unset.
   */
  requireF2Parent?: boolean;
  /**
   * Exact `files_revision` of the snapshot under the lease. Required when a
   * live preview identity is supplied (L7 tuple match).
   */
  filesRevision?: string | null;
  /**
   * L7 preview identity. When present, a `passed` postcheck may release only
   * if the full tuple is ready for this version + filesRevision.
   * `allowed_skip` does not require a live preview.
   */
  previewIdentity?: ProductPostcheckPreviewProbe | null;
  orchestrationSnapshot: unknown;
  projectId: string | null;
  preloadedFiles?: CodeFile[] | null;
  pendingApprovedProviderKeys?: readonly string[];
  pendingApprovedDossierIds?: readonly string[];
};

/**
 * Full readiness decision: F2 parent (when required), L2 Product Postcheck
 * domain, L6 running-claim, optional L7 preview identity, file-based build
 * spec, stored env. Placeholders are always accepted for build keys
 * (owner decision 2026-07-22).
 *
 * Missing parent, missing env, unknown/`pending`/`indeterminate`/`superseded`
 * domain, an in-flight L6 `running` claim, or a DB error is never `ready: true`.
 */
export async function checkTier3ReadinessForVersion(
  params: CheckTier3ReadinessForVersionParams,
): Promise<Tier3ReadinessResult> {
  if (params.requireF2Parent) {
    const parentId =
      typeof params.parentVersionId === "string" ? params.parentVersionId.trim() : "";
    if (!parentId) {
      return { ready: false, ok: false, reason: "f3_parent_version_missing", retryable: false };
    }
    try {
      const parent = await getVersionById(parentId);
      if (!parent) {
        return {
          ready: false,
          ok: false,
          reason: "f3_parent_version_missing",
          retryable: false,
        };
      }
      if (params.chatId && parent.chat_id !== params.chatId) {
        return {
          ready: false,
          ok: false,
          reason: "f3_parent_version_missing",
          retryable: false,
        };
      }
    } catch (err) {
      console.warn("[tier3-readiness] F2 parent read failed (unavailable):", err);
      return { ready: false, ok: false, reason: "readiness_unavailable", retryable: true };
    }
  }

  const postcheck = await readProductPostcheckVerdictForVersion(
    params.productPostcheckVersionId ?? params.parentVersionId ?? params.versionId,
  );
  if (!f3MayReleaseOnVerdict(postcheck.verdict)) {
    const reason = productPostcheckF3GateReason(postcheck.verdict);
    return {
      ready: false,
      ok: false,
      reason: reason ?? "product_postcheck_pending",
      verdict: postcheck.verdict,
      retryable: postcheck.retryable,
    };
  }

  if (params.previewIdentity && postcheck.verdict === "passed") {
    const filesRevision = params.filesRevision?.trim() || "";
    if (
      !matchesExactPreviewReadinessTuple(params.previewIdentity, {
        versionId: params.versionId,
        filesRevision,
      })
    ) {
      return { ready: false, ok: false, reason: "preview_not_ready", retryable: true };
    }
  }

  const versionFiles =
    params.preloadedFiles !== undefined
      ? params.preloadedFiles
      : await getVersionFiles(params.versionId);
  const snapshotAndPresenceDossiers = resolveSelectedDossiersWithVersionPresence({
    snapshot: params.orchestrationSnapshot,
    versionFiles,
  });
  const pendingDossiers = (params.pendingApprovedDossierIds ?? []).flatMap(
    (dossierId): SelectedDossier[] => {
      const entry = getDossierById(dossierId);
      return entry
        ? [{ entry, reason: "relevance-keyword", configured: false }]
        : [];
    },
  );
  const presentDossierIds = new Set(
    versionFiles
      ? resolveDossiersPresentInVersion(versionFiles).map(
          (selected) => selected.entry.id,
        )
      : [],
  );
  const selectedDossiers = preferPendingIntegrationDossiers({
    selected: snapshotAndPresenceDossiers,
    pending: pendingDossiers,
    preserveDossierIds: presentDossierIds,
  });
  const spec = await deriveTier3BuildSpecForVersion(
    params.versionId,
    selectedDossiers,
    { preloadedFiles: versionFiles ?? [] },
  );
  if (!spec) {
    return { ready: false, ok: false, reason: "version_files_unavailable", retryable: true };
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
  const pendingDossierSpec = deriveTier3BuildSpecForDossierIds(
    params.pendingApprovedDossierIds ?? [],
  );
  const readinessSpec = mergeBuildSpecs(
    mergeBuildSpecs(spec, pendingApprovalSpec),
    pendingDossierSpec,
  );
  if (readinessSpec.requirements.length === 0) {
    return { ready: true, ok: true, spec };
  }

  let projectEnvVars: Record<string, string>;
  try {
    projectEnvVars = params.projectId
      ? await getStoredProjectEnvVarMap(params.projectId)
      : {};
  } catch (err) {
    console.warn("[tier3-readiness] project env read failed (unavailable):", err);
    return { ready: false, ok: false, reason: "readiness_unavailable", retryable: true };
  }
  const readiness = validateTier3Readiness(readinessSpec, projectEnvVars, {
    allowPlaceholdersForBuildKeys: true,
    placeholderEnvKeys: loadPlaceholderKeySet(),
  });
  if (!readiness.ready) {
    return {
      ready: false,
      ok: false,
      reason: "missing_env",
      retryable: false,
      spec: readinessSpec,
      readiness,
    };
  }
  return { ready: true, ok: true, spec: readinessSpec };
}
