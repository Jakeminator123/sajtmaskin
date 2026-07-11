import type { CodeFile } from "../parser";
import { buildCompleteProject } from "./project-scaffold";
import { repairGeneratedFiles } from "../autofix/repair-generated-files";
import { isPipelineAuthoredEnvLocal } from "../preview/env-local";

export type { UiComponent } from "./project-scaffold-ui-reader";

/**
 * Canonical pipeline for building the complete, repaired Next.js project
 * from stored version files. Every surface that exports, downloads, verifies,
 * or previews a project MUST use this function to guarantee consistency.
 *
 * Steps: scaffold merge → UI component resolution → dependency completion → deterministic repairs.
 */
export async function buildExportableProject(generatedFiles: CodeFile[]): Promise<CodeFile[]> {
  // Dynamic import keeps Turbopack from merging fs-heavy UI scanning into every route that
  // transitively touched this module (quality-gate, repair, export, etc.).
  const { collectRequiredUiComponents } = await import("./project-scaffold-ui-reader");
  const uiComponents = collectRequiredUiComponents(generatedFiles);
  // Persisted pipeline env artifacts are intentionally dossier-scoped for the
  // code view. Verify/export assembly needs the complete harmless/F2
  // placeholder envelope so build-time env reads behave like preview. Remove
  // only pipeline-authored env here; model-authored env remains authoritative.
  const filesForRuntimeAssembly = generatedFiles.filter(
    (file) =>
      file.path !== ".env.local" ||
      !isPipelineAuthoredEnvLocal(file.content),
  );
  return repairGeneratedFiles(
    buildCompleteProject(filesForRuntimeAssembly, uiComponents),
  ).files;
}
