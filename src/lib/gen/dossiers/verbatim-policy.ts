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
    (dossier.files ?? []).map((file) => {
      const sourcePath = resolveDossierFilePath(file.path).sourcePath;
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
  const mutableSelectedResolved = selectedResolved.filter(({ claim }) => Boolean(claim.content));
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
    for (const file of dossier.files ?? []) {
      const resolvedPath = resolveDossierFilePath(file.path);
      // Per-file injectionMode takes precedence over dossier-level codeFidelity.
      const effectiveMode = file.injectionMode ?? dossier.codeFidelity;
      const isVerbatim = effectiveMode === "verbatim";

      // Safe-default: a malformed entry or unreadable disk must never crash
      // the merge path — treat as "cannot verify/seed" and leave files as-is.
      const canonical =
        canonicalByClaim.get(`${dossier.class}\0${dossier.id}\0${resolvedPath.sourcePath}`) ?? null;
      if (!canonical) {
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
