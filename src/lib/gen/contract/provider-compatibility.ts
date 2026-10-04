import type { DossierEntry, DossierSelectionResult, SelectedDossier } from "../dossiers/types";
import { defaultInjectionMode } from "../dossiers/types";
import { selectDossiersForRequest } from "../dossiers/select";
import {
  dossierOutputPathIdentity,
  normalizeDossierProjectPath,
  resolveDossierFilePath,
} from "../dossiers/output-path";
import { getDossierFileContent } from "../dossiers/registry";
import { resolveDossiersPresentInVersion } from "../dossiers/version-presence";
import { projectDossierIntegration } from "../dossiers/integration";
import type { PlanContracts, PlanIntegrationContract } from "../plan/schema";
import type { ProjectProviderEvidence } from "./project-provider-evidence";

type ProjectFile = { path: string; content: string };

export type DossierIntegrationDecision = {
  capability: string;
  providerKey?: string;
  dossierId?: string;
  disposition: "dossier-supported" | "context-only" | "blocked";
  reasonCode:
    | "compatible"
    | "dossierless-provider"
    | "method-incompatible"
    | "provider-unresolved"
    | "existing-provider-core"
    | "owned-path-conflict";
};

type ExistingProviderCore = {
  dossierId: string;
  providerKeys: readonly string[];
  provenByProviderEvidence: boolean;
  canonicalProtectedBytes: boolean;
};

function methodKindForCapability(
  capability: string,
): PlanIntegrationContract["kind"] | undefined {
  if (capability === "database") return "database";
  if (capability === "payments") return "payment";
  if (capability === "auth") return "auth";
  return undefined;
}

function selectedSupportsMethod(selected: SelectedDossier, methodKey: string): boolean {
  return (selected.entry.dependencies ?? []).some((dependency) => {
    const normalized = dependency.toLowerCase();
    return (
      normalized === methodKey ||
      normalized.startsWith(`${methodKey}-`) ||
      normalized.startsWith(`@${methodKey}/`)
    );
  });
}

function contractForCapability(
  contracts: PlanContracts,
  capability: string,
): PlanIntegrationContract | undefined {
  return contracts.integrations.find(
    (contract) => contract.dossierCapability?.toLowerCase() === capability.toLowerCase(),
  );
}

function hasOwnedPathConflict(
  selected: SelectedDossier,
  projectFiles: readonly ProjectFile[],
): boolean {
  const actual = new Map(
    projectFiles.map((file) => [
      dossierOutputPathIdentity(normalizeDossierProjectPath(file.path)),
      file.content,
    ]),
  );
  const allClaims = (selected.entry.files ?? []).map((file) => ({
    file,
    resolved: resolveDossierFilePath(file.path),
  }));
  const ownedClaims = allClaims.filter(
    ({ file }) => file.role === "server" || defaultInjectionMode(file, selected.entry) === "verbatim",
  );
  const occupiedOwnedClaims = ownedClaims.filter(({ resolved }) =>
    actual.has(resolved.outputIdentity),
  );
  const canonicalCoreAlreadyPresent =
    occupiedOwnedClaims.length > 0 &&
    occupiedOwnedClaims.every(({ file, resolved }) => {
      const canonical = getDossierFileContent(selected.entry.class, selected.entry.id, file.path);
      return canonical !== null && actual.get(resolved.outputIdentity) === canonical;
    });
  if (canonicalCoreAlreadyPresent) return false;
  return occupiedOwnedClaims.length > 0;
}

function existingProviderCoresForCapability(params: {
  capability: string;
  projectFiles: readonly ProjectFile[];
  projectProviderEvidence: readonly ProjectProviderEvidence[];
}): ExistingProviderCore[] {
  const exactFiles = new Map(params.projectFiles.map((file) => [file.path, file.content]));
  return resolveDossiersPresentInVersion(params.projectFiles)
    .map((selected) => selected.entry)
    .filter((entry) => entry.capability.toLowerCase() === params.capability)
    .map((entry) => {
      const providerKeys = (entry.providers ?? []).map((provider) => provider.toLowerCase());
      const protectedFiles = projectDossierIntegration(entry).files.filter(
        (file) => file.injectionMode === "verbatim",
      );
      const canonicalProtectedBytes =
        protectedFiles.length > 0 &&
        protectedFiles.every((file) => {
          const canonical = getDossierFileContent(entry.class, entry.id, file.sourcePath);
          return canonical !== null && exactFiles.get(file.outputPath) === canonical;
        });
      return {
        dossierId: entry.id,
        providerKeys,
        provenByProviderEvidence: params.projectProviderEvidence.some(
          (evidence) =>
            evidence.dossierCapability?.toLowerCase() === params.capability &&
            providerKeys.includes(evidence.providerKey.toLowerCase()),
        ),
        canonicalProtectedBytes,
      };
    });
}

export function buildDossierIntegrationPlan(params: {
  contracts: PlanContracts;
  dossierSelection: DossierSelectionResult;
  projectFiles: readonly ProjectFile[];
  projectProviderEvidence?: readonly ProjectProviderEvidence[];
  allowLegacyMissingContracts?: boolean;
}): {
  contracts: PlanContracts;
  dossierSelection: DossierSelectionResult;
  decisions: DossierIntegrationDecision[];
} {
  const contracts: PlanContracts = {
    ...params.contracts,
    integrations: [...params.contracts.integrations],
  };
  const kept: SelectedDossier[] = [];
  const decisions: DossierIntegrationDecision[] = [];
  for (const selected of params.dossierSelection.selected) {
    const capability = selected.entry.capability.toLowerCase();
    const existingProviderCores = existingProviderCoresForCapability({
      capability,
      projectFiles: params.projectFiles,
      projectProviderEvidence: params.projectProviderEvidence ?? [],
    });
    let contract = contractForCapability(contracts, capability);
    if (!contract) {
      const evidence = (params.projectProviderEvidence ?? []).filter(
        (item) => item.dossierCapability?.toLowerCase() === capability,
      );
      const providerKeys = Array.from(new Set(evidence.map((item) => item.providerKey)));
      if (providerKeys.length === 1) {
        const proven = evidence.find((item) => item.providerKey === providerKeys[0]);
        contract = {
          kind: proven?.kind,
          providerKey: providerKeys[0],
          dossierCapability: capability,
          provider: providerKeys[0],
          name: providerKeys[0],
          reason: "Existing project dependency and runtime import prove this provider.",
          status: "chosen",
        };
        contracts.integrations.push(contract);
      } else if (providerKeys.length > 1) {
        contract = {
          dossierCapability: capability,
          provider: `${capability} provider not selected`,
          name: `${capability} provider not selected`,
          reason: "The project contains runtime proof for multiple providers; choose one.",
          status: "unresolved",
        };
        contracts.integrations.push(contract);
      }
    }
    if (!contract) {
      if (hasOwnedPathConflict(selected, params.projectFiles)) {
        decisions.push({
          capability,
          dossierId: selected.entry.id,
          disposition: "blocked",
          reasonCode: "owned-path-conflict",
        });
        continue;
      }
      if (params.allowLegacyMissingContracts) {
        kept.push(selected);
        decisions.push({
          capability,
          dossierId: selected.entry.id,
          disposition: "dossier-supported",
          reasonCode: "compatible",
        });
        continue;
      }
      const providers = selected.entry.providers ?? [];
      if (providers.length === 0) {
        kept.push(selected);
        continue;
      }
      const providerKey = providers.length === 1 ? providers[0].toLowerCase() : undefined;
      if (!providerKey) {
        decisions.push({
          capability,
          dossierId: selected.entry.id,
          disposition: "blocked",
          reasonCode: "provider-unresolved",
        });
        continue;
      }
      contract = {
        kind: "integration",
        providerKey,
        dossierCapability: capability,
        selectionSource: "dossier-default",
        provider: providerKey,
        name: selected.entry.label,
        reason: `Dossier registry default for ${selected.entry.id}.`,
        status: "chosen",
        envVars: (selected.entry.envVars ?? []).map((entry) => entry.key),
      };
      contracts.integrations.push(contract);
    }
    const providerKey = contract.providerKey?.toLowerCase();
    const providers = (selected.entry.providers ?? []).map((provider) => provider.toLowerCase());
    if (contract.status === "unresolved" || !providerKey) {
      decisions.push({
        capability,
        dossierId: selected.entry.id,
        disposition: "blocked",
        reasonCode: "provider-unresolved",
      });
      continue;
    }
    if (!providers.includes(providerKey)) {
      const provenForeignCore = existingProviderCores.some(
        (core) =>
          !core.providerKeys.includes(providerKey) &&
          (core.provenByProviderEvidence || core.canonicalProtectedBytes),
      );
      if (provenForeignCore) {
        decisions.push({
          capability,
          providerKey,
          dossierId: selected.entry.id,
          disposition: "blocked",
          reasonCode: "owned-path-conflict",
        });
        continue;
      }
      decisions.push({
        capability,
        providerKey,
        dossierId: selected.entry.id,
        disposition: "context-only",
        reasonCode: "dossierless-provider",
      });
      continue;
    }
    const sameProviderExistingCore = existingProviderCores.some(
      (core) =>
        core.dossierId === selected.entry.id &&
        core.providerKeys.includes(providerKey) &&
        core.provenByProviderEvidence,
    );
    if (sameProviderExistingCore && hasOwnedPathConflict(selected, params.projectFiles)) {
      decisions.push({
        capability,
        providerKey,
        dossierId: selected.entry.id,
        disposition: "context-only",
        reasonCode: "existing-provider-core",
      });
      continue;
    }
    const methodKind = methodKindForCapability(capability);
    const methodKeys = new Set<string>();
    if (methodKind) {
      for (const method of contracts.integrations) {
        if (
          method.kind === methodKind &&
          !method.dossierCapability &&
          method.providerKey &&
          method.status === "chosen"
        ) {
          methodKeys.add(method.providerKey.toLowerCase());
        }
      }
      for (const evidence of params.projectProviderEvidence ?? []) {
        if (
          evidence.kind === methodKind &&
          !evidence.dossierCapability &&
          evidence.providerKey
        ) {
          methodKeys.add(evidence.providerKey.toLowerCase());
        }
      }
    }
    const incompatibleMethod = Array.from(methodKeys).find(
      (methodKey) => !selectedSupportsMethod(selected, methodKey),
    );
    if (incompatibleMethod) {
      decisions.push({
        capability,
        providerKey: incompatibleMethod,
        dossierId: selected.entry.id,
        disposition: "context-only",
        reasonCode: "method-incompatible",
      });
      continue;
    }
    if (hasOwnedPathConflict(selected, params.projectFiles)) {
      decisions.push({
        capability,
        providerKey,
        dossierId: selected.entry.id,
        disposition: "blocked",
        reasonCode: "owned-path-conflict",
      });
      continue;
    }
    kept.push(selected);
    decisions.push({
      capability,
      providerKey,
      dossierId: selected.entry.id,
      disposition: "dossier-supported",
      reasonCode: "compatible",
    });
  }
  const byCapability: Record<string, string[]> = {};
  for (const selected of kept) {
    (byCapability[selected.entry.capability] ??= []).push(selected.entry.id);
  }
  return {
    contracts,
    dossierSelection: { ...params.dossierSelection, selected: kept, byCapability },
    decisions,
  };
}

export function resolveProviderContractDossierPlan(params: {
  contract: PlanIntegrationContract;
  contracts?: readonly PlanIntegrationContract[];
  projectFiles: readonly ProjectFile[];
  projectProviderEvidence?: readonly ProjectProviderEvidence[];
  configuredEnvKeys?: ReadonlySet<string>;
}): ReturnType<typeof buildDossierIntegrationPlan> {
  const capability = params.contract.dossierCapability;
  if (!capability) {
    return buildDossierIntegrationPlan({
      contracts: {
        dataMode: "unknown",
        integrations: [...(params.contracts ?? [params.contract])],
        envVars: [],
      },
      dossierSelection: { selected: [], poolSize: 0, byCapability: {} },
      projectFiles: params.projectFiles,
      projectProviderEvidence: params.projectProviderEvidence,
    });
  }
  return buildDossierIntegrationPlan({
    contracts: {
      dataMode: "unknown",
      integrations: [...(params.contracts ?? [params.contract])],
      envVars: [],
    },
    dossierSelection: selectDossiersForRequest({
      requestedCapabilities: [capability],
      disableBriefFallback: true,
      promptText: params.contract.providerKey,
      configuredEnvKeys: params.configuredEnvKeys,
    }),
    projectFiles: params.projectFiles,
    projectProviderEvidence: params.projectProviderEvidence,
  });
}

export function resolveExistingDossierCorePlan(params: {
  contracts: readonly PlanIntegrationContract[];
  projectFiles: readonly ProjectFile[];
  projectProviderEvidence?: readonly ProjectProviderEvidence[];
  removedDossierIds?: ReadonlySet<string>;
  removedCapabilities?: ReadonlySet<string>;
}): {
  preservedDossiers: DossierEntry[];
  migrationRequired: boolean;
  decisions: DossierIntegrationDecision[];
} {
  const evidence = params.projectProviderEvidence ?? [];
  const present = resolveDossiersPresentInVersion(params.projectFiles)
    .map((selected) => selected.entry)
    .filter(
      (entry) =>
        !params.removedDossierIds?.has(entry.id) &&
        !params.removedCapabilities?.has(entry.capability.toLowerCase()),
    );
  const decisions: DossierIntegrationDecision[] = [];
  const preservedDossiers: DossierEntry[] = [];
  let migrationRequired = false;
  const contracts: PlanContracts = {
    dataMode: "unknown",
    integrations: [...params.contracts],
    envVars: [],
  };
  const provenProvidersByCapability = new Map<string, Set<string>>();
  for (const providerEvidence of evidence) {
    const capability = providerEvidence.dossierCapability?.toLowerCase();
    if (!capability || params.removedCapabilities?.has(capability)) continue;
    const providers = provenProvidersByCapability.get(capability) ?? new Set<string>();
    providers.add(providerEvidence.providerKey.toLowerCase());
    provenProvidersByCapability.set(capability, providers);
    const target = contractForCapability(contracts, capability);
    const targetProvider =
      target?.status === "chosen" ? target.providerKey?.toLowerCase() : null;
    if (targetProvider && targetProvider !== providerEvidence.providerKey.toLowerCase()) {
      migrationRequired = true;
    }
  }
  for (const entry of present) {
    const capability = entry.capability.toLowerCase();
    const plan = buildDossierIntegrationPlan({
      contracts,
      dossierSelection: {
        selected: [{ entry, reason: "capability-match", configured: false }],
        poolSize: 0,
        byCapability: { [capability]: [entry.id] },
      },
      projectFiles: params.projectFiles,
      projectProviderEvidence: evidence,
    });
    decisions.push(...plan.decisions);
    const cores = existingProviderCoresForCapability({
      capability,
      projectFiles: params.projectFiles,
      projectProviderEvidence: evidence,
    });
    const currentCore = cores.find((core) => core.dossierId === entry.id);
    if (
      currentCore?.provenByProviderEvidence &&
      !preservedDossiers.some((dossier) => dossier.id === entry.id)
    ) {
      preservedDossiers.push(entry);
    }
    const provenProviders = provenProvidersByCapability.get(capability) ?? new Set<string>();
    for (const core of cores) {
      if (!core.provenByProviderEvidence && !core.canonicalProtectedBytes) continue;
      for (const providerKey of core.providerKeys) provenProviders.add(providerKey);
    }
    provenProvidersByCapability.set(capability, provenProviders);
    const target = contractForCapability(contracts, capability);
    const targetProvider =
      target?.status === "chosen" ? target.providerKey?.toLowerCase() : null;
    if (
      targetProvider &&
      cores.some(
        (core) =>
          !core.providerKeys.includes(targetProvider) &&
          (core.provenByProviderEvidence || core.canonicalProtectedBytes),
      )
    ) {
      migrationRequired = true;
      if (!preservedDossiers.some((dossier) => dossier.id === entry.id)) {
        preservedDossiers.push(entry);
      }
    }
  }
  for (const [capability, providers] of provenProvidersByCapability) {
    if (providers.size <= 1) continue;
    migrationRequired = true;
    const provenCores = existingProviderCoresForCapability({
      capability,
      projectFiles: params.projectFiles,
      projectProviderEvidence: evidence,
    }).filter((core) => core.provenByProviderEvidence || core.canonicalProtectedBytes);
    for (const entry of present) {
      if (entry.capability.toLowerCase() !== capability) continue;
      if (!provenCores.some((core) => core.dossierId === entry.id)) continue;
      if (!preservedDossiers.some((dossier) => dossier.id === entry.id)) {
        preservedDossiers.push(entry);
      }
    }
  }
  return { preservedDossiers, migrationRequired, decisions };
}
