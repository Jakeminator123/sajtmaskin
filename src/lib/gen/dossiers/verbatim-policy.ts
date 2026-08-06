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
import type { DossierEntry } from "./types";
import { getDossierFileContent } from "./registry";
import { mapDossierPathToOutput } from "./output-path";
import { devLogAppend } from "@/lib/logging/devLog";

export interface VerbatimRestoreEvent {
  path: string;
  dossierId: string;
  reason:
    | "verbatim_content_drift"
    | "verbatim_file_missing_in_llm_output"
    | "rewritable_file_missing_seeded";
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
}): { files: CodeFile[]; restored: VerbatimRestoreEvent[] } {
  const restored: VerbatimRestoreEvent[] = [];
  const llmByPath = new Map(params.llmFiles.map((f) => [f.path.trim(), f]));

  for (const dossier of params.selectedDossiers) {
    for (const file of dossier.files ?? []) {
      // Per-file injectionMode takes precedence over dossier-level codeFidelity.
      const effectiveMode = file.injectionMode ?? dossier.codeFidelity;
      const isVerbatim = effectiveMode === "verbatim";

      // Safe-default: a malformed entry or unreadable disk must never crash
      // the merge path — treat as "cannot verify/seed" and leave files as-is.
      let canonical: string | null = null;
      try {
        canonical = getDossierFileContent(dossier.class, dossier.id, file.path);
      } catch {
        canonical = null;
      }
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
      const outputPath = mapDossierPathToOutput(file.path);

      const llmFile = llmByPath.get(outputPath);
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
        llmByPath.set(outputPath, restoredFile);
        restored.push({
          path: outputPath,
          dossierId: dossier.id,
          reason: isVerbatim
            ? "verbatim_file_missing_in_llm_output"
            : "rewritable_file_missing_seeded",
        });
        continue;
      }

      // Rewritable files present in the LLM output are the LLM's to shape —
      // never overwrite (SM-004 seeds absence only).
      if (!isVerbatim) continue;

      if (llmFile.content !== canonical) {
        llmFile.content = canonical;
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

  return { files: params.llmFiles, restored };
}
