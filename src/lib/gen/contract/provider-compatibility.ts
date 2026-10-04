import type { DossierSelectionResult, SelectedDossier } from "../dossiers/types";
import { defaultInjectionMode } from "../dossiers/types";
import { selectDossiersForRequest } from "../dossiers/select";
import {
  dossierOutputPathIdentity,
  normalizeDossierProjectPath,
  resolveDossierFilePath,
} from "../dossiers/output-path";
import { getDossierFileContent } from "../dossiers/registry";
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
    | "owned-path-conflict";
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
      decisions.push({
        capability,
        providerKey,
        dossierId: selected.entry.id,
        disposition: "context-only",
        reasonCode: "dossierless-provider",
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
