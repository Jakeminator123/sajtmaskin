import type { CodeFile } from "../parser";
import { buildCompleteProject } from "./project-scaffold";
import { repairGeneratedFiles } from "../autofix/repair-generated-files";

/**
 * Canonical pipeline for building the complete, repaired Next.js project
 * from stored version files. Every surface that exports, downloads, verifies,
 * or previews a project MUST use this function to guarantee consistency.
 *
 * Steps: scaffold merge → UI component resolution → dependency completion → deterministic repairs.
 *
 * Async because the UI component reader is loaded via dynamic import to keep
 * its `fs.readFileSync` calls out of Turbopack's static bundle analysis.
 */
export async function buildExportableProject(generatedFiles: CodeFile[]): Promise<CodeFile[]> {
  const { collectRequiredUiComponents } = require("./project-scaffold-ui-reader") as typeof import("./project-scaffold-ui-reader");
  const uiComponents = collectRequiredUiComponents(generatedFiles);
  return repairGeneratedFiles(buildCompleteProject(generatedFiles, uiComponents)).files;
}
