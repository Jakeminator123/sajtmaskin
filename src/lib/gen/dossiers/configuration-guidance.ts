import type {
  DossierConfigInput,
  DossierEntry,
  DossierEnvVar,
  DossierProviderSetupStep,
} from "./types";

export interface ProjectedDossierProviderSetupStep
  extends Omit<DossierProviderSetupStep, "references"> {
  referencedEnvVars: DossierEnvVar[];
  referencedConfigInputs: DossierConfigInput[];
}

export interface DossierConfigurationGuidance {
  configInputs: DossierConfigInput[];
  providerSetup: ProjectedDossierProviderSetupStep[];
}

/**
 * Pure consumer projection for prompt/UI layers. Registry validation owns
 * reference integrity; this helper only resolves ordered references and never
 * computes configured/readiness/acceptance state.
 */
export function projectDossierConfigurationGuidance(
  entry: Pick<DossierEntry, "envVars" | "configInputs" | "providerSetup">,
): DossierConfigurationGuidance {
  const configInputs = (entry.configInputs ?? []).map((input) => ({ ...input }));
  const envByKey = new Map((entry.envVars ?? []).map((envVar) => [envVar.key, envVar]));
  const inputById = new Map(configInputs.map((input) => [input.id, input]));

  return {
    configInputs,
    providerSetup: (entry.providerSetup ?? []).map((step) => ({
      id: step.id,
      title: step.title,
      instruction: step.instruction,
      ...(step.setupUrl ? { setupUrl: step.setupUrl } : {}),
      referencedEnvVars: (step.references?.envVarKeys ?? [])
        .map((key) => envByKey.get(key))
        .filter((value): value is DossierEnvVar => value !== undefined)
        .map((value) => ({ ...value })),
      referencedConfigInputs: (step.references?.configInputIds ?? [])
        .map((id) => inputById.get(id))
        .filter((value): value is DossierConfigInput => value !== undefined)
        .map((value) => ({ ...value })),
    })),
  };
}
