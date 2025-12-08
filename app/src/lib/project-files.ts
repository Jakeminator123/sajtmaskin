/**
 * Project Files Utilities
 * =======================
 *
 * Centralized functions for loading project files with proper fallback chain:
 * 1. Redis cache (fast, short-lived 1h TTL)
 * 2. SQLite (source of truth for takeover projects)
 * 3. Legacy project_data (v0 payload for non-takeover projects)
 *
 * This eliminates code duplication across:
 * - /api/projects/[id]/files
 * - /api/projects/[id]/download
 * - /api/projects/[id]/analyze
 * - openai-agent.ts
 */

import { getProjectFiles, saveProjectFiles, ProjectFile } from "./redis";
import {
  getProjectData,
  getProjectFilesFromDb,
  saveProjectFilesToDb,
} from "./database";

/**
 * Load project files with full fallback chain.
 * Automatically caches to Redis and persists legacy data to SQLite.
 *
 * @param projectId - The project ID to load files for
 * @returns Array of project files, or empty array if none found
 */
export async function loadProjectFilesWithFallback(
  projectId: string
): Promise<ProjectFile[]> {
  // 1) Redis cache first (fastest)
  try {
    const redisFiles = await getProjectFiles(projectId);
    if (redisFiles && redisFiles.length > 0) {
      return redisFiles;
    }
  } catch (error) {
    console.warn("[project-files] Redis read failed:", error);
  }

  // 2) SQLite (source of truth for takeover projects)
  try {
    const dbFiles = getProjectFilesFromDb(projectId);
    if (dbFiles && dbFiles.length > 0) {
      const files: ProjectFile[] = dbFiles.map((file) => ({
        path: file.path,
        content: file.content,
        lastModified: file.updated_at || file.created_at,
      }));

      // Seed Redis cache (best-effort)
      try {
        await saveProjectFiles(projectId, files);
      } catch (cacheError) {
        console.warn(
          "[project-files] Failed to cache SQLite files in Redis:",
          cacheError
        );
      }

      return files;
    }
  } catch (dbError) {
    console.error("[project-files] SQLite read failed:", dbError);
  }

  // 3) Legacy project_data fallback (v0 payload)
  try {
    const projectData = getProjectData(projectId);
    if (
      projectData?.files &&
      Array.isArray(projectData.files) &&
      projectData.files.length > 0
    ) {
      const filesFromLegacy: ProjectFile[] = projectData.files
        .filter(
          (f: unknown): f is { name: string; content: string } =>
            f !== null &&
            typeof f === "object" &&
            "name" in f &&
            "content" in f &&
            typeof (f as { name: unknown }).name === "string" &&
            typeof (f as { content: unknown }).content === "string"
        )
        .map((f) => ({
          path: f.name,
          content: f.content,
          lastModified: new Date().toISOString(),
        }));

      if (filesFromLegacy.length > 0) {
        // Persist to SQLite (migrate legacy data)
        try {
          saveProjectFilesToDb(projectId, filesFromLegacy);
        } catch (persistError) {
          console.warn(
            "[project-files] Failed to persist legacy files to SQLite:",
            persistError
          );
        }

        // Cache in Redis (best-effort)
        try {
          await saveProjectFiles(projectId, filesFromLegacy);
        } catch (cacheError) {
          console.warn(
            "[project-files] Failed to cache legacy files in Redis:",
            cacheError
          );
        }

        return filesFromLegacy;
      }
    }
  } catch (legacyError) {
    console.error("[project-files] Legacy data read failed:", legacyError);
  }

  return [];
}

/**
 * Check if a project has any files available.
 * Faster than loading all files when you just need to check existence.
 */
export async function hasProjectFiles(projectId: string): Promise<boolean> {
  // Check Redis first
  try {
    const redisFiles = await getProjectFiles(projectId);
    if (redisFiles && redisFiles.length > 0) {
      return true;
    }
  } catch {
    // Continue to SQLite check
  }

  // Check SQLite
  try {
    const dbFiles = getProjectFilesFromDb(projectId);
    if (dbFiles && dbFiles.length > 0) {
      return true;
    }
  } catch {
    // Continue to legacy check
  }

  // Check legacy
  try {
    const projectData = getProjectData(projectId);
    if (
      projectData?.files &&
      Array.isArray(projectData.files) &&
      projectData.files.length > 0
    ) {
      return true;
    }
  } catch {
    // No files found
  }

  return false;
}
