import type { CodeFile } from "@/lib/gen/parser";

const BLOCKED_PATHS = ["node_modules/", ".git/"];
const BLOCKED_FILES = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".env.test",
];

export interface GitHubExportFile {
  path: string;
  content: string;
}

export interface GitHubExportPlan {
  files: GitHubExportFile[];
  deletionPaths: string[];
}

export function normalizeGitHubExportPath(raw: string): string | null {
  const normalized = raw
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/^\/+/, "");
  if (!normalized) return null;
  if (normalized.split("/").some((segment) => segment === "..")) return null;
  if (
    BLOCKED_FILES.some(
      (name) => normalized === name || normalized.startsWith(`${name}/`),
    )
  ) {
    return null;
  }
  if (BLOCKED_PATHS.some((prefix) => normalized.startsWith(prefix))) {
    return null;
  }
  return normalized;
}

/**
 * Plan a complete Git tree replacement on top of GitHub's base tree. Empty
 * files are real files and must remain; every old non-tree entry absent from
 * the portable artifact becomes an explicit deletion.
 */
export function buildGitHubExportPlan(
  projectFiles: CodeFile[],
  basePaths: Iterable<string> = [],
): GitHubExportPlan {
  const currentFiles = new Map<string, GitHubExportFile>();
  for (const file of projectFiles) {
    if (typeof file.path !== "string" || typeof file.content !== "string") continue;
    const path = normalizeGitHubExportPath(file.path);
    if (!path) continue;
    currentFiles.set(path, { path, content: file.content });
  }

  const deletionPaths = Array.from(new Set(basePaths))
    .filter(
      (path) =>
        typeof path === "string" && path.length > 0 && !currentFiles.has(path),
    )
    .sort();

  return {
    files: Array.from(currentFiles.values()).sort((a, b) => a.path.localeCompare(b.path)),
    deletionPaths,
  };
}
