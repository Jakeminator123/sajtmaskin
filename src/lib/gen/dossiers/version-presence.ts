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
 * A dossier is considered "present" when EVERY file it declares in its manifest
 * (`files[]`), mapped through {@link mapDossierPathToOutput} to the path it lands
 * on in the generated project, exists in the version's `files_json`. Requiring
 * ALL declared paths (not just one) disambiguates dossiers that share a path —
 * e.g. `openai-chat` and `rag-chat` both ship `app/api/chat/route.ts`, but only
 * `rag-chat` also ships the `lib/rag/*` files, and only `openai-chat` ships
 * `components/chat-panel.tsx`. This is deliberately precise over lenient: a
 * false positive inflates the panel / F3 selection (the incident), whereas a
 * dropped rewritable UI file only costs a false negative (the dossier is simply
 * not reported for that version).
 *
 * Used by:
 *  - the dossiers overview route (union with the snapshot-derived selection) so
 *    an integration built into the version always shows, even after an F2-mute
 *    follow-up dropped its capability from the snapshot floor;
 *  - the F3 capability-scope guard in `orchestrate.ts` (file evidence is what
 *    makes it safe to keep an already-built integration while dropping
 *    speculative brief/floor capabilities);
 *  - the F3 empty-generation honesty check in `generation-stream.ts` (don't
 *    claim "no code files" when the parent version already carries them).
 */
import { getAllDossiers, getDossierInstructions } from "./registry";
import { isDossierConfigured } from "./select";
import { mapDossierPathToOutput } from "./output-path";
import type { DossierEntry, SelectedDossier } from "./types";

/** Normalize a project file path for comparison (strip `./` and leading `/`). */
function normalizeProjectPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

/**
 * True when every file the dossier declares is present in `presentPaths`
 * (mapped to output paths). Dossiers with no declared files can't be detected
 * by file presence → never "present".
 */
function dossierFilesPresent(entry: DossierEntry, presentPaths: ReadonlySet<string>): boolean {
  const files = entry.files ?? [];
  if (files.length === 0) return false;
  return files.every((file) => presentPaths.has(normalizeProjectPath(mapDossierPathToOutput(file.path))));
}

/**
 * Dossier ids whose full declared file set is present in the version's files.
 * Deterministic (registry order → id-sorted). Pure; safe on empty input.
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
  return getAllDossiers()
    .filter((entry) => dossierFilesPresent(entry, presentPaths))
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
