export {
  getAllDossiers,
  getDossierById,
  getDossiersByCapability,
  getDossierInstructions,
  getDossierFileContent,
  getCapabilityMap,
  clearDossierRegistryCache,
} from "./registry";

export { selectDossiersForRequest } from "./select";
export type { SelectDossiersOptions } from "./select";

export { defaultInjectionMode } from "./types";
export type {
  DossierClass,
  CodeFidelity,
  DossierComplexity,
  Capability,
  DossierEnvVar,
  DossierFile,
  DossierExposes,
  DossierEntry,
  SelectedDossier,
  DossierSelectionResult,
} from "./types";
