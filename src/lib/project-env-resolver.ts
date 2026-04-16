/**
 * Unified project env resolver.
 *
 * Single entry point for answering "what env keys does this project have
 * configured?" across the builder panel, readiness route, and deploy route.
 *
 * Canonical source of truth: app-project env store in
 * `project_data.meta.projectEnvVars`.
 *
 * Placeholder awareness: global preview placeholders
 * (`40-generated-site-integration-placeholders.env.txt`) keep the preview
 * running without real credentials.  `missingEnvKeys` only lists keys that
 * are missing from *both* user config AND placeholders.
 * `placeholderCoveredKeys` lists keys that the user hasn't configured but
 * that already have working preview values — these are deferred to publish
 * (tier 3) and should never block tier 2 preview.
 */

import { getStoredProjectEnvVarMap } from "@/lib/project-env-vars";
import { loadPlaceholderKeySet } from "@/lib/gen/preview/env-local";
import {
  detectIntegrationsFromVersionFiles,
  type DetectedIntegration,
} from "@/lib/gen/detect-integrations";

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

let _cachedPlaceholderKeys: Set<string> | null = null;
function getPlaceholderKeys(): Set<string> {
  if (!_cachedPlaceholderKeys) {
    try {
      _cachedPlaceholderKeys = loadPlaceholderKeySet();
    } catch {
      _cachedPlaceholderKeys = new Set();
    }
  }
  return _cachedPlaceholderKeys;
}

function resolveEnvRequirementsFromDetected(
  detectedIntegrations: DetectedIntegration[],
  env: ResolvedProjectEnv,
): ResolvedProjectEnvRequirements {
  const requiredEnvKeys = dedupeStrings(
    detectedIntegrations.flatMap((integration) => integration.envVars ?? []),
  );
  const configuredEnvKeys = Array.from(env.configuredKeys);
  const placeholderKeys = getPlaceholderKeys();

  const unconfigured = requiredEnvKeys.filter(
    (key) => !env.configuredKeys.has(key),
  );

  const placeholderCoveredKeys = unconfigured.filter((key) =>
    placeholderKeys.has(key),
  );
  const missingEnvKeys = unconfigured.filter(
    (key) => !placeholderKeys.has(key),
  );

  return {
    detectedIntegrations,
    requiredEnvKeys,
    configuredEnvKeys,
    missingEnvKeys,
    placeholderCoveredKeys,
  };
}

export function resolveEnvRequirementsFromVersionFiles(
  files: Array<{ path: string; content: string }>,
  env: ResolvedProjectEnv,
): ResolvedProjectEnvRequirements {
  const detectedIntegrations = detectIntegrationsFromVersionFiles(
    files.map((f) => ({ name: f.path, content: f.content })),
  );
  return resolveEnvRequirementsFromDetected(detectedIntegrations, env);
}
