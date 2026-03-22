import { buildCompleteProject } from "./project-scaffold";
import { repairGeneratedFiles } from "./repair-generated-files";
import type { CodeFile } from "./parser";

export interface SandboxFile {
  name: string;
  content: string;
}

/**
 * Prepares generated files for @vercel/sandbox consumption.
 *
 * Applies `buildCompleteProject` (injects package.json, tsconfig, postcss,
 * layout, globals.css, shadcn/ui components) then `repairGeneratedFiles`
 * (import fixers, metadata conflict resolution, etc.) to ensure the
 * sandbox receives a complete, runnable Next.js project — not just the
 * raw model output stored in the version.
 *
 * All sandbox entry points (API route, MCP, local-engine) should call
 * this instead of passing raw version files directly.
 */
export function prepareSandboxProjectFiles(codeFiles: CodeFile[]): SandboxFile[] {
  const completedFiles = repairGeneratedFiles(buildCompleteProject(codeFiles)).files;
  return completedFiles.map((file) => ({
    name: file.path,
    content: file.content,
  }));
}
