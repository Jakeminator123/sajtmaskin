/**
 * Unified project env resolver.
 *
 * Single entry point for answering "what env keys does this project have
 * configured?" across the builder panel, readiness route, and deploy route.
 *
 * Canonical source of truth: app-project env store in
 * `project_data.meta.projectEnvVars`.
 *
 * Placeholder awareness: global preview placeholders (split since 2026-04
 * into `40-harmless-placeholders.env.txt` + `41-tier3-stub-placeholders.env.txt`)
 * keep the preview running without real credentials. `missingEnvKeys` only
 * lists keys that are missing from *both* user config AND placeholders.
 * `placeholderCoveredKeys` lists keys that the user hasn't configured but
 * that already have working preview values — these are deferred to publish
 * (F3 / "Bygg integrationer") and should never block F2 preview.
 *
 * Per-key tier classification (harmless vs tier-3) lives in
 * `src/lib/integrations/placeholder-harmless.ts`. The F3 readiness gate
 * (`src/lib/integrations/tier3-build-spec.ts`) refuses to start an
 * integrations build until every required tier-3 key has a real value.
 */

import { getStoredProjectEnvVarMap } from "@/lib/project-env-vars";
import {
  loadPlaceholderKeySet,
  type PreviewLifecycleStage,
} from "@/lib/gen/preview/env-local";
import {
  detectIntegrationsFromVersionFiles,
  type DetectedIntegration,
} from "@/lib/gen/detect-integrations";
import type {
  DossierEnvVarEnforcement,
  SelectedDossier,
} from "@/lib/gen/dossiers/types";

export type ResolvedProjectEnv = {
  source: "app-project" | "none";
  projectId: string | null;
  configuredKeys: Set<string>;
  configuredMap: Record<string, string>;
};

export type ResolvedProjectEnvRequirements = {
  detectedIntegrations: DetectedIntegration[];
  requiredEnvKeys: string[];
  configuredEnvKeys: string[];
  /** Keys missing from both user config and placeholders — truly absent. */
  missingEnvKeys: string[];
  /** Keys the user hasn't configured but that have a preview placeholder. */
  placeholderCoveredKeys: string[];
  /**
   * Subset of `requiredEnvKeys` whose enforcement is `"build"` AND that are
   * actually missing (not configured AND not allowed via the F3 toggle when
   * placeholder-covered). These are the only keys that block F3.
   */
  buildBlockingKeys: string[];
  /**
   * UNCONFIGURED keys whose dossier marks them `"feature-runtime"` (UI
   * mounts a configuration banner / popup at runtime when missing).
   * Surfaced as informational warnings, never as blockers. Configured
   * `feature-runtime` keys are intentionally excluded — they would
   * otherwise display "configuration required" copy even after the user
   * sets them.
   */
  featureRuntimeKeys: string[];
  /**
   * UNCONFIGURED keys whose dossier marks them `"warn-only"` (component
   * self-disables on empty value). Surfaced only as info; never blocks.
   * Configured warn-only keys are excluded for the same reason as
   * `featureRuntimeKeys`.
   */
  warnOnlyKeys: string[];
};

export async function resolveProjectEnv(
  appProjectId: string | null,
): Promise<ResolvedProjectEnv> {
  if (!appProjectId) {
    return {
      source: "none",
      projectId: null,
      configuredKeys: new Set(),
      configuredMap: {},
    };
  }

  const configuredMap = await getStoredProjectEnvVarMap(appProjectId).catch(
    () => ({} as Record<string, string>),
  );
  const configuredKeys = new Set(
    Object.keys(configuredMap)
      .map((key) => key.trim().toUpperCase())
      .filter(Boolean),
  );

  return {
    source: "app-project",
    projectId: appProjectId,
    configuredKeys,
    configuredMap,
  };
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

const _cachedPlaceholderKeys = new Map<string, Set<string>>();
function getPlaceholderKeys(params: {
  lifecycleStage: PreviewLifecycleStage;
  allowPlaceholdersInF3: boolean;
}): Set<string> {
  const includeTier3Stubs =
    params.lifecycleStage !== "integrations" || params.allowPlaceholdersInF3;
  const cacheKey = includeTier3Stubs ? "with-tier3" : "harmless-only";
  const cached = _cachedPlaceholderKeys.get(cacheKey);
  if (!cached) {
    try {
      const next = loadPlaceholderKeySet({ includeTier3Stubs });
      _cachedPlaceholderKeys.set(cacheKey, next);
      return next;
    } catch {
      const empty = new Set<string>();
      _cachedPlaceholderKeys.set(cacheKey, empty);
      return empty;
    }
  }
  return cached;
}

/**
 * Build a flat enforcement lookup from all detected integrations. Per-key
 * enforcement defaults to `"build"` (safe / pre-Phase-3 behaviour) when the
 * detection pipeline did not have dossier metadata available.
 */
function flattenEnforcement(
  integrations: DetectedIntegration[],
): Map<string, DossierEnvVarEnforcement> {
  const map = new Map<string, DossierEnvVarEnforcement>();
  for (const integration of integrations) {
    const enforcementMap = integration.envEnforcement ?? {};
    for (const key of integration.envVars) {
      if (map.has(key)) continue;
      map.set(key, enforcementMap[key] ?? "build");
    }
  }
  return map;
}

/**
 * @internal exported for unit-testing the enforcement bucketing without
 * pulling in the database client (which `resolveProjectEnv` requires).
 */
export function resolveEnvRequirementsFromDetected(
  detectedIntegrations: DetectedIntegration[],
  env: ResolvedProjectEnv,
  options: {
    allowPlaceholdersInF3?: boolean;
    lifecycleStage?: PreviewLifecycleStage;
  } = {},
): ResolvedProjectEnvRequirements {
  const requiredEnvKeys = dedupeStrings(
    detectedIntegrations.flatMap((integration) => integration.envVars ?? []),
  );
  const configuredEnvKeys = Array.from(env.configuredKeys);
  const allowPlaceholdersInF3 = options.allowPlaceholdersInF3 === true;
  const lifecycleStage = options.lifecycleStage ?? "design";
  const placeholderKeys = getPlaceholderKeys({ lifecycleStage, allowPlaceholdersInF3 });
  const enforcement = flattenEnforcement(detectedIntegrations);

  const unconfigured = requiredEnvKeys.filter(
    (key) => !env.configuredKeys.has(key),
  );

  // Bucket every UNCONFIGURED key into its enforcement class so callers can
  // present the right severity. A key can only be in one bucket. Configured
  // keys are dropped here on purpose: a `feature-runtime` key the user has
  // already set should never surface as "configuration required" in the UI.
  const buildKeys = unconfigured.filter(
    (key) => (enforcement.get(key) ?? "build") === "build",
  );
  const featureRuntimeKeys = unconfigured.filter(
    (key) => enforcement.get(key) === "feature-runtime",
  );
  const warnOnlyKeys = unconfigured.filter(
    (key) => enforcement.get(key) === "warn-only",
  );

  // `placeholderCoveredKeys` = keys that have a preview placeholder AND are
  // unconfigured. They surface as a warning in the readiness card.
  const placeholderCoveredKeys = unconfigured.filter((key) =>
    placeholderKeys.has(key),
  );

  // Truly absent (legacy meaning preserved): unconfigured AND no placeholder.
  // Backwards compatible for callers that have not migrated.
  const missingEnvKeys = unconfigured.filter(
    (key) => !placeholderKeys.has(key),
  );

  // Phase-4 narrowing: blocking-set is the `build`-enforcement subset of
  // unconfigured keys, minus placeholder-covered keys when the F3 toggle
  // is on. (Configured keys were already filtered out via `unconfigured`.)
  const buildBlockingKeys = buildKeys.filter((key) => {
    if (allowPlaceholdersInF3 && placeholderKeys.has(key)) return false;
    return true;
  });

  return {
    detectedIntegrations,
    requiredEnvKeys,
    configuredEnvKeys,
    missingEnvKeys,
    placeholderCoveredKeys,
    buildBlockingKeys,
    featureRuntimeKeys,
    warnOnlyKeys,
  };
}

export function resolveEnvRequirementsFromVersionFiles(
  files: Array<{ path: string; content: string }>,
  env: ResolvedProjectEnv,
  options: {
    lifecycleStage?: PreviewLifecycleStage;
    selectedDossiers?: SelectedDossier[];
    allowPlaceholdersInF3?: boolean;
  } = {},
): ResolvedProjectEnvRequirements {
  const detectedIntegrations = detectIntegrationsFromVersionFiles(
    files.map((f) => ({ name: f.path, content: f.content })),
    {
      lifecycleStage: options.lifecycleStage,
      selectedDossiers: options.selectedDossiers,
    },
  );
  return resolveEnvRequirementsFromDetected(detectedIntegrations, env, {
    allowPlaceholdersInF3: options.allowPlaceholdersInF3,
    lifecycleStage: options.lifecycleStage,
  });
}
