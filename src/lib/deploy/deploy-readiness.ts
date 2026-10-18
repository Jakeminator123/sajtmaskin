/**
 * Thin deploy contract: surface env + package-tree blockers and preflight warnings.
 * Readiness route remains the primary user-facing gate; deploy logs this for observability.
 * `invalidFiles` fylls när preflight inte kan normalisera en path; påverkar inte ensamt `ready` (env och paketspärr styr det).
 * Samma ogiltiga strikta JSON-filer (`package.json`, `components.json`, `jsconfig.json`) på den **sparade versionen** ger **readiness-blocker** via `findInvalidJsonConfigPaths` i `version-file-integrity.ts` (tidigare varning i UI).
 * Se `docs/architecture/llm-pipeline.md` (detalj: arkiv `deploy-precheck.md`) för hela preflight-kedjan (auto-fixar, 409, precheckOnly).
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
  /** Paths where pre-deploy pipeline could not safely normalize. Observability only, not an independent blocker. */
  invalidFilePaths?: string[];
  /** Same package-tree verdict as sharp deploy; warnings alone must not hide a blocker. */
  packageTreeAllowed?: boolean;
}): DeployReadiness {
  return {
    ready: input.missingEnvKeys.length === 0 && input.packageTreeAllowed !== false,
    missingEnv: input.missingEnvKeys,
    invalidFiles: [...(input.invalidFilePaths ?? [])],
    warnings: input.preDeployWarnings,
  };
}
