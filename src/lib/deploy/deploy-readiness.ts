/**
 * Thin deploy contract: surface env + preflight warnings without changing Vercel behavior.
 * Readiness route remains the primary user-facing gate; deploy logs this for observability.
 * `invalidFiles` fylls när preflight inte kan normalisera en path (t.ex. ogiltig `package.json`); påverkar inte `ready` (env-nycklar styr det).
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
  /** Paths where pre-deploy pipeline could not safely normalize (e.g. invalid package.json). Observability only; `ready` still follows env keys. */
  invalidFilePaths?: string[];
}): DeployReadiness {
  return {
    ready: input.missingEnvKeys.length === 0,
    missingEnv: input.missingEnvKeys,
    invalidFiles: [...(input.invalidFilePaths ?? [])],
    warnings: input.preDeployWarnings,
  };
}
