/**
 * F3 approve-round dossier-injection predicate. Extracted verbatim from
 * `chat-message-stream-post.ts`.
 */
import {
  resolveCapabilitiesPresentInVersion,
  resolveDossierIdsPresentInVersion,
} from "@/lib/gen/dossiers/version-presence";
import { readF3ApprovedFromSnapshot } from "@/lib/gen/orchestration-snapshot";
import {
  mapProviderKeysToBackingDossierIds,
  providerKeysWithoutBackingDossier,
} from "@/lib/integrations/tier3-build-spec";

/**
 * BB#f3det1: does an APPROVE-continuation still need the real LLM build round
 * to inject dossier code, even though the parent version's file-derived spec
 * carries no required real build keys?
 *
 * True when at least one approved provider maps to a BACKING DOSSIER whose
 * files are NOT already present in the parent version (dossier-id granularity
 * per Codex P1 on #503 — a present sibling like `postgres-drizzle` must not
 * satisfy an approved `mongodb`), when a DOSSIER-LESS registry provider
 * (e.g. `posthog` — approvable via suggestIntegration but with no dossier
 * templates) is not already evidenced in the parent's file-derived spec
 * (coach review on #503: a deterministic exact-file fork would ship ZERO
 * integration code for it — the generic LLM build path must wire it), or
 * when a durable snapshot-approved CAPABILITY (which carries no provider
 * identity) lacks file presence. File presence is the canonical
 * version-presence signal (docs/contracts/dossier-system.md
 * § Version-presence union).
 *
 * Used to exempt such a round from the #493 deterministic-release backstop:
 * the deterministic path only governs a no-build-key parent WITHOUT new
 * providers (the accepted normal case — the round would just re-emit the F2
 * files). A newly approved provider whose dossier is absent must instead run
 * the LLM/dossier round so F3 installs the dormant-but-real integration code.
 */
export function approveRoundNeedsDossierInjection(params: {
  markerSuggestedProviders: string[];
  snapshot: Record<string, unknown> | null;
  parentFilePaths: string[];
  /**
   * Provider keys already evidenced in the parent version's file-derived
   * Tier-3 spec (`gate.spec.requirements[].key`, lowercased) — the honest
   * "already wired" signal for providers WITHOUT a backing dossier, where
   * dossier file presence cannot answer the question.
   */
  parentSpecProviderKeys: ReadonlySet<string>;
}): boolean {
  const persistedApproved = readF3ApprovedFromSnapshot(params.snapshot);
  const effectiveApprovedProviders =
    params.markerSuggestedProviders.length > 0
      ? params.markerSuggestedProviders
      : persistedApproved.providers;

  // Provider approvals compare at DOSSIER-ID granularity (Codex P1 on #503):
  // capability granularity would treat a present SIBLING dossier
  // (postgres-drizzle under `database`) as satisfying a newly approved
  // provider (mongodb → mongodb-atlas) and skip its injection forever.
  let requiredDossierIds: string[] = [];
  try {
    requiredDossierIds = mapProviderKeysToBackingDossierIds(
      effectiveApprovedProviders,
    );
  } catch {
    requiredDossierIds = [];
  }
  if (requiredDossierIds.length > 0) {
    const presentIds = new Set(
      resolveDossierIdsPresentInVersion(params.parentFilePaths),
    );
    for (const dossierId of requiredDossierIds) {
      if (!presentIds.has(dossierId)) return true;
    }
  }

  // Dossier-less registry providers (posthog, google-analytics, …): policy
  // decided 2026-07-13 — an approved provider without dossier templates goes
  // the GENERIC LLM build path unless the parent's file-derived spec already
  // carries it. Never a deterministic fork with zero integration code.
  let dossierlessProviderKeys: string[] = [];
  try {
    dossierlessProviderKeys = providerKeysWithoutBackingDossier(
      effectiveApprovedProviders,
    );
  } catch {
    dossierlessProviderKeys = [];
  }
  for (const providerKey of dossierlessProviderKeys) {
    if (!params.parentSpecProviderKeys.has(providerKey)) return true;
  }

  // Durable snapshot approvals are capability strings (no provider identity
  // to sharpen with) — capability-level presence is the best available signal.
  const persistedCapabilities = new Set(
    persistedApproved.capabilities.map((capability) => capability.toLowerCase()),
  );
  if (persistedCapabilities.size === 0) return false;
  const presentCapabilities = new Set(
    resolveCapabilitiesPresentInVersion(params.parentFilePaths).map((capability) =>
      capability.toLowerCase(),
    ),
  );
  for (const capability of persistedCapabilities) {
    if (!presentCapabilities.has(capability)) return true;
  }
  return false;
}
