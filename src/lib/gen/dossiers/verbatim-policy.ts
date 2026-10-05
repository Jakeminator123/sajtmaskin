/**
 * Verbatim-policy enforcement for dossier files.
 *
 * After `mergeGeneratedProjectFiles` completes, any file in the merged set
 * whose effective `injectionMode` is `"verbatim"` is compared against its
 * canonical on-disk content. If the LLM drifted (or omitted the file
 * entirely), this module silently restores the canonical version and logs
 * the restoration so the deviation is observable server-side.
 *
 * This protects integration glue (Stripe webhooks, auth middleware, SDK init)
 * from accidental LLM rewrites without blocking the pipeline.
 */

import type { CodeFile } from "@/lib/gen/parser";
import { rewriteDossierImportsForRenames, type DossierPathRename } from "./canonical-imports";
import type { DossierEntry } from "./types";
import { projectDossierIntegration } from "./integration";
import { getDossierFileContent } from "./registry";
import {
  dossierOutputPathIdentity,
  dossierOutputPathsHaveFileDirectoryConflict,
  findDivergentDossierOutputPathConflicts,
  normalizeDossierProjectPath,
  resolveDossierFilePath,
} from "./output-path";
import { devLogAppend } from "@/lib/logging/dev-log";

export interface VerbatimRestoreEvent {
  path: string;
  dossierId: string;
  reason:
    | "verbatim_content_drift"
    | "verbatim_file_missing_in_llm_output"
    | "rewritable_file_missing_seeded";
}

export type PreservedDossierVerbatimFile = {
  path: string;
  content: string;
  language: CodeFile["language"];
  dossierIds: string[];
};

export type PreservedDossierVerbatimSnapshot = {
  byIdentity: ReadonlyMap<string, PreservedDossierVerbatimFile>;
  dossierIds: readonly string[];
  claims: ReadonlyArray<{
    path: string;
    identity: string;
    dossierId: string;
    sourcePath: string;
    content: string | null;
  }>;
};

function filesByPortableIdentity(files: readonly CodeFile[]): Map<string, CodeFile[]> {
  const byIdentity = new Map<string, CodeFile[]>();
  for (const file of files) {
    const identity = dossierOutputPathIdentity(normalizeDossierProjectPath(file.path));
    const matches = byIdentity.get(identity) ?? [];
    matches.push(file);
    byIdentity.set(identity, matches);
  }
  return byIdentity;
}

/**
 * Capture only verbatim files that actually existed at their exact Linux path
 * in the previous version. Rewritable or missing catalog files are not seeded.
 */
export function capturePreservedDossierVerbatimSnapshot(params: {
  previousFiles: readonly CodeFile[];
  preservedDossiers: readonly DossierEntry[];
}): PreservedDossierVerbatimSnapshot {
  const previousByIdentity = filesByPortableIdentity(params.previousFiles);
  const byIdentity = new Map<string, PreservedDossierVerbatimFile>();
  const claims: Array<PreservedDossierVerbatimSnapshot["claims"][number]> = [];
  for (const dossier of params.preservedDossiers) {
    for (const file of projectDossierIntegration(dossier).files) {
      if (file.injectionMode !== "verbatim") continue;
      const matches = previousByIdentity.get(file.outputIdentity) ?? [];
      if (matches.length === 0) continue;
      if (matches.length !== 1 || matches[0]!.path !== file.outputPath) {
        throw new Error(
          `[dossiers] preserved-output-alias-conflict: ${file.outputPath} <- ${matches
            .map((match) => match.path)
            .join(", ")}`,
        );
      }
      const previous = matches[0]!;
      claims.push({
        path: file.outputPath,
        identity: file.outputIdentity,
        dossierId: dossier.id,
        sourcePath: file.sourcePath,
        content: previous.content,
      });
      const existing = byIdentity.get(file.outputIdentity);
      if (existing) {
        if (existing.content !== previous.content || existing.path !== previous.path) {
          throw new Error(
            `[dossiers] preserved-output-conflict: ${file.outputPath} <- ${existing.dossierIds.join(", ")}, ${dossier.id}`,
          );
        }
        if (!existing.dossierIds.includes(dossier.id)) existing.dossierIds.push(dossier.id);
        continue;
      }
      byIdentity.set(file.outputIdentity, {
        path: file.outputPath,
        content: previous.content,
        language: previous.language,
        dossierIds: [dossier.id],
      });
    }
  }
  return { byIdentity, dossierIds: params.preservedDossiers.map((dossier) => dossier.id), claims };
}

/** Validate selected + preserved ownership before any file list is mutated. */
export function assertCompatibleDossierOutputClaims(params: {
  files: readonly CodeFile[];
  selectedDossiers: readonly DossierEntry[];
  preservedVerbatim: PreservedDossierVerbatimSnapshot;
}): void {
  const selected = prepareSelectedDossiers(params.selectedDossiers).selectedClaims;
  const combined = [
    ...selected,
    ...params.preservedVerbatim.claims.map((claim) => ({
      dossierId: claim.dossierId,
      capability: "preserved",
      sourcePath: claim.sourcePath,
      content: claim.content,
    })),
  ];
  const conflicts = findDivergentDossierOutputPathConflicts(combined);
  if (conflicts.length > 0) {
    throw new Error(
      `[dossiers] active-output-conflict: ${conflicts
        .map((conflict) => conflict.outputPath)
        .join(", ")}`,
    );
  }
  const claimPaths = [
    ...params.selectedDossiers.flatMap((dossier) =>
      projectDossierIntegration(dossier).files.map((file) => file.outputPath),
    ),
    ...params.preservedVerbatim.claims.map((claim) => claim.path),
  ];
  for (let index = 0; index < claimPaths.length; index += 1) {
    for (let other = index + 1; other < claimPaths.length; other += 1) {
      if (dossierOutputPathsHaveFileDirectoryConflict(claimPaths[index]!, claimPaths[other]!)) {
        throw new Error(
          `[dossiers] active-output-path-conflict: ${claimPaths[index]} conflicts with ${claimPaths[other]}`,
        );
      }
    }
  }
  for (const claim of params.preservedVerbatim.claims) {
    const aliases = params.files.filter(
      (file) =>
        dossierOutputPathIdentity(normalizeDossierProjectPath(file.path)) === claim.identity,
    );
    if (aliases.some((file) => file.path !== claim.path) || aliases.length > 1) {
      throw new Error(
        `[dossiers] preserved-output-alias-conflict: ${claim.path} <- ${aliases
          .map((file) => file.path)
          .join(", ")}`,
      );
    }
    for (const file of params.files) {
      if (file.path === claim.path) continue;
      if (dossierOutputPathsHaveFileDirectoryConflict(claim.path, file.path)) {
        throw new Error(
          `[dossiers] preserved-output-path-conflict: ${claim.path} conflicts with ${file.path}`,
        );
      }
    }
  }
}

/** Restore captured previous bytes before cross-file checks run. */
export function restorePreservedDossierVerbatimFiles(params: {
  files: readonly CodeFile[];
  snapshot: PreservedDossierVerbatimSnapshot;
}): { files: CodeFile[]; changed: boolean } {
  const byIdentity = filesByPortableIdentity(params.files);
  for (const [identity, expected] of params.snapshot.byIdentity) {
    const matches = byIdentity.get(identity) ?? [];
    if (matches.length > 1 || (matches[0] && matches[0].path !== expected.path)) {
      throw new Error(
        `[dossiers] preserved-output-alias-conflict: ${expected.path} <- ${matches
          .map((match) => match.path)
          .join(", ")}`,
      );
    }
  }
  let changed = false;
  const files = params.files.map((file) => {
    const identity = dossierOutputPathIdentity(normalizeDossierProjectPath(file.path));
    const expected = params.snapshot.byIdentity.get(identity);
    if (!expected) return file;
    if (
      file.path === expected.path &&
      file.content === expected.content &&
      file.language === expected.language
    ) {
      return file;
    }
    changed = true;
    return { ...file, path: expected.path, content: expected.content, language: expected.language };
  });
  const present = new Set(
    files.map((file) => dossierOutputPathIdentity(normalizeDossierProjectPath(file.path))),
  );
  for (const [identity, expected] of params.snapshot.byIdentity) {
    if (present.has(identity)) continue;
    files.push({ path: expected.path, content: expected.content, language: expected.language });
    changed = true;
  }
  return { files, changed };
}

/** Fixers may not mutate, remove or alias request-local preserved core bytes. */
export function assertPreservedDossierVerbatimFiles(params: {
  files: readonly CodeFile[];
  snapshot: PreservedDossierVerbatimSnapshot;
}): void {
  const actual = filesByPortableIdentity(params.files);
  for (const [identity, expected] of params.snapshot.byIdentity) {
    const matches = actual.get(identity) ?? [];
    if (
      matches.length !== 1 ||
      matches[0]!.path !== expected.path ||
      matches[0]!.content !== expected.content
    ) {
      throw new Error(
        `[dossiers] preserved-verbatim-mutation: ${expected.dossierIds.join("+")}:${expected.path}`,
      );
    }
  }
}

interface PreparedSelectedDossiers {
  canonicalByClaim: Map<string, string | null>;
  selectedClaims: Array<{
    dossierId: string;
    capability: string;
    sourcePath: string;
    content: string | null;
  }>;
}

function prepareSelectedDossiers(selectedDossiers: readonly DossierEntry[]): PreparedSelectedDossiers {
  const canonicalByClaim = new Map<string, string | null>();
  const selectedClaims = selectedDossiers.flatMap((dossier) =>
    projectDossierIntegration(dossier).files.map((file) => {
      const sourcePath = file.sourcePath;
      let content: string | null = null;
      try {
        content = getDossierFileContent(dossier.class, dossier.id, sourcePath);
      } catch {
        content = null;
      }
      canonicalByClaim.set(`${dossier.class}\0${dossier.id}\0${sourcePath}`, content);
      return { dossierId: dossier.id, capability: dossier.capability, sourcePath, content };
    }),
  );
  const selectedConflicts = findDivergentDossierOutputPathConflicts(selectedClaims);
  if (selectedConflicts.length > 0) {
    throw new Error(
      `[dossiers] selected-output-conflict: ${selectedConflicts
        .map(
          (conflict) =>
            `${conflict.outputPath} <- ${conflict.claims
              .map((claim) => `${claim.dossierId}:${claim.sourcePath}`)
              .join(", ")}`,
        )
        .join("; ")}`,
    );
  }
  return { canonicalByClaim, selectedClaims };
}

function applyCanonicalPathPolicy(
  llmFiles: CodeFile[],
  prepared: PreparedSelectedDossiers,
): { files: CodeFile[]; changed: boolean } {
  const llmByIdentity = new Map<string, CodeFile[]>();
  for (const file of llmFiles) {
    const normalizedPath = normalizeDossierProjectPath(file.path);
    const identity = dossierOutputPathIdentity(normalizedPath);
    const matches = llmByIdentity.get(identity) ?? [];
    matches.push(file);
    llmByIdentity.set(identity, matches);
  }

  const selectedResolved = prepared.selectedClaims.map((claim) => ({
    claim,
    resolved: resolveDossierFilePath(claim.sourcePath),
  }));
  // Preserve the historical unreadable-source fallback: it participates in
  // fail-closed collision checks, but cannot authorize a rename or mutation.
  const mutableSelectedResolved = selectedResolved.filter(({ claim }) => claim.content !== null);
  const selectedIdentities = new Set(selectedResolved.map(({ resolved }) => resolved.outputIdentity));
  const duplicateSelectedLlmIdentities = [...selectedIdentities].filter(
    (identity) => (llmByIdentity.get(identity)?.length ?? 0) > 1,
  );
  if (duplicateSelectedLlmIdentities.length > 0) {
    throw new Error(
      `[dossiers] llm-output-alias-conflict: ${duplicateSelectedLlmIdentities
        .map(
          (identity) =>
            `${identity} <- ${llmByIdentity
              .get(identity)!
              .map((file) => file.path)
              .join(", ")}`,
        )
        .join("; ")}`,
    );
  }

  for (const { resolved } of selectedResolved) {
    for (const llmFile of llmFiles) {
      const llmPath = normalizeDossierProjectPath(llmFile.path);
      if (dossierOutputPathsHaveFileDirectoryConflict(resolved.outputPath, llmPath)) {
        throw new Error(
          `[dossiers] llm-output-path-conflict: ${resolved.outputPath} conflicts with ${llmFile.path}`,
        );
      }
    }
  }

  const renames: DossierPathRename[] = [];
  const renameIdentities = new Set<string>();
  for (const { resolved } of mutableSelectedResolved) {
    const llmFile = llmByIdentity.get(resolved.outputIdentity)?.[0];
    if (!llmFile) continue;
    const fromPath = normalizeDossierProjectPath(llmFile.path);
    if (fromPath === resolved.outputPath) continue;
    const identity = dossierOutputPathIdentity(fromPath);
    if (renameIdentities.has(identity)) continue;
    renames.push({ fromPath, toPath: resolved.outputPath });
    renameIdentities.add(identity);
  }

  const importResult = rewriteDossierImportsForRenames(llmFiles, renames);
  const canonicalFiles = importResult.files.map((file) => {
    const normalizedPath = normalizeDossierProjectPath(file.path);
    const identity = dossierOutputPathIdentity(normalizedPath);
    const selected = mutableSelectedResolved.find(
      ({ resolved }) => resolved.outputIdentity === identity,
    );
    if (!selected || file.path === selected.resolved.outputPath) return file;
    return { ...file, path: selected.resolved.outputPath };
  });
  const pathChanged = canonicalFiles.some((file, index) => file !== importResult.files[index]);
  if (!importResult.changed && !pathChanged) return { files: llmFiles, changed: false };
  return { files: canonicalFiles, changed: true };
}

/** Canonicalize dossier-owned paths and their verified local imports before import checks run. */
export function applyDossierCanonicalPathPolicy(params: {
  llmFiles: CodeFile[];
  selectedDossiers: DossierEntry[];
}): { files: CodeFile[]; changed: boolean } {
  return applyCanonicalPathPolicy(params.llmFiles, prepareSelectedDossiers(params.selectedDossiers));
}

/**
 * Scans `llmFiles` for verbatim-mode dossier files and restores any that the
 * LLM modified or omitted. Returns the (potentially mutated) file list and a
 * list of restoration events for logging/telemetry.
 *
 * - Per-file `injectionMode` overrides the dossier-level `codeFidelity`.
 * - If the canonical content cannot be read from disk the file is left as-is
 *   (safe-default: prefer a possibly-drifted file over a crash).
 * - Only the paths explicitly listed in `dossier.files` are checked — other
 *   LLM-emitted files are untouched.
 * - REWRITABLE dossier files are seeded with canonical content when the LLM
 *   omitted them entirely, but NEVER overwritten when present (SM-004): a
 *   restored verbatim file may import a rewritable sibling — postgres-drizzle's
 *   verbatim `lib/db/index.ts` does `import * as schema from './schema'` where
 *   `schema.ts` is rewritable — so dossier-listed files must always EXIST,
 *   while the LLM keeps full freedom over rewritable content.
 */
export function applyDossierVerbatimPolicy(params: {
  llmFiles: CodeFile[];
  selectedDossiers: DossierEntry[];
  preservedVerbatim?: PreservedDossierVerbatimSnapshot;
  chatId?: string | null;
}): { files: CodeFile[]; restored: VerbatimRestoreEvent[]; changed: boolean } {
  const restored: VerbatimRestoreEvent[] = [];
  const prepared = prepareSelectedDossiers(params.selectedDossiers);
  const canonicalPathResult = applyCanonicalPathPolicy(params.llmFiles, prepared);
  if (canonicalPathResult.changed) {
    params.llmFiles.splice(0, params.llmFiles.length, ...canonicalPathResult.files);
  }
  let changed = canonicalPathResult.changed;
  const { canonicalByClaim } = prepared;
  const llmByIdentity = new Map<string, CodeFile[]>();
  for (const file of params.llmFiles) {
    const identity = dossierOutputPathIdentity(normalizeDossierProjectPath(file.path));
    const matches = llmByIdentity.get(identity) ?? [];
    matches.push(file);
    llmByIdentity.set(identity, matches);
  }

  for (const dossier of params.selectedDossiers) {
    for (const file of projectDossierIntegration(dossier).files) {
      const resolvedPath = file;
      if (params.preservedVerbatim?.byIdentity.has(resolvedPath.outputIdentity)) continue;
      // Per-file injectionMode takes precedence over dossier-level codeFidelity.
      const effectiveMode = file.injectionMode;
      const isVerbatim = effectiveMode === "verbatim";

      // Safe-default: a malformed entry or unreadable disk must never crash
      // the merge path — treat as "cannot verify/seed" and leave files as-is.
      const canonical =
        canonicalByClaim.get(`${dossier.class}\0${dossier.id}\0${resolvedPath.sourcePath}`) ?? null;
      if (canonical === null) {
        if (isVerbatim) {
          console.warn(
            `[verbatim-policy] dossier ${dossier.id} declares verbatim file ${file.path} but disk content is unavailable - verbatim policy skipped for this file`,
          );
        }
        continue; // Cannot verify/seed — leave as-is.
      }

      // Translate the dossier-internal staging path to the output path the
      // system-prompt told the LLM to emit at (must use the same mapping as
      // `dossiers.ts` — see `output-path.ts` for rotorsaks-historik).
      const outputPath = resolvedPath.outputPath;

      const llmFile = llmByIdentity.get(resolvedPath.outputIdentity)?.[0];
      if (!llmFile) {
        // LLM omitted a dossier-listed file — push it back with canonical
        // content. For rewritable files this is a SEED (the file must exist;
        // a restored verbatim sibling may import it), not an overwrite.
        const ext = outputPath.split(".").pop()?.toLowerCase() ?? "ts";
        const language: CodeFile["language"] =
          ext === "tsx"
            ? "tsx"
            : ext === "ts"
              ? "ts"
              : ext === "css"
                ? "css"
                : ext === "js" || ext === "jsx"
                  ? "js"
                  : "txt";
        const restoredFile: CodeFile = { path: outputPath, content: canonical, language };
        params.llmFiles.push(restoredFile);
        changed = true;
        llmByIdentity.set(resolvedPath.outputIdentity, [restoredFile]);
        restored.push({
          path: outputPath,
          dossierId: dossier.id,
          reason: isVerbatim
            ? "verbatim_file_missing_in_llm_output"
            : "rewritable_file_missing_seeded",
        });
        continue;
      }

      // A dossier-owned path must use the manifest's canonical spelling on
      // Linux too. Rewritable controls content, not path identity.
      if (llmFile.path !== outputPath) {
        llmFile.path = outputPath;
        changed = true;
      }

      // Rewritable files present in the LLM output are the LLM's to shape —
      // never overwrite (SM-004 seeds absence only).
      if (!isVerbatim) continue;

      if (llmFile.content !== canonical) {
        llmFile.content = canonical;
        changed = true;
        restored.push({
          path: outputPath,
          dossierId: dossier.id,
          reason: "verbatim_content_drift",
        });
      }
    }
  }

  if (restored.length > 0 && params.chatId) {
    devLogAppend("in-progress", {
      type: "dossier_verbatim_restored",
      chatId: params.chatId,
      count: restored.length,
      files: restored.map((r) => ({
        path: r.path,
        dossierId: r.dossierId,
        reason: r.reason,
      })),
    });
  }

  return { files: params.llmFiles, restored, changed };
}
