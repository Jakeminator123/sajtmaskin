import {
  readMutedCapabilitiesFromSnapshot,
  readMutedDossierIdsFromSnapshot,
} from "@/lib/gen/orchestration-snapshot";
import { getDossierById } from "./registry";
import { isDossierConfigured, selectDossiersForRequest } from "./select";
import type { SelectedDossier } from "./types";
import { resolveDossierIdsPresentInVersion } from "./version-presence";
import type { CodeFile } from "@/lib/gen/parser";

/**
 * Resolve provider-specific integration dossiers the user requested in F2 but
 * whose files are not present in the selected version yet.
 *
 * New snapshots use `mutedDossierIds`, which preserves sibling identity. Old
 * snapshots fall back to `mutedCapabilities` and therefore use the capability
 * default. Actual file presence always wins, so an already-built integration
 * is never rebuilt merely because an older pending signal survived.
 */
export function resolvePendingIntegrationDossiers(params: {
  snapshot: Record<string, unknown> | null | undefined;
  versionFiles: readonly CodeFile[] | null | undefined;
  configuredEnvKeys?: ReadonlySet<string>;
}): SelectedDossier[] {
  const presentIds = new Set(
    resolveDossierIdsPresentInVersion(
      (params.versionFiles ?? []).map((file) => file.path),
    ),
  );
  const removedCapabilities = new Set(
    Array.isArray(params.snapshot?.removedCapabilities)
      ? params.snapshot.removedCapabilities
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim().toLowerCase())
      : [],
  );

  const exactIds = readMutedDossierIdsFromSnapshot(params.snapshot);
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
    // user clicks "Bygg integrationer".
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
  const uncoveredLegacyCapabilities = readMutedCapabilitiesFromSnapshot(
    params.snapshot,
  ).filter((capability) => !exactCapabilityIds.has(capability.toLowerCase()));
  if (uncoveredLegacyCapabilities.length === 0) return exactSelections;
  const legacySelections = selectDossiersForRequest({
    requestedCapabilities: uncoveredLegacyCapabilities,
    disableBriefFallback: true,
    configuredEnvKeys: params.configuredEnvKeys,
  }).selected.filter((selected) => !presentIds.has(selected.entry.id));
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
 * `detect-integrations.ts`; this is how `ai-chat` (openai-chat) and
 * `ai-tool-calling` (ai-tool-calling-chat) unify on `OPENAI_API_KEY` despite
 * different capability keys.
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
