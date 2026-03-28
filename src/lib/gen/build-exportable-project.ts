import type { CodeFile } from "./parser";
import { buildCompleteProject } from "./project-scaffold";
import { repairGeneratedFiles } from "./repair-generated-files";

/**
 * Canonical pipeline for building the complete, repaired Next.js project
 * from stored version files. Every surface that exports, downloads, verifies,
 * or previews a project MUST use this function to guarantee consistency.
 *
 * Steps: scaffold merge → dependency completion → deterministic repairs.
 */
export function buildExportableProject(generatedFiles: CodeFile[]): CodeFile[] {
  return repairGeneratedFiles(buildCompleteProject(generatedFiles)).files;
}
