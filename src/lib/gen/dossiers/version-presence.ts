/**
 * Canonical "which dossiers are actually IN this version" resolver.
 *
 * Signal-gate principle (docs/architecture/runtime-contracts.md → Dossier­kontrakt):
 * the version's real files are the ground truth for what a build contains — not
 * the F2-muted `orchestration_snapshot.requestedCapabilities` floor, and not the
 * provider-key → capability mapping in `tier3-build-spec.ts` (which resolves a
 * detected provider like `openai` to a capability *default*, so it can surface
 * the wrong dossier — e.g. `ai-chat`/`openai-chat` for code that is actually the
 * `ai-tool-calling` assistant route).
 *
 * Matching rule (review round 2 — resilient to user edits, guarded against
 * shared paths):
 *
 *  - A file path is DISTINCTIVE when exactly one dossier in the pool declares
 *    it (after output-path mapping). Shared helper files like
 *    `components/integration-config-notice.tsx` (shipped by several hard
 *    dossiers) or the chat route `app/api/chat/route.ts` (openai-chat AND
 *    rag-chat) are never distinctive.
 *  - Dossier WITH `role: "server"` files: present ⇔ ALL its server files exist
 *    AND at least one of its present files (any role) is distinctive. Server
 *    files are the functional core and verbatim-protected — a user
 *    renaming/absorbing a rewritable client component must not erase the
 *    evidence (Stripe built + keys filled would otherwise silently drop
 *    `payments` from the F3 scope). The distinctive requirement stops a shared
 *    server path alone from matching a sibling dossier (rag-chat's chat route
 *    must not resurrect openai-chat).
 *  - Dossier WITHOUT server files: present ⇔ at least one distinctive file
 *    exists (a soft/UI dossier keeps its evidence even when sibling shared
 *    files drift).
 *  - Dossier with no declared files: never present.
 *
 * Used by:
 *  - {@link resolveSelectedDossiersWithVersionPresence} — the ONE owner of the
 *    "selected dossiers incl. file evidence" union consumed by the dossiers
 *    panel route, the readiness route, finalize-design, the stream-post F3
 *    gate (`checkTier3ReadinessForVersion`) and the deploy env gate;
 *  - the F3 capability-scope guard in `orchestrate.ts` (file evidence is what
 *    makes it safe to keep an already-built integration while dropping
 *    speculative brief/floor capabilities);
 *  - the F3 empty-generation honesty check in `generation-stream.ts` (don't
 *    claim "no code files" when the parent version already carries them).
 */
import { getAllDossiers, getDossierInstructions } from "./registry";
import { isDossierConfigured } from "./select";
import { resolveSelectedDossiersFromSnapshot } from "./snapshot-selection";
import { mapDossierPathToOutput } from "./output-path";
import type { DossierEntry, DossierFile, SelectedDossier } from "./types";

/** Normalize a project file path for comparison (strip `./` and leading `/`). */
function normalizeProjectPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

/** Mapped output path for a dossier manifest file. */
function outputPathFor(file: DossierFile): string {
  return normalizeProjectPath(mapDossierPathToOutput(file.path));
}

/**
 * How many dossiers in the pool declare each mapped output path. A path with
 * count 1 is "distinctive" for its dossier; counts ≥ 2 mark shared helper
 * files that must never serve as sole presence evidence.
 */
function buildPathDeclarationCounts(pool: DossierEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const dossier of pool) {
    // Dedupe within one dossier so a manifest that lists the same path twice
    // doesn't inflate the count past "distinctive".
    const paths = new Set((dossier.files ?? []).map(outputPathFor));
    for (const path of paths) {
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  return counts;
}

/** See the module doc for the matching rule. */
function dossierFilesPresent(
  entry: DossierEntry,
  presentPaths: ReadonlySet<string>,
  pathDeclarationCounts: ReadonlyMap<string, number>,
): boolean {
  const files = entry.files ?? [];
  if (files.length === 0) return false;
  const mapped = files.map((file) => ({ role: file.role, path: outputPathFor(file) }));
  const hasDistinctivePresentFile = mapped.some(
    (file) =>
      presentPaths.has(file.path) && (pathDeclarationCounts.get(file.path) ?? 0) === 1,
  );
  const serverFiles = mapped.filter((file) => file.role === "server");
  if (serverFiles.length > 0) {
    return (
      serverFiles.every((file) => presentPaths.has(file.path)) &&
      hasDistinctivePresentFile
    );
  }
  return hasDistinctivePresentFile;
}

/**
 * Dossier ids whose file evidence (per the matching rule in the module doc) is
 * present in the version's files. Deterministic (registry order → id-sorted).
 * Pure; safe on empty input.
 */
export function resolveDossierIdsPresentInVersion(
  filePaths: Iterable<string>,
): string[] {
  const presentPaths = new Set<string>();
  for (const path of filePaths) {
    if (typeof path === "string" && path.trim().length > 0) {
      presentPaths.add(normalizeProjectPath(path));
    }
  }
  if (presentPaths.size === 0) return [];
  const pool = getAllDossiers();
  const pathDeclarationCounts = buildPathDeclarationCounts(pool);
  return pool
    .filter((entry) => dossierFilesPresent(entry, presentPaths, pathDeclarationCounts))
    .map((entry) => entry.id)
    .sort();
}

/**
 * {@link SelectedDossier} objects for every dossier whose files are present in
 * the version. Built directly from the detected entry (NOT re-selected by
 * capability) so a non-default sibling — e.g. `mongodb-atlas` under `database`
 * or `ai-tool-calling-chat` under an `ai-*` capability — is reported exactly as
 * it exists in the files, never swapped for the capability default.
 *
 * @param versionFiles the version's files (only `path` is read).
 * @param configuredEnvKeys project env keys with a real stored value; drives
 *   the `configured` prompt signal (same source as `selectDossiersForRequest`).
 */
export function resolveDossiersPresentInVersion(
  versionFiles: ReadonlyArray<{ path?: unknown }>,
  configuredEnvKeys?: ReadonlySet<string>,
): SelectedDossier[] {
  const filePaths = versionFiles
    .map((file) => (typeof file?.path === "string" ? file.path : ""))
    .filter((path) => path.length > 0);
  const presentIds = new Set(resolveDossierIdsPresentInVersion(filePaths));
  if (presentIds.size === 0) return [];
  const selected: SelectedDossier[] = [];
  for (const dossier of getAllDossiers()) {
    if (!presentIds.has(dossier.id)) continue;
    const entry: DossierEntry = {
      ...dossier,
      instructions:
        dossier.instructions || getDossierInstructions(dossier.class, dossier.id),
    };
    selected.push({
      entry,
      // File presence IS a capability match — the dossier's capability output
      // is demonstrably in the version. (`SelectedDossier.reason` has no
      // dedicated "file-evidence" member; capability-match is the truthful,
      // non-breaking choice for the existing union.)
      reason: "capability-match",
      configured: isDossierConfigured(entry, configuredEnvKeys),
    });
  }
  return selected;
}

/**
 * Distinct dossier capabilities present in the version's files. Convenience for
 * the F3 capability-scope guard, which reasons in capability space.
 */
export function resolveCapabilitiesPresentInVersion(
  filePaths: Iterable<string>,
): string[] {
  const ids = new Set(resolveDossierIdsPresentInVersion(filePaths));
  if (ids.size === 0) return [];
  const capabilities = new Set<string>();
  for (const dossier of getAllDossiers()) {
    if (ids.has(dossier.id)) capabilities.add(dossier.capability.toLowerCase());
  }
  return Array.from(capabilities);
}

/**
 * THE canonical "selected dossiers for this chat/version" resolver
 * (signal-gate: one owner, many consumers): snapshot-derived selection ∪
 * dossiers whose files are actually present in the version.
 *
 * The snapshot floor is F2-muted (integration capabilities are stripped on
 * every design round), so alone it under-reports what a build contains; file
 * presence alone misses planned-but-unbuilt dossiers. The union is the honest
 * answer, and its direction is safe for the env gates: presence only ADDS
 * dossiers whose files genuinely exist, which lets `detect-integrations` tag
 * their env keys with the manifest's real enforcement — while integrations
 * with no matching dossier keep the warn-only downgrade.
 *
 * Merge rule: file evidence wins per CAPABILITY. A capability with real files
 * takes its provider dossier from presence; the snapshot's guess for that same
 * capability is dropped (never coexists). Capabilities with no file evidence
 * keep their snapshot pick. This is what stops a snapshot-guessed `clerk-auth`
 * (the `auth` default) from riding alongside an actually-built `supabase-auth`
 * after the auth-capability merge.
 *
 * Consumers (all five read THIS, never their own union): the dossiers panel
 * route, the readiness route, `finalize-design`, the stream-post F3 gate via
 * `checkTier3ReadinessForVersion`, and the deploy env gate.
 *
 * Pass the version's files preloaded (only `path` is read) — callers already
 * hold them or load them exactly once per request; `null`/`undefined` degrades
 * to snapshot-only.
 */
export function resolveSelectedDossiersWithVersionPresence(params: {
  snapshot: unknown;
  versionFiles?: ReadonlyArray<{ path?: unknown }> | null;
  configuredEnvKeys?: ReadonlySet<string>;
}): SelectedDossier[] {
  const fromSnapshot = resolveSelectedDossiersFromSnapshot(
    params.snapshot,
    params.configuredEnvKeys,
  );
  const fromPresence =
    params.versionFiles && params.versionFiles.length > 0
      ? resolveDossiersPresentInVersion(params.versionFiles, params.configuredEnvKeys)
      : [];
  if (fromPresence.length === 0) return fromSnapshot;

  // Capability-level precedence (auth-merge regression 2026-07-22): file
  // evidence is the ground truth for WHICH provider a capability was built
  // with. After the `supabase-auth`→`auth` taxonomy merge the persisted
  // snapshot floor only carries the capability (`auth`), so snapshot
  // re-selection — which has no prompt/provider context — falls back to the
  // capability DEFAULT (`clerk-auth`). Deduping by dossier id then let that
  // guessed default coexist with the actually-built sibling (`supabase-auth`),
  // demanding BOTH providers' env keys (Clerk's are `build`-enforced) and
  // blocking readiness/deploy. So when a capability has real file evidence,
  // the file-evidenced dossier wins and any snapshot-guessed sibling under the
  // SAME capability is dropped. Capabilities with no file evidence keep their
  // snapshot pick (planned-but-unbuilt dossiers).
  const presenceCapabilities = new Set(
    fromPresence.map((selected) => selected.entry.capability.toLowerCase()),
  );
  const byId = new Map<string, SelectedDossier>();
  for (const selected of fromSnapshot) {
    if (presenceCapabilities.has(selected.entry.capability.toLowerCase())) continue;
    if (!byId.has(selected.entry.id)) byId.set(selected.entry.id, selected);
  }
  for (const selected of fromPresence) {
    byId.set(selected.entry.id, selected);
  }
  return Array.from(byId.values());
}
