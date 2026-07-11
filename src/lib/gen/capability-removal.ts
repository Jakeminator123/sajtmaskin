import type { InferredCapabilities } from "./capability-inference";
import { INFERRED_CAPABILITY_DOSSIER_BRIDGE } from "./capability-dossier-bridge";
import type { PreGenerationContractContext } from "./contract/pre-generation-contracts";
import type { DossierEntry } from "./dossiers";
import { mapProviderKeysToDossierCapabilities } from "@/lib/integrations/tier3-build-spec";

function normalizeCapabilitySet(values: readonly string[]): Set<string> {
  return new Set(
    values
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function providerMatchesRemovedCapability(
  provider: string | null | undefined,
  removed: ReadonlySet<string>,
): boolean {
  if (!provider) return false;
  return mapProviderKeysToDossierCapabilities([provider]).some((capability) =>
    removed.has(capability.toLowerCase()),
  );
}

/**
 * Explicit capability removal must win over raw prompt inference. Otherwise
 * "ta bort Stripe" still sets `needsPayments` from the word Stripe and feeds
 * payment hints/contracts back into the same generation.
 */
export function suppressRemovedInferredCapabilities(
  capabilities: InferredCapabilities,
  removedCapabilities: readonly string[],
): InferredCapabilities {
  const removed = normalizeCapabilitySet(removedCapabilities);
  if (removed.size === 0) return capabilities;
  const next: InferredCapabilities = { ...capabilities };
  for (const entry of INFERRED_CAPABILITY_DOSSIER_BRIDGE) {
    if (
      entry.dossierCapabilities.some((capability) =>
        removed.has(capability.toLowerCase()),
      )
    ) {
      next[entry.flag] = false;
    }
  }
  return next;
}

/**
 * Remove provider/env contract residue for capabilities the user explicitly
 * removed. Provider→capability mapping reuses the same registry-backed owner as
 * F3 approval, avoiding a second provider alias table.
 */
export function filterRemovedCapabilitiesFromContracts(
  context: PreGenerationContractContext,
  removedCapabilities: readonly string[],
): PreGenerationContractContext {
  const removed = normalizeCapabilitySet(removedCapabilities);
  if (removed.size === 0) return context;

  const removedIntegrations = context.contracts.integrations.filter((integration) =>
    providerMatchesRemovedCapability(integration.provider, removed),
  );
  const retainedIntegrations = context.contracts.integrations.filter(
    (integration) => !removedIntegrations.includes(integration),
  );
  const retainedEnvKeys = new Set(
    retainedIntegrations.flatMap((integration) => integration.envVars ?? []),
  );
  const removedOnlyEnvKeys = new Set(
    removedIntegrations
      .flatMap((integration) => integration.envVars ?? [])
      .filter((key) => !retainedEnvKeys.has(key)),
  );

  const contracts = {
    ...context.contracts,
    integrations: retainedIntegrations,
    envVars: context.contracts.envVars.filter(
      (envVar) => !removedOnlyEnvKeys.has(envVar.key),
    ),
    databaseProvider: providerMatchesRemovedCapability(
      context.contracts.databaseProvider,
      removed,
    )
      ? undefined
      : context.contracts.databaseProvider,
    authProvider: providerMatchesRemovedCapability(
      context.contracts.authProvider,
      removed,
    )
      ? undefined
      : context.contracts.authProvider,
    paymentProvider: providerMatchesRemovedCapability(
      context.contracts.paymentProvider,
      removed,
    )
      ? undefined
      : context.contracts.paymentProvider,
  };

  const removedDecisionKinds = new Set<string>();
  if (removed.has("payments") || removed.has("subscriptions")) {
    removedDecisionKinds.add("payment");
  }
  if (removed.has("auth") || removed.has("supabase-auth")) {
    removedDecisionKinds.add("auth");
  }
  return {
    ...context,
    contracts,
    unresolvedDecisions: context.unresolvedDecisions.filter(
      (decision) => !removedDecisionKinds.has(decision.kind),
    ),
    confirmedAnswers: context.confirmedAnswers.filter(
      (answer) => !removedDecisionKinds.has(answer.kind),
    ),
  };
}

export function filterRemovedCapabilitiesFromBriefSummary(
  briefSummary: Record<string, unknown> | null,
  removedCapabilities: readonly string[],
): Record<string, unknown> | null {
  if (!briefSummary) return null;
  const removed = normalizeCapabilitySet(removedCapabilities);
  if (removed.size === 0 || !Array.isArray(briefSummary.requestedCapabilities)) {
    return briefSummary;
  }
  return {
    ...briefSummary,
    requestedCapabilities: briefSummary.requestedCapabilities.filter(
      (capability): capability is string =>
        typeof capability === "string" &&
        !removed.has(capability.trim().toLowerCase()),
    ),
  };
}

export function filterProvidersForRemovedCapabilities(
  providers: readonly string[],
  removedCapabilities: readonly string[],
): string[] {
  const removed = normalizeCapabilitySet(removedCapabilities);
  if (removed.size === 0) return [...providers];
  return providers.filter(
    (provider) => !providerMatchesRemovedCapability(provider, removed),
  );
}

export function buildCapabilityRemovalHint(
  removedCapabilities: readonly string[],
  removedDossiers: readonly DossierEntry[],
): string | null {
  const removed = Array.from(normalizeCapabilitySet(removedCapabilities));
  if (removed.length === 0) return null;
  const removedPaths = Array.from(
    new Set(
      removedDossiers.flatMap((dossier) =>
        (dossier.files ?? []).map((file) => file.path.replace(/\\/g, "/")),
      ),
    ),
  ).sort();
  return [
    "## Explicit capability removal",
    `The user explicitly removed: ${removed.join(", ")}.`,
    "Delete its UI, routes, imports, navigation links, provider calls, env usage, and contracts. Do not re-add it because its name appears in the removal request.",
    removedPaths.length > 0
      ? `Known files owned by the removed dossier(s): ${removedPaths.join(", ")}.`
      : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}
