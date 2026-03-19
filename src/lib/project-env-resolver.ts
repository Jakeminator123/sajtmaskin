/**
 * Unified project env resolver.
 *
 * Single entry point for answering "what env keys does this project have
 * configured?" across the builder panel, readiness route, and deploy route.
 *
 * Canonical source of truth: app-project env store in
 * `project_data.meta.projectEnvVars`.
 */

import { getStoredProjectEnvVarMap } from "@/lib/project-env-vars";
import { detectIntegrations, type DetectedIntegration } from "@/lib/gen/detect-integrations";

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
  missingEnvKeys: string[];
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

export function resolveEnvRequirements(
  code: string,
  env: ResolvedProjectEnv,
): ResolvedProjectEnvRequirements {
  const detectedIntegrations = detectIntegrations(code);
  const requiredEnvKeys = dedupeStrings(
    detectedIntegrations.flatMap((integration) => integration.envVars ?? []),
  );
  const configuredEnvKeys = Array.from(env.configuredKeys);
  const missingEnvKeys = requiredEnvKeys.filter(
    (key) => !env.configuredKeys.has(key),
  );

  return {
    detectedIntegrations,
    requiredEnvKeys,
    configuredEnvKeys,
    missingEnvKeys,
  };
}
