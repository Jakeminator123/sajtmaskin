/**
 * Public barrel for the dossier system.
 *
 * External callers should import only the symbols listed here. Internal
 * helpers (`getActiveDossiers`, `getAllDossiers`, etc.) are reachable via
 * `./registry` when needed, but most callers should not touch them — the
 * orchestration pipeline calls `selectDossiersForRequest`, which does the
 * registry + filtering + env-preflight in one step.
 */

export { getDossierFileContent } from "./registry";
export { selectDossiersForRequest } from "./select";
export { defaultInjectionMode } from "./types";

export type {
  DossierEntry,
  DossierKind,
  DossierCategory,
  DossierStatus,
  DossierProvider,
  DossierEnvVar,
  DossierFile,
  DossierFileInjectionMode,
  DossierExposes,
  DossierScaffoldFit,
  DossierEmbedding,
  DossierEmbeddingsFile,
  ScaffoldRecommendationBucket,
  ScaffoldRecommendationsFile,
  SelectedDossier,
  DossierSelectionResult,
} from "./types";
export type { SelectDossiersOptions } from "./select";
