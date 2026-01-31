/**
 * Project Cleanup & Storage Management
 * =====================================
 *
 * Handles cleanup of abandoned projects and storage optimization.
 *
 * CLEANUP POLICIES:
 * - Anonymous session projects: Delete after 7 days of inactivity
 * - Authenticated user projects: Soft-delete after 30 days of inactivity
 * - Template cache: Auto-expires after 7 days
 * - AI-generated images: Delete with project
 */

import { and, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  appProjects,
  companyProfiles,
  images,
  projectData,
  projectFiles,
  templateCache,
  users,
} from "@/lib/db/schema";

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
  anonymousCutoff.setDate(anonymousCutoff.getDate() - CLEANUP_CONFIG.ANONYMOUS_PROJECT_TTL_DAYS);

  const anonymousProjects = await db
    .select({ id: appProjects.id })
    .from(appProjects)
    .where(
      and(
        isNull(appProjects.user_id),
        isNotNull(appProjects.session_id),
        lt(appProjects.updated_at, anonymousCutoff),
      ),
    );

  for (const project of anonymousProjects) {
    await deleteProjectAndData(project.id);
    result.deletedAnonymousProjects++;
  }

  // 1b. Delete projects that were never saved (no chat_id or demo_url in project_data)
  const unsavedCutoff = new Date();
  unsavedCutoff.setHours(unsavedCutoff.getHours() - CLEANUP_CONFIG.UNSAVED_PROJECT_TTL_HOURS);

  const unsavedProjects = await db
    .select({ id: appProjects.id })
    .from(appProjects)
    .leftJoin(projectData, eq(projectData.project_id, appProjects.id))
    .where(
      and(
        lt(appProjects.created_at, unsavedCutoff),
        or(isNull(projectData.chat_id), eq(projectData.chat_id, "")),
        or(isNull(projectData.demo_url), eq(projectData.demo_url, "")),
      ),
    );

  for (const project of unsavedProjects) {
    await deleteProjectAndData(project.id);
    result.deletedUnsaveProjects++;
  }

  // 2. Clean up expired template cache
  const expiredCaches = await db
    .delete(templateCache)
    .where(lt(templateCache.expires_at, new Date()))
    .returning({ id: templateCache.id });
  result.expiredTemplateCaches = expiredCaches.length;

  // 2b. Clean up template cache entries for deleted users
  const orphanedTemplateCache = await db
    .delete(templateCache)
    .where(
      and(
        isNotNull(templateCache.user_id),
        sql`${templateCache.user_id} NOT IN (SELECT ${users.id} FROM ${users})`,
      ),
    )
    .returning({ id: templateCache.id });
  console.log(
    "[Cleanup] Removed",
    orphanedTemplateCache.length,
    "orphaned template cache entries",
  );

  // 3. Clean up orphaned project files (no matching project)
  const orphanedFiles = await db
    .delete(projectFiles)
    .where(sql`${projectFiles.project_id} NOT IN (SELECT ${appProjects.id} FROM ${appProjects})`)
    .returning({ id: projectFiles.id });

  // 4. Clean up orphaned images
  const orphanedImages = await db
    .delete(images)
    .where(sql`${images.project_id} NOT IN (SELECT ${appProjects.id} FROM ${appProjects})`)
    .returning({ id: images.id });

  console.log("[Cleanup] Completed:", {
    deletedAnonymous: result.deletedAnonymousProjects,
    deletedUnsave: result.deletedUnsaveProjects,
    expiredCaches: result.expiredTemplateCaches,
    orphanedFiles: orphanedFiles.length,
    orphanedImages: orphanedImages.length,
  });

  return result;
}

/**
 * Delete a project and all associated data
 */
async function deleteProjectAndData(projectId: string): Promise<void> {
  await db.delete(projectData).where(eq(projectData.project_id, projectId));
  await db.delete(projectFiles).where(eq(projectFiles.project_id, projectId));
  await db.delete(images).where(eq(images.project_id, projectId));
  await db.delete(companyProfiles).where(eq(companyProfiles.project_id, projectId));
  await db.delete(appProjects).where(eq(appProjects.id, projectId));
}

/**
 * Check if user can create more projects
 * Returns { allowed: boolean, reason?: string, limit: number, current: number }
 */
export async function canCreateProject(
  userId: string | null,
  sessionId: string | null,
  isPaidUser: boolean = false,
): Promise<{ allowed: boolean; reason?: string; limit: number; current: number }> {
  if (userId) {
    // Authenticated user
    const limit = isPaidUser
      ? CLEANUP_CONFIG.MAX_USER_PROJECTS_PAID
      : CLEANUP_CONFIG.MAX_USER_PROJECTS_FREE;

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(appProjects)
      .where(eq(appProjects.user_id, userId));

    const current = count || 0;

    if (current >= limit) {
      return {
        allowed: false,
        reason: isPaidUser
          ? "Du har nått maxgränsen för projekt. Ta bort gamla projekt för att skapa nya."
          : "Du har nått maxgränsen för gratiskonton (10 projekt). Uppgradera för fler!",
        limit,
        current,
      };
    }

    return { allowed: true, limit, current };
  } else if (sessionId) {
    // Anonymous session
    const limit = CLEANUP_CONFIG.MAX_ANONYMOUS_PROJECTS_PER_SESSION;
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(appProjects)
      .where(eq(appProjects.session_id, sessionId));

    const current = count || 0;

    if (current >= limit) {
      return {
        allowed: false,
        reason: "Gästkonton kan skapa max 3 projekt. Logga in för att spara fler!",
        limit,
        current,
      };
    }

    return { allowed: true, limit, current };
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
export async function getCleanupStats(): Promise<{
  anonymousProjects: number;
  anonymousProjectsOld: number;
  userProjects: number;
  orphanedFiles: number;
  orphanedImages: number;
  templateCacheCount: number;
  templateCacheExpired: number;
}> {
  const anonymousCutoff = new Date();
  anonymousCutoff.setDate(anonymousCutoff.getDate() - CLEANUP_CONFIG.ANONYMOUS_PROJECT_TTL_DAYS);

  const [{ count: anonymousProjects }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(appProjects)
    .where(and(isNull(appProjects.user_id), isNotNull(appProjects.session_id)));

  const [{ count: anonymousProjectsOld }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(appProjects)
    .where(
      and(
        isNull(appProjects.user_id),
        isNotNull(appProjects.session_id),
        lt(appProjects.updated_at, anonymousCutoff),
      ),
    );

  const [{ count: userProjects }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(appProjects)
    .where(isNotNull(appProjects.user_id));

  const [{ count: orphanedFiles }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(projectFiles)
    .where(sql`${projectFiles.project_id} NOT IN (SELECT ${appProjects.id} FROM ${appProjects})`);

  const [{ count: orphanedImages }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(images)
    .where(sql`${images.project_id} NOT IN (SELECT ${appProjects.id} FROM ${appProjects})`);

  const [{ count: templateCacheCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(templateCache);

  const [{ count: templateCacheExpired }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(templateCache)
    .where(lt(templateCache.expires_at, new Date()));

  return {
    anonymousProjects: anonymousProjects || 0,
    anonymousProjectsOld: anonymousProjectsOld || 0,
    userProjects: userProjects || 0,
    orphanedFiles: orphanedFiles || 0,
    orphanedImages: orphanedImages || 0,
    templateCacheCount: templateCacheCount || 0,
    templateCacheExpired: templateCacheExpired || 0,
  };
}

// Export config for reference
export { CLEANUP_CONFIG };
