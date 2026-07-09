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
import {
  getStoredProjectEnvVarMap,
  readAllowPlaceholdersInF3,
} from "@/lib/project-env-vars";
import {
  deriveTier3BuildSpec,
  validateTier3Readiness,
  type Tier3BuildSpec,
  type Tier3ReadinessReport,
} from "@/lib/integrations/tier3-build-spec";
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

/**
 * Full readiness decision for starting F3 from `versionId`: enforce the
 * Product Postcheck block, derive the file-based build spec, load the
 * project's stored env values, and validate every required real key
 * (honoring the "tillåt placeholders i F3" opt-in).
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
  /** The chat's `orchestration_snapshot` (or null when absent). */
  orchestrationSnapshot: unknown;
  projectId: string | null;
}): Promise<Tier3GateResult> {
  if (await isProductPostcheckBlocked(params.versionId)) {
    return { ok: false, reason: "product_postcheck_blocked" };
  }
  const versionFiles = await getVersionFiles(params.versionId);
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
  if (spec.requirements.length === 0) {
    return { ok: true, spec };
  }

  const projectEnvVars = params.projectId
    ? await getStoredProjectEnvVarMap(params.projectId).catch(
        () => ({}) as Record<string, string>,
      )
    : ({} as Record<string, string>);
  const allowPlaceholdersInF3 = await readAllowPlaceholdersInF3(params.projectId);
  const readiness = validateTier3Readiness(spec, projectEnvVars, {
    allowPlaceholdersForBuildKeys: allowPlaceholdersInF3,
    placeholderEnvKeys: loadPlaceholderKeySet(),
  });
  if (!readiness.ready) {
    return { ok: false, reason: "missing_env", spec, readiness };
  }
  return { ok: true, spec };
}
