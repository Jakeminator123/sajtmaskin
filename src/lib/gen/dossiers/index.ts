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

export { resolvePendingIntegrationDossiers } from "./pending-integrations";
export { preferPendingIntegrationDossiers } from "./pending-integrations";

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
