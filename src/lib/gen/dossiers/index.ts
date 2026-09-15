export {
  getAllDossiers,
  getDossierById,
  getDossiersByCapability,
  getDossierInstructions,
  getDossierFileContent,
  getDossierExposesByImportPath,
  getCapabilityMap,
  getF3RequiredCapabilities,
  clearDossierRegistryCache,
} from "./registry";
export type { DossierExposesInfo } from "./registry";

export { getF2MutedIntegrationCapabilities } from "./f2-mute";

export {
  selectDossiersForRequest,
  isExplicitDossierChoice,
  expandDependentCapabilities,
  normalizeCapabilityId,
  isDossierConfigured,
} from "./select";
export type { SelectDossiersOptions } from "./select";

export {
  resolveDossierIdsPresentInVersion,
  resolveDossiersPresentInVersion,
  resolveCapabilitiesPresentInVersion,
  resolveSelectedDossiersWithVersionPresence,
} from "./version-presence";

export { resolveDossierLifecycle } from "./lifecycle";
export type {
  DossierLifecycleRequirementEvidence,
  DossierLifecycleResolution,
  DossierLifecycleOverviewStatus,
  DossierLifecycleVersionFile,
  ResolveDossierLifecycleInput,
} from "./lifecycle";

export { resolvePendingIntegrationDossiers } from "./pending-integrations";
export { preferPendingIntegrationDossiers } from "./pending-integrations";
export { isPlannedDossierCoveredByModelBuiltBlock } from "./pending-integrations";
export {
  alignDatabaseMarker,
  resolveEffectiveF3ApprovedProviders,
  resolveSelectedDatabaseDossier,
} from "./align-database-marker";

export { defaultInjectionMode, dossierRequiresF3 } from "./types";
export type {
  DossierClass,
  CodeFidelity,
  DossierComplexity,
  Capability,
  DossierEnvVar,
  DossierFile,
  DossierExposes,
  DossierEntry,
  DossierMockMode,
  SelectedDossier,
  DossierSelectionResult,
} from "./types";
