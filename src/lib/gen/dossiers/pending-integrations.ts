import { detectIntegrationsFromVersionFiles } from "@/lib/gen/detect-integrations";
import {
    readF3ApprovedFromSnapshot,
    readMutedCapabilitiesFromSnapshot,
    readMutedDossierIdsFromSnapshot,
} from "@/lib/gen/orchestration-snapshot";
import type { CodeFile } from "@/lib/gen/parser";
import { mapProviderKeysToBackingDossierIds } from "@/lib/integrations/tier3-build-spec";
import { getDossierById } from "./registry";
import { isDossierConfigured, selectDossiersForRequest } from "./select";
import type { DossierEntry, SelectedDossier } from "./types";
import { resolveDossierIdsPresentInVersion } from "./version-presence";

/**
 * Double-mount guard for CLIENT-ONLY dossiers (no `role: "server"` file —
 * currently vercel-analytics and calcom-booking). Their capability is muted in
 * F2, but the design round may still hand-write the same provider (the coding
 * direction lets the model add `<Analytics />` from `@vercel/analytics` when
 * a brief implies measurable flows). Installing the dossier on top in F3 then
 * mounts the provider twice — for analytics that is double-counted page views.
 *
 * `version-presence` only recognises the dossier's own file, so the guard
 * asks the registry-pattern detector whether the provider is already in the
 * version's code. Server-backed dossiers are deliberately NOT covered: for
 * them the F3 build is what makes the integration functional, and a stray
 * SDK mention in F2 must not silently cancel it (the Byggblock panel already
 * hides that duplicate at view level via
 * {@link isPlannedDossierCoveredByModelBuiltBlock}).
 */
function createModelBuiltProviderGuard(
  versionFiles: readonly CodeFile[],
): (entry: DossierEntry) => boolean {
  let detectedProviders: Set<string> | null = null;
  return (entry) => {
    const files = entry.files ?? [];
    if (files.length === 0 || files.some((file) => file.role === "server")) return false;
    const providers = entry.providers ?? [];
    if (providers.length === 0 || versionFiles.length === 0) return false;
    if (detectedProviders === null) {
      detectedProviders = new Set(
        detectIntegrationsFromVersionFiles(
          versionFiles.map((file) => ({ name: file.path, content: file.content })),
          // Registry/manifest detection only — the custom `process.env` scan
          // is noise here and is muted in design anyway.
          { lifecycleStage: "design" },
        )
          .map((integration) => integration.provider)
          .filter((provider): provider is string => typeof provider === "string"),
      );
    }
    return providers.some((provider) => detectedProviders!.has(provider));
  };
}

/**
 * Resolve provider-specific integration dossiers the user requested in F2 or
 * durably approved for F3, but whose files are not present in the selected
 * design version yet.
 *
 * New snapshots use `mutedDossierIds`, which preserves sibling identity. Old
 * snapshots fall back to `mutedCapabilities` and therefore use the capability
 * default. Durable approvals also restore retry intent after a failed F3 wrote
 * chat-global file evidence and cleared those muted markers. Actual presence
 * in the selected base always wins, so an already-built integration is never
 * rebuilt merely because an older pending/approval signal survived.
 */
export function resolvePendingIntegrationDossiers(params: {
  snapshot: Record<string, unknown> | null | undefined;
  versionFiles: readonly CodeFile[] | null | undefined;
  configuredEnvKeys?: ReadonlySet<string>;
}): SelectedDossier[] {
  const versionFiles = params.versionFiles ?? [];
  const presentIds = new Set(
    resolveDossierIdsPresentInVersion(versionFiles.map((file) => file.path)),
  );
  const providerAlreadyBuiltByModel = createModelBuiltProviderGuard(versionFiles);
  const removedCapabilities = new Set(
    Array.isArray(params.snapshot?.removedCapabilities)
      ? params.snapshot.removedCapabilities
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim().toLowerCase())
      : [],
  );

  const approved = readF3ApprovedFromSnapshot(params.snapshot);
  // Durable F3 approvals survive an incomplete/failed integrations build.
  // Its chat-global file evidence may already have cleared the old muted
  // markers, so retry authority must come from the selected design version's
  // actual files, not from those stale markers alone.
  const exactIds = Array.from(
    new Set([
      ...readMutedDossierIdsFromSnapshot(params.snapshot),
      ...mapProviderKeysToBackingDossierIds(approved.providers),
    ]),
  );
  const exactCapabilityIds = new Set<string>();
  const exactSelections = exactIds.flatMap((id): SelectedDossier[] => {
    const entry = getDossierById(id);
    if (!entry) return [];
    exactCapabilityIds.add(entry.capability.toLowerCase());
    if (presentIds.has(entry.id)) return [];
    if (removedCapabilities.has(entry.capability.toLowerCase())) return [];
    // The exact id only exists because F2 deferred this dossier. Keep policy-
    // deferred client-only integrations (currently analytics) too: they do not
    // satisfy dossierRequiresF3's build-env/server-file rule, but their files
    // were still intentionally withheld from F2 and must be installed when the
    // user clicks "Bygg integrationer" — unless the design round already
    // hand-wrote that provider (double-mount guard).
    if (providerAlreadyBuiltByModel(entry)) return [];
    return [{
      entry,
      reason: "relevance-keyword",
      configured: isDossierConfigured(entry, params.configuredEnvKeys),
    }];
  });

  // Hybrid snapshots can exist during rollout: preserve every exact sibling,
  // then use the legacy capability default only for capabilities that have no
  // known exact companion. A delivered exact dossier still counts as covered,
  // otherwise its stale capability signal could incorrectly rebuild a sibling.
  const uncoveredLegacyCapabilities = Array.from(
    new Set([
      ...readMutedCapabilitiesFromSnapshot(params.snapshot),
      ...approved.capabilities,
    ]),
  ).filter((capability) => !exactCapabilityIds.has(capability.toLowerCase()));
  if (uncoveredLegacyCapabilities.length === 0) return exactSelections;
  const legacySelections = selectDossiersForRequest({
    requestedCapabilities: uncoveredLegacyCapabilities,
    disableBriefFallback: true,
    configuredEnvKeys: params.configuredEnvKeys,
  }).selected.filter(
    (selected) =>
      !presentIds.has(selected.entry.id) && !providerAlreadyBuiltByModel(selected.entry),
  );
  return [...exactSelections, ...legacySelections];
}

/**
 * M#li6 (prod 2026-08-01, chat 7a4d609f): after a follow-up asked for an AI
 * chatbot, the Byggblock panel showed BOTH a model-built chat block
 * ("AI-assistent med verktyg", detected from the version's code) AND the
 * F2-deferred dossier ("AI-chatt — OpenAI") as a separate "Planerad" post —
 * three blocks for two functions. A planned post whose function is already
 * covered by a MODEL-BUILT block is noise, and rebuilding it in F3 risks a
 * second chat widget.
 *
 * Coverage join: same capability (case-insensitive) OR any env-key overlap.
 * Any-overlap = same vendor — mirrors `findMatchingCluster` in
 * `detect-integrations.ts`; env-key overlap is how sibling AI surfaces
 * used to unify on `OPENAI_API_KEY` before etapp 4 parked the tool-/RAG
 * dossiers (openai-chat is now the sole live AI dossier).
 *
 * Deliberately restricted to MODEL-BUILT coverage (callers pass only built
 * blocks WITHOUT dossier file presence): a dossier-file-injected built block
 * must NOT supersede a planned sibling under the same capability — that
 * coexistence is the provider-migration UX (built postgres + planned
 * mongodb) guarded by `preferPendingIntegrationDossiers`' preserve rule.
 */
export function isPlannedDossierCoveredByModelBuiltBlock(params: {
  planned: { capability: string; envKeys: readonly string[] };
  modelBuiltBlocks: ReadonlyArray<{ capability: string; envKeys: readonly string[] }>;
}): boolean {
  const plannedCapability = params.planned.capability.trim().toLowerCase();
  const plannedKeys = new Set(params.planned.envKeys);
  return params.modelBuiltBlocks.some(
    (block) =>
      block.capability.trim().toLowerCase() === plannedCapability ||
      block.envKeys.some((key) => plannedKeys.has(key)),
  );
}

/**
 * Merge a snapshot/presence selection with exact F2-deferred providers.
 *
 * Exact pending identity wins over a snapshot/brief DEFAULT for the same
 * capability (supabase-auth must not coexist with a guessed clerk-auth
 * sibling). Real file evidence may be preserved explicitly: it describes code
 * that actually exists, not a guess, and can therefore legitimately coexist
 * during a provider migration.
 */
export function preferPendingIntegrationDossiers(params: {
  selected: readonly SelectedDossier[];
  pending: readonly SelectedDossier[];
  preserveDossierIds?: ReadonlySet<string>;
}): SelectedDossier[] {
  const pendingCapabilities = new Set(
    params.pending.map((selected) => selected.entry.capability.toLowerCase()),
  );
  const byId = new Map<string, SelectedDossier>();
  for (const selected of params.selected) {
    const replacedByPending = pendingCapabilities.has(
      selected.entry.capability.toLowerCase(),
    );
    if (replacedByPending && !params.preserveDossierIds?.has(selected.entry.id)) {
      continue;
    }
    byId.set(selected.entry.id, selected);
  }
  for (const selected of params.pending) byId.set(selected.entry.id, selected);
  return Array.from(byId.values());
}
