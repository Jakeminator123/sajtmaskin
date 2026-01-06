/**
 * Project Cleanup & Storage Management
 * =====================================
 *
 * Handles cleanup of abandoned projects and storage optimization.
 *
 * CLEANUP POLICIES:
 * - Anonymous session projects: Delete after 7 days of inactivity
 * - Authenticated user projects: Soft-delete after 30 days of inactivity
 * - Template cache: Auto-expires after 7 days (handled by database.ts)
 * - AI-generated images: Delete with project
 *
 * V0/VERCEL PROTECTION:
 * - Official templates: Cached chat_id is READ-ONLY, never modified by users
 * - User projects: Get their OWN chat_id when cloned from template
 * - This ensures user edits don't affect the template or spam V0
 */

import { getDb } from "@/lib/data/database";

// Cleanup configuration
const CLEANUP_CONFIG = {
  // Days before anonymous session projects are deleted
  ANONYMOUS_PROJECT_TTL_DAYS: 7,

  // Hours before deleting projects that were never saved (draft projects)
  UNSAVED_PROJECT_TTL_HOURS: 24,

  // Days before showing "inactive" warning to authenticated users
  USER_PROJECT_INACTIVE_WARNING_DAYS: 30,

  // Days before soft-deleting inactive authenticated user projects
  USER_PROJECT_SOFT_DELETE_DAYS: 90,

  // Days before hard-deleting soft-deleted projects
  HARD_DELETE_AFTER_SOFT_DELETE_DAYS: 30,

  // Max projects per anonymous session (prevent abuse)
  MAX_ANONYMOUS_PROJECTS_PER_SESSION: 3,

  // Max projects per authenticated user (free tier)
  // NOTE: User requested max 8 for "personal templates/started projects"
  MAX_USER_PROJECTS_FREE: 8,

  // Max projects per authenticated user (paid)
  MAX_USER_PROJECTS_PAID: 100,
};

export interface CleanupResult {
  deletedAnonymousProjects: number;
  deletedUnsaveProjects: number;
  softDeletedUserProjects: number;
  hardDeletedProjects: number;
  freedStorageBytes: number;
  expiredTemplateCaches: number;
}

/**
 * Run full cleanup cycle
 * Call this periodically (e.g., daily cron job or on startup)
 */
export async function runCleanup(): Promise<CleanupResult> {
  const db = getDb();
  const result: CleanupResult = {
    deletedAnonymousProjects: 0,
    deletedUnsaveProjects: 0,
    softDeletedUserProjects: 0,
    hardDeletedProjects: 0,
    freedStorageBytes: 0,
    expiredTemplateCaches: 0,
  };

  console.log("[Cleanup] Starting cleanup cycle...");

  // 1. Delete old anonymous session projects
  const anonymousCutoff = new Date();
  anonymousCutoff.setDate(
    anonymousCutoff.getDate() - CLEANUP_CONFIG.ANONYMOUS_PROJECT_TTL_DAYS
  );

  const anonymousProjects = db
    .prepare(
      `
    SELECT id FROM projects 
    WHERE user_id IS NULL 
    AND session_id IS NOT NULL 
    AND datetime(updated_at) < datetime(?)
  `
    )
    .all(anonymousCutoff.toISOString()) as Array<{ id: string }>;

  for (const project of anonymousProjects) {
    deleteProjectAndData(project.id);
    result.deletedAnonymousProjects++;
  }

  // 1b. Delete projects that were never saved (no chat_id or demo_url in project_data)
  // These are projects created but never actually used
  const unsavedCutoff = new Date();
  unsavedCutoff.setHours(
    unsavedCutoff.getHours() - CLEANUP_CONFIG.UNSAVED_PROJECT_TTL_HOURS
  );

  const unsavedProjects = db
    .prepare(
      `
    SELECT p.id FROM projects p
    LEFT JOIN project_data pd ON p.id = pd.project_id
    WHERE (pd.chat_id IS NULL OR pd.chat_id = '')
    AND (pd.demo_url IS NULL OR pd.demo_url = '')
    AND datetime(p.created_at) < datetime(?)
  `
    )
    .all(unsavedCutoff.toISOString()) as Array<{ id: string }>;

  for (const project of unsavedProjects) {
    deleteProjectAndData(project.id);
    result.deletedUnsaveProjects++;
  }

  // 2. Clean up expired template cache
  const expiredCaches = db
    .prepare(
      "DELETE FROM template_cache WHERE datetime(expires_at) <= datetime('now')"
    )
    .run();
  result.expiredTemplateCaches = expiredCaches.changes;

  // 2b. Clean up template cache entries for deleted users
  const orphanedTemplateCache = db
    .prepare(
      `DELETE FROM template_cache 
       WHERE user_id IS NOT NULL 
       AND user_id NOT IN (SELECT id FROM users)`
    )
    .run();
  console.log(
    "[Cleanup] Removed",
    orphanedTemplateCache.changes,
    "orphaned template cache entries"
  );

  // 3. Clean up orphaned project files (no matching project)
  const orphanedFiles = db
    .prepare(
      `
    DELETE FROM project_files 
    WHERE project_id NOT IN (SELECT id FROM projects)
  `
    )
    .run();

  // 4. Clean up orphaned images
  const orphanedImages = db
    .prepare(
      `
    DELETE FROM images 
    WHERE project_id NOT IN (SELECT id FROM projects)
  `
    )
    .run();

  console.log("[Cleanup] Completed:", {
    deletedAnonymous: result.deletedAnonymousProjects,
    deletedUnsave: result.deletedUnsaveProjects,
    expiredCaches: result.expiredTemplateCaches,
    orphanedFiles: orphanedFiles.changes,
    orphanedImages: orphanedImages.changes,
  });

  return result;
}

/**
 * Delete a project and all associated data
 */
function deleteProjectAndData(projectId: string): void {
  const db = getDb();

  // Delete associated data (cascades handle most, but be explicit)
  db.prepare("DELETE FROM project_data WHERE project_id = ?").run(projectId);
  db.prepare("DELETE FROM project_files WHERE project_id = ?").run(projectId);
  db.prepare("DELETE FROM images WHERE project_id = ?").run(projectId);
  db.prepare("DELETE FROM company_profiles WHERE project_id = ?").run(
    projectId
  );

  // Delete the project itself
  db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
}

/**
 * Check if user can create more projects
 * Returns { allowed: boolean, reason?: string, limit: number, current: number }
 */
export function canCreateProject(
  userId: string | null,
  sessionId: string | null,
  isPaidUser: boolean = false
): { allowed: boolean; reason?: string; limit: number; current: number } {
  const db = getDb();

  if (userId) {
    // Authenticated user
    const limit = isPaidUser
      ? CLEANUP_CONFIG.MAX_USER_PROJECTS_PAID
      : CLEANUP_CONFIG.MAX_USER_PROJECTS_FREE;

    const count =
      (
        db
          .prepare("SELECT COUNT(*) as count FROM projects WHERE user_id = ?")
          .get(userId) as { count: number } | undefined
      )?.count || 0;

    if (count >= limit) {
      return {
        allowed: false,
        reason: isPaidUser
          ? "Du har nått maxgränsen för projekt. Ta bort gamla projekt för att skapa nya."
          : "Du har nått maxgränsen för gratiskonton (10 projekt). Uppgradera för fler!",
        limit,
        current: count,
      };
    }

    return { allowed: true, limit, current: count };
  } else if (sessionId) {
    // Anonymous session
    const limit = CLEANUP_CONFIG.MAX_ANONYMOUS_PROJECTS_PER_SESSION;
    const count =
      (
        db
          .prepare(
            "SELECT COUNT(*) as count FROM projects WHERE session_id = ?"
          )
          .get(sessionId) as { count: number } | undefined
      )?.count || 0;

    if (count >= limit) {
      return {
        allowed: false,
        reason:
          "Gästkonton kan skapa max 3 projekt. Logga in för att spara fler!",
        limit,
        current: count,
      };
    }

    return { allowed: true, limit, current: count };
  }

  return {
    allowed: false,
    reason: "Ingen session hittades",
    limit: 0,
    current: 0,
  };
}

/**
 * Get cleanup statistics for admin dashboard
 */
export function getCleanupStats(): {
  anonymousProjects: number;
  anonymousProjectsOld: number;
  userProjects: number;
  orphanedFiles: number;
  orphanedImages: number;
  templateCacheCount: number;
  templateCacheExpired: number;
} {
  const db = getDb();

  const anonymousCutoff = new Date();
  anonymousCutoff.setDate(
    anonymousCutoff.getDate() - CLEANUP_CONFIG.ANONYMOUS_PROJECT_TTL_DAYS
  );

  const anonymousProjects =
    (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM projects WHERE user_id IS NULL AND session_id IS NOT NULL"
        )
        .get() as { count: number } | undefined
    )?.count || 0;

  const anonymousProjectsOld =
    (
      db
        .prepare(
          `SELECT COUNT(*) as count FROM projects 
           WHERE user_id IS NULL AND session_id IS NOT NULL 
           AND datetime(updated_at) < datetime(?)`
        )
        .get(anonymousCutoff.toISOString()) as { count: number } | undefined
    )?.count || 0;

  const userProjects =
    (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM projects WHERE user_id IS NOT NULL"
        )
        .get() as { count: number } | undefined
    )?.count || 0;

  const orphanedFiles =
    (
      db
        .prepare(
          `SELECT COUNT(*) as count FROM project_files 
           WHERE project_id NOT IN (SELECT id FROM projects)`
        )
        .get() as { count: number } | undefined
    )?.count || 0;

  const orphanedImages =
    (
      db
        .prepare(
          `SELECT COUNT(*) as count FROM images 
           WHERE project_id NOT IN (SELECT id FROM projects)`
        )
        .get() as { count: number } | undefined
    )?.count || 0;

  const templateCacheCount =
    (
      db.prepare("SELECT COUNT(*) as count FROM template_cache").get() as
        | {
            count: number;
          }
        | undefined
    )?.count || 0;

  const templateCacheExpired =
    (
      db
        .prepare(
          "SELECT COUNT(*) as count FROM template_cache WHERE datetime(expires_at) <= datetime('now')"
        )
        .get() as { count: number } | undefined
    )?.count || 0;

  return {
    anonymousProjects,
    anonymousProjectsOld,
    userProjects,
    orphanedFiles,
    orphanedImages,
    templateCacheCount,
    templateCacheExpired,
  };
}

// Export config for reference
export { CLEANUP_CONFIG };
