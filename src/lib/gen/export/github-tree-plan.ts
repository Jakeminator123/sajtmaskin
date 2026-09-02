import type { CodeFile } from "@/lib/gen/parser";

const BLOCKED_PATHS = ["node_modules/", ".git/"];
/**
 * GitHub export additionally refuses dotenv files that ZIP may still ship.
 * ZIP only strips the generated `.env.local` placeholder; a local download is
 * owner-scoped. A GitHub commit is durable history on a potentially shared
 * remote, so `.env`, `.env.production`, `.env.development` and `.env.test`
 * stay out of the tree even when they exist in the portable artifact.
 */
const BLOCKED_FILES = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".env.test",
];

export const GITHUB_EXPORT_MANIFEST_PATH = ".sajtmaskin/export-manifest.json";
export const GITHUB_EXPORT_MANIFEST_VERSION = 1 as const;

export interface GitHubExportFile {
  path: string;
  content: string;
}

export interface GitHubExportPlan {
  files: GitHubExportFile[];
  deletionPaths: string[];
}

export interface GitHubExportManifest {
  version: typeof GITHUB_EXPORT_MANIFEST_VERSION;
  paths: string[];
}

export interface GitHubExportPlanOptions {
  /**
   * Paths Sajtmaskin wrote on the previous export. Absent/empty means first
   * export: delete nothing.
   */
  previousManifestPaths?: Iterable<string>;
  /**
   * Blob paths currently in the target repo. Used to emit deletions only for
   * paths that still exist in the base tree, and to detect file↔directory
   * conflicts.
   */
  existingBlobPaths?: Iterable<string>;
}

export class GitHubExportPathConflictError extends Error {
  readonly code = "github_export_path_conflict" as const;
  readonly existingPath: string;
  readonly exportPath: string;

  constructor(existingPath: string, exportPath: string) {
    super(
      `GitHub export blocked: existing path "${existingPath}" conflicts with "${exportPath}" (file/directory swap). Sajtmaskin will not delete a path it does not own.`,
    );
    this.name = "GitHubExportPathConflictError";
    this.existingPath = existingPath;
    this.exportPath = exportPath;
  }
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
 * Paths that must never receive a deletion entry, even if a previous
 * (buggy or hand-edited) manifest listed them.
 */
export function isProtectedGitHubExportPath(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower === "readme" || lower === "readme.md" || lower === "readme.txt") {
    return true;
  }
  if (
    lower === "license" ||
    lower === "license.md" ||
    lower === "licence" ||
    lower === "licence.md"
  ) {
    return true;
  }
  return lower === ".github/workflows" || lower.startsWith(".github/workflows/");
}

export function parseGitHubExportManifest(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as Partial<GitHubExportManifest>;
    if (parsed.version !== GITHUB_EXPORT_MANIFEST_VERSION || !Array.isArray(parsed.paths)) {
      return [];
    }
    return parsed.paths.filter((path): path is string => typeof path === "string" && path.length > 0);
  } catch {
    return [];
  }
}

export function serializeGitHubExportManifest(paths: Iterable<string>): string {
  const unique = Array.from(
    new Set(
      Array.from(paths)
        .map((path) => (typeof path === "string" ? path : ""))
        .filter((path) => path.length > 0),
    ),
  ).sort();
  const manifest: GitHubExportManifest = {
    version: GITHUB_EXPORT_MANIFEST_VERSION,
    paths: unique,
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function pathsConflictAsFileAndDirectory(a: string, b: string): boolean {
  return a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function collectCurrentFiles(projectFiles: CodeFile[]): Map<string, GitHubExportFile> {
  const currentFiles = new Map<string, GitHubExportFile>();
  for (const file of projectFiles) {
    if (typeof file.path !== "string" || typeof file.content !== "string") continue;
    const path = normalizeGitHubExportPath(file.path);
    if (!path || path === GITHUB_EXPORT_MANIFEST_PATH) continue;
    currentFiles.set(path, { path, content: file.content });
  }
  return currentFiles;
}

/**
 * Plan a GitHub tree update on top of `base_tree`.
 *
 * Deletion policy (E1): never blindly wipe the target repo. The export writes
 * `.sajtmaskin/export-manifest.json` listing Sajtmaskin-owned paths and sends
 * deletion entries ONLY for paths that were in that previous manifest, are
 * missing from the current portable artifact, and still exist in the read
 * base tree. A stale manifest path that is already gone is skipped; the new
 * manifest still drops it. README, LICENSE, `.github/workflows/**` and every
 * path outside the previous manifest are left untouched. A repo without a
 * previous manifest is a first export and deletes nothing.
 *
 * File↔directory swaps on the same path are allowed only when the conflicting
 * existing blob is Sajtmaskin-owned (listed in the previous manifest). An
 * unowned conflict fails closed instead of deleting a user file.
 */
export function buildGitHubExportPlan(
  projectFiles: CodeFile[],
  options: GitHubExportPlanOptions = {},
): GitHubExportPlan {
  const currentFiles = collectCurrentFiles(projectFiles);
  const currentPaths = new Set(currentFiles.keys());

  const previousManifestPaths = Array.from(
    new Set(
      Array.from(options.previousManifestPaths ?? [])
        .map((path) => (typeof path === "string" ? normalizeGitHubExportPath(path) : null))
        .filter((path): path is string => Boolean(path)),
    ),
  );

  const existingBlobPaths = Array.from(
    new Set(
      Array.from(options.existingBlobPaths ?? [])
        .filter((path): path is string => typeof path === "string" && path.length > 0),
    ),
  );
  const existingBlobSet = new Set(existingBlobPaths);

  const ownedPrevious = new Set(
    previousManifestPaths.filter((path) => !isProtectedGitHubExportPath(path)),
  );

  // Only previous Sajtmaskin-owned paths that disappeared from this export
  // and still exist in the base tree. GitHub Create-tree errors on a
  // deletion for a path that is not in `base_tree`. First export (empty
  // previous manifest) therefore deletes nothing.
  const deletionPaths = previousManifestPaths
    .filter(
      (path) =>
        !currentPaths.has(path) &&
        path !== GITHUB_EXPORT_MANIFEST_PATH &&
        !isProtectedGitHubExportPath(path) &&
        existingBlobSet.has(path),
    )
    .sort();
  const deletionSet = new Set(deletionPaths);

  const remainingExisting = existingBlobPaths.filter(
    (path) => !deletionSet.has(path) && !currentPaths.has(path),
  );
  for (const exportPath of currentPaths) {
    for (const existingPath of remainingExisting) {
      if (!pathsConflictAsFileAndDirectory(exportPath, existingPath)) continue;
      if (ownedPrevious.has(existingPath)) {
        deletionSet.add(existingPath);
        continue;
      }
      throw new GitHubExportPathConflictError(existingPath, exportPath);
    }
  }

  const resolvedDeletions = Array.from(deletionSet)
    .filter((path) => existingBlobSet.has(path))
    .sort();

  const manifestPaths = [...currentPaths, GITHUB_EXPORT_MANIFEST_PATH].sort();
  currentFiles.set(GITHUB_EXPORT_MANIFEST_PATH, {
    path: GITHUB_EXPORT_MANIFEST_PATH,
    content: serializeGitHubExportManifest(manifestPaths),
  });

  return {
    files: Array.from(currentFiles.values()).sort((a, b) => a.path.localeCompare(b.path)),
    deletionPaths: resolvedDeletions,
  };
}
