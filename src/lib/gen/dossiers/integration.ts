import {
  projectDossierConfigurationGuidance,
  type DossierConfigurationGuidance,
} from "./configuration-guidance";
import { resolveDossierFilePath } from "./output-path";
import {
  defaultInjectionMode,
  dossierRequiresF3,
  type CodeFidelity,
  type DossierEntry,
  type DossierFile,
} from "./types";

export interface DossierIntegrationFile extends DossierFile {
  sourcePath: string;
  outputPath: string;
  outputIdentity: string;
  injectionMode: CodeFidelity;
}

export interface DossierIntegrationView extends DossierConfigurationGuidance {
  files: DossierIntegrationFile[];
  requiresF3: boolean;
}

/**
 * Shared, request-local projection for prompt composition and materialization.
 * Existing owners still decide paths, fidelity, references and F3 requirements.
 * This is not a new pipeline stage, persistent record or readiness/status gate.
 */
export function projectDossierIntegration(entry: DossierEntry): DossierIntegrationView {
  return {
    ...projectDossierConfigurationGuidance(entry),
    requiresF3: dossierRequiresF3(entry),
    files: (entry.files ?? []).map((file) => ({
      ...file,
      ...resolveDossierFilePath(file.path),
      injectionMode: defaultInjectionMode(file, entry),
    })),
  };
}
