import type { CodeFile } from "../parser";
import { collectRequiredUiComponents } from "./project-scaffold-ui-reader";
import { buildCompleteProject } from "./project-scaffold";
import { repairGeneratedFiles } from "../autofix/repair-generated-files";

export type { UiComponent } from "./project-scaffold-ui-reader";
export { collectRequiredUiComponents };

/**
 * Canonical pipeline for building the complete, repaired Next.js project
 * from stored version files. Every surface that exports, downloads, verifies,
 * or previews a project MUST use this function to guarantee consistency.
 *
 * Steps: scaffold merge → UI component resolution → dependency completion → deterministic repairs.
 */
export async function buildExportableProject(generatedFiles: CodeFile[]): Promise<CodeFile[]> {
  const uiComponents = collectRequiredUiComponents(generatedFiles);
  return repairGeneratedFiles(buildCompleteProject(generatedFiles, uiComponents)).files;
}
