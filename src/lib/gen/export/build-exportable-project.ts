import type { CodeFile } from "../parser";
import type { UiComponent } from "./project-scaffold-ui-reader";
import { buildCompleteProject } from "./project-scaffold";
import { repairGeneratedFiles } from "../autofix/repair-generated-files";

/**
 * Lazy-load the UI component reader via require() so its fs.readFileSync
 * stays out of Turbopack's static bundle analysis. All call sites that need
 * `collectRequiredUiComponents` should use this re-export.
 */
export function collectRequiredUiComponents(generatedFiles: CodeFile[]): UiComponent[] {
  const mod = require("./project-scaffold-ui-reader") as typeof import("./project-scaffold-ui-reader");
  return mod.collectRequiredUiComponents(generatedFiles);
}

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
