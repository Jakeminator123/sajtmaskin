/**
 * Thin deploy contract: surface env + preflight warnings without changing Vercel behavior.
 * Readiness route remains the primary user-facing gate; deploy logs this for observability.
 */
export type DeployReadiness = {
  ready: boolean;
  missingEnv: string[];
  invalidFiles: string[];
  warnings: string[];
};

export function buildDeployReadiness(input: {
  missingEnvKeys: string[];
  preDeployWarnings: string[];
}): DeployReadiness {
  return {
    ready: input.missingEnvKeys.length === 0,
    missingEnv: input.missingEnvKeys,
    invalidFiles: [],
    warnings: input.preDeployWarnings,
  };
}
