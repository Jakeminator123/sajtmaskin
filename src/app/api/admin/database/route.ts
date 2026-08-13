/**
 * API Route: Admin Database Operations
 * GET /api/admin/database - Get database stats
 * POST /api/admin/database - Clear/reset database tables, manage uploads
 */

import { and, desc, isNotNull, isNull, lt, notInArray, sql } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/admin";
import { db } from "@/lib/db/client";
import {
  appProjects,
  companyProfiles,
  domainOrders,
  guestUsage,
  images,
  mediaLibrary,
  pageViews,
  projectData,
  projectFiles,
  templateCache,
  transactions,
  users,
} from "@/lib/db/schema";
import { TEST_USER_EMAIL, getUploadsDir } from "@/lib/db/services/shared";
import { getRedisInfo, flushRedisCache } from "@/lib/data/redis";
import { FEATURES, PATHS } from "@/lib/config";

async function countTable(table: unknown): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)` }).from(table as never);
  return (rows[0] as { count: number } | undefined)?.count ?? 0;
}

/**
 * Emails that a "clear users" style action must NEVER delete.
 *
 * Includes the acting admin: every user-deleting action here previously kept
 * only `TEST_USER_EMAIL`, so an admin from `ADMIN_EMAILS` who pressed "rensa
 * användare" / "nollställ allt" deleted their OWN account mid-session. The JWT
 * then pointed at a missing user, which locked them out of the admin panel (and
 * the app) with no way back except a manual DB insert.
 */
function protectedUserEmails(actingAdminEmail: string | null | undefined): string[] {
  const emails = new Set<string>();
  if (TEST_USER_EMAIL) emails.add(TEST_USER_EMAIL);
  const acting = (actingAdminEmail ?? "").trim();
  if (acting) emails.add(acting);
  return Array.from(emails);
}

/** Delete every user except the protected ones (see `protectedUserEmails`). */
async function deleteUsersExceptProtected(actingAdminEmail: string | null | undefined) {
  const keep = protectedUserEmails(actingAdminEmail);
  const query = db.delete(users);
  return keep.length > 0
    ? query.where(notInArray(users.email, keep)).returning({ id: users.id })
    : query.where(sql`true`).returning({ id: users.id });
}

/**
 * Wipe this environment's data in FOREIGN-KEY-SAFE order: children before their
 * parents, users last.
 *
 * Both `reset-all` and its legacy alias `mega-cleanup` route through here.
 * `mega-cleanup` used to fire the same deletes concurrently via `Promise.all`
 * (Bugbot medium on #611): with child rows still referencing `app_projects`, an
 * overlapping delete can raise an FK error and abort mid-run, leaving the
 * database half-cleared. Sequential and shared means one behaviour, one order.
 */
async function resetEnvironmentData(actingAdminEmail: string | null | undefined): Promise<{
  deletedRows: number;
  flushedRedisKeys: number;
  /**
   * False when this environment has no cache at all. `flushRedisCache()` returns
   * `-1` both for "not configured" and for "flush failed", and treating the
   * former as a failure made the whole reset report failure in every
   * Redis-less environment (caught while verifying the FK-order rewrite).
   */
  redisConfigured: boolean;
}> {
  let deletedRows = 0;

  // Order matters: rows that reference app_projects go first.
  const orderedTables = [
    projectFiles,
    projectData,
    images,
    mediaLibrary,
    companyProfiles,
    templateCache,
    pageViews,
    guestUsage,
    transactions,
    domainOrders,
    appProjects,
  ];

  for (const table of orderedTables) {
    const rows = await db
      .delete(table)
      .where(sql`true`)
      .returning({ id: sql<string>`'row'` });
    deletedRows += rows.length;
  }

  const deletedUsers = await deleteUsersExceptProtected(actingAdminEmail);
  deletedRows += deletedUsers.length;

  const redisConfigured = FEATURES.useRedisCache;
  const flushedRedisKeys = redisConfigured ? await flushRedisCache() : 0;
  clearUploadsFolder();

  return { deletedRows, flushedRedisKeys, redisConfigured };
}

async function getDbFileSize(): Promise<string> {
  try {
    const result = await db.execute(
      sql`select pg_size_pretty(pg_database_size(current_database())) as size`,
    );
    const size = (result.rows?.[0] as { size?: string } | undefined)?.size;
    return size || "Unknown";
  } catch {
    return "Unknown";
  }
}

// Get database stats
export async function GET(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) {
    return admin.response;
  }

  const action = req.nextUrl.searchParams.get("action");

  try {
    if (action === "download") {
      return NextResponse.json(
        { success: false, error: "Database download is not supported for Supabase." },
        { status: 400 },
      );
    }

    const uploadsInfo = getUploadsInfo();
    const templateCacheCount = await countTable(templateCache);
    const templateCacheExpiredRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(templateCache)
      .where(lt(templateCache.expires_at, new Date()));
    const templateCacheExpired = templateCacheExpiredRows[0]?.count ?? 0;

    const stats = {
      database: {
        users: await countTable(users),
        projects: await countTable(appProjects),
        pageViews: await countTable(pageViews),
        transactions: await countTable(transactions),
        guestUsage: await countTable(guestUsage),
        companyProfiles: await countTable(companyProfiles),
        templateCache: templateCacheCount,
        templateCacheExpired: templateCacheExpired,
      },
      redis: await getRedisInfo(),
      dbFileSize: await getDbFileSize(),
      uploads: uploadsInfo,
      dataDir: PATHS.dataDir,
    };

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error("[API/admin/database] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get database stats" },
      { status: 500 },
    );
  }
}

// Clear database tables
export async function POST(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) {
    return admin.response;
  }

  try {
    const body = await req.json();
    const { action } = body as { action?: string };
    const table = (body as { table?: string }).table;

    if (action === "clear") {
      const tableMap = {
        page_views: pageViews,
        guest_usage: guestUsage,
        transactions: transactions,
        projects: appProjects,
        company_profiles: companyProfiles,
        users: users,
        template_cache: templateCache,
        media_library: mediaLibrary,
        project_data: projectData,
        project_files: projectFiles,
        images: images,
        domain_orders: domainOrders,
      } as const;

      type TableKey = keyof typeof tableMap;
      const isTableKey = (value: string): value is TableKey =>
        Object.prototype.hasOwnProperty.call(tableMap, value);

      if (!table || !isTableKey(table)) {
        return NextResponse.json({ success: false, error: "Invalid table name" }, { status: 400 });
      }

      if (table === "users") {
        await deleteUsersExceptProtected(admin.user.email);
      } else if (table === "projects") {
        await db.delete(projectData).where(sql`true`);
        await db.delete(projectFiles).where(sql`true`);
        await db.delete(images).where(sql`true`);
        await db.delete(companyProfiles).where(sql`true`);
        await db.delete(domainOrders).where(sql`true`);
        await db.delete(appProjects).where(sql`true`);
      } else {
        await db.delete(tableMap[table]).where(sql`true`);
      }

      console.info(`[Admin] Cleared table: ${table}`);
      return NextResponse.json({ success: true, message: `Cleared ${table}` });
    }

    if (action === "flush-redis") {
      if (!FEATURES.useRedisCache) {
        return NextResponse.json({
          success: false,
          error: "Ingen cache är konfigurerad i den här miljön — det finns inget att tömma.",
        });
      }
      // BUG-FIX 2026-04-24: flushRedisCache rensar nu BARA REDIS_KEY_PREFIX-scope
      // (dev:/preview:/prod:) — inte hela databasen som tidigare. Returvärdet
      // är antalet raderade nycklar (eller -1 vid fel).
      const deleted = await flushRedisCache();
      const success = deleted >= 0;
      return NextResponse.json({
        success,
        deleted: success ? deleted : null,
        message: success
          ? `Redis cache flushed (${deleted} nycklar i denna miljö)`
          : "Failed to flush Redis",
      });
    }

    if (action === "reset-all" || action === "mega-cleanup") {
      // `mega-cleanup` is the retired alias (see the comment above the Vercel
      // guard) — same data reset, no infrastructure calls.
      const { deletedRows, flushedRedisKeys, redisConfigured } = await resetEnvironmentData(
        admin.user.email,
      );

      // BUG-FIX 2026-04-24 (test-agent rapport): tidigare ignorerades
      // returvärdet från flushRedisCache helt — `success: true` kunde
      // returneras även när Redis-flushen failade. Nu härleds success.
      const redisOk = !redisConfigured || flushedRedisKeys >= 0;
      console.info(
        `[Admin] Reset environment data (rows: ${deletedRows}, Redis: ${
          !redisConfigured ? "not configured" : redisOk ? `${flushedRedisKeys} keys flushed` : "FAILED"
        })`,
      );
      return NextResponse.json({
        success: redisOk,
        partialSuccess: !redisOk,
        results: {
          database: { deleted: deletedRows },
          redis: { success: redisOk, deleted: redisOk ? flushedRedisKeys : 0 },
        },
        redisFlushedKeys: redisOk ? flushedRedisKeys : null,
        message: !redisConfigured
          ? `Nollställning: ${deletedRows} databasrader (ingen cache konfigurerad i den här miljön)`
          : redisOk
            ? `Nollställning: ${deletedRows} databasrader, ${flushedRedisKeys} cachenycklar`
            : `Nollställning: ${deletedRows} databasrader (cachen kunde inte tömmas — se serverloggen)`,
      });
    }

    if (action === "clear-uploads") {
      const result = clearUploadsFolder();
      return NextResponse.json({
        success: result.success,
        message: result.success
          ? `Deleted ${result.deletedCount} files (${result.freedSpace})`
          : result.error,
        deletedCount: result.deletedCount,
        freedSpace: result.freedSpace,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TEMPLATE CACHE MANAGEMENT — LEGACY, NO UI (2026-07-24)
    //
    // The `template_cache` table is a leftover from the removed v0-API template
    // sync: nothing in runtime writes it any more (the Blob manifest owns the
    // gallery, `src/lib/templates/`), and `project-cleanup.ts` only deletes
    // expired rows. The admin UI block that exposed export/import/extend/clear
    // was removed because it was dead surface. The actions are kept here (and the
    // table untouched) so nothing breaks for an existing script or bookmark;
    // dropping table + actions is a separate decision tracked in
    // BUG-SWARM-BACKLOG.md.
    // ═══════════════════════════════════════════════════════════════════════

    if (action === "export-templates") {
      const templates = await db
        .select()
        .from(templateCache)
        .orderBy(desc(templateCache.created_at));

      const exportData = templates.map((t) => ({
        templateId: t.template_id,
        chatId: t.chat_id,
        demoUrl: t.demo_url,
        versionId: t.version_id,
        code: t.code,
        files: t.files_json ? JSON.parse(t.files_json) : null,
        model: t.model,
        createdAt: t.created_at,
      }));

      console.info(`[Admin] Exported ${templates.length} templates`);
      return NextResponse.json({
        success: true,
        count: templates.length,
        templates: exportData,
        exportedAt: new Date().toISOString(),
      });
    }

    if (action === "import-templates") {
      type ImportTemplate = {
        templateId?: string;
        chatId?: string;
        demoUrl?: string | null;
        versionId?: string | null;
        code?: string | null;
        files?: unknown;
        model?: string | null;
        createdAt?: string;
      };

      const { templates } = body as { templates?: unknown[] };

      if (!templates || !Array.isArray(templates)) {
        return NextResponse.json(
          { success: false, error: "Invalid templates array" },
          { status: 400 },
        );
      }

      let imported = 0;
      let failed = 0;
      let skipped = 0;
      const failures: Array<{ templateId: string; error: string }> = [];
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      for (const t of templates as ImportTemplate[]) {
        if (!t.templateId || !t.chatId) {
          skipped++;
          continue;
        }
        try {
          await db
            .insert(templateCache)
            .values({
              template_id: t.templateId,
              user_id: null,
              chat_id: t.chatId,
              demo_url: t.demoUrl || null,
              version_id: t.versionId || null,
              code: t.code || null,
              files_json: t.files ? JSON.stringify(t.files) : null,
              model: t.model || null,
              created_at: new Date(),
              expires_at: expiresAt,
            })
            .onConflictDoUpdate({
              target: [templateCache.template_id, templateCache.user_id],
              set: {
                chat_id: t.chatId,
                demo_url: t.demoUrl || null,
                version_id: t.versionId || null,
                code: t.code || null,
                files_json: t.files ? JSON.stringify(t.files) : null,
                model: t.model || null,
                created_at: new Date(),
                expires_at: expiresAt,
              },
            });
          imported++;
        } catch (err) {
          failed++;
          const errMsg = err instanceof Error ? err.message : String(err);
          failures.push({ templateId: t.templateId, error: errMsg });
          console.error("[Admin] Failed to import template:", t.templateId, err);
        }
      }

      // BUG-FIX 2026-04-24 (test-agent rapport): tidigare alltid `success: true`
      // även när enstaka inserts failade. Nu reflekteras `failed` i success.
      const allOk = failed === 0;
      console.info(
        `[Admin] Imported ${imported} templates (failed: ${failed}, skipped: ${skipped})`,
      );
      return NextResponse.json({
        success: allOk,
        partialSuccess: !allOk && imported > 0,
        imported,
        failed,
        skipped,
        failures: failed > 0 ? failures : undefined,
        message: allOk
          ? `Imported ${imported} templates`
          : `Imported ${imported}/${imported + failed} templates (${failed} failed${skipped > 0 ? `, ${skipped} skipped` : ""})`,
      });
    }

    if (action === "clear-template-cache") {
      const deleted = await db
        .delete(templateCache)
        .where(sql`true`)
        .returning({ id: templateCache.id });
      console.info(`[Admin] Cleared ${deleted.length} cached templates`);
      return NextResponse.json({
        success: true,
        deleted: deleted.length,
        message: `Cleared ${deleted.length} cached templates`,
      });
    }

    if (action === "extend-template-cache") {
      const newExpiry = new Date();
      newExpiry.setDate(newExpiry.getDate() + 30);

      const updated = await db
        .update(templateCache)
        .set({ expires_at: newExpiry })
        .returning({ id: templateCache.id });

      console.info(`[Admin] Extended cache for ${updated.length} templates`);
      return NextResponse.json({
        success: true,
        extended: updated.length,
        newExpiry: newExpiry.toISOString(),
        message: `Extended cache for ${updated.length} templates to ${newExpiry.toLocaleDateString()}`,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CLEANUP ACTIONS - Manage old projects and storage
    // ═══════════════════════════════════════════════════════════════════════════

    if (action === "run-cleanup") {
      const { runCleanup, getCleanupStats } = await import("@/lib/projects/project-cleanup");
      const statsBefore = await getCleanupStats();
      const result = await runCleanup();
      const statsAfter = await getCleanupStats();

      return NextResponse.json({
        success: true,
        result,
        statsBefore,
        statsAfter,
        message: `Cleanup: ${result.deletedAnonymousProjects} anonymous projects, ${result.expiredTemplateCaches} expired caches`,
      });
    }

    if (action === "get-cleanup-stats") {
      const { getCleanupStats, CLEANUP_CONFIG } = await import("@/lib/projects/project-cleanup");
      const stats = await getCleanupStats();
      return NextResponse.json({
        success: true,
        stats,
        config: CLEANUP_CONFIG,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RETIRED INFRASTRUCTURE ACTIONS (2026-07-24)
    //
    // `mega-cleanup` and `cleanup-vercel-projects` used to list every Vercel
    // project the access token could see and delete all of them — including
    // Sajtmaskin's own production project — from a two-click admin button.
    //
    // `mega-cleanup` now aliases `reset-all` (data + cache only, handled above),
    // and single-project deletion goes through
    // `DELETE /api/admin/vercel/projects/[projectId]`, which refuses the app's own
    // project via `src/lib/vercel/self-project-guard.ts`. The ids stay routed so
    // an old bookmark/script cannot silently start deleting infrastructure again.
    // ═══════════════════════════════════════════════════════════════════════════
    if (action === "cleanup-vercel-projects") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Bulkradering av Vercel-projekt är borttagen. Radera enskilda projekt under Miljö i adminpanelen.",
        },
        { status: 410 },
      );
    }

    if (action === "cleanup-anonymous-projects") {
      const days = (body as { days?: number })?.days || 7;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const deleted = await db
        .delete(appProjects)
        .where(
          and(
            isNull(appProjects.user_id),
            isNotNull(appProjects.session_id),
            lt(appProjects.updated_at, cutoff),
          ),
        )
        .returning({ id: appProjects.id });

      console.info(`[Admin] Deleted ${deleted.length} anonymous projects older than ${days} days`);
      return NextResponse.json({
        success: true,
        deleted: deleted.length,
        message: `Deleted ${deleted.length} anonymous projects older than ${days} days`,
      });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[API/admin/database] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to perform action" },
      { status: 500 },
    );
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getUploadsInfo(): {
  fileCount: number;
  totalSize: string;
  files: { name: string; size: string }[];
} {
  try {
    const uploadsDir = getUploadsDir();

    if (!fs.existsSync(uploadsDir)) {
      return { fileCount: 0, totalSize: "0 B", files: [] };
    }

    const files = fs.readdirSync(uploadsDir);
    let totalBytes = 0;
    const fileList: { name: string; size: string }[] = [];

    for (const file of files) {
      try {
        const filePath = path.join(uploadsDir, file);
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          totalBytes += stat.size;
          fileList.push({
            name: file,
            size: formatBytes(stat.size),
          });
        }
      } catch {
        // Skip files we can't read
      }
    }

    return {
      fileCount: fileList.length,
      totalSize: formatBytes(totalBytes),
      files: fileList.slice(0, 20), // Only return first 20 files
    };
  } catch {
    return { fileCount: 0, totalSize: "0 B", files: [] };
  }
}

function clearUploadsFolder(): {
  success: boolean;
  deletedCount: number;
  failedCount: number;
  freedSpace: string;
  error?: string;
} {
  try {
    const uploadsDir = getUploadsDir();

    if (!fs.existsSync(uploadsDir)) {
      return { success: true, deletedCount: 0, failedCount: 0, freedSpace: "0 B" };
    }

    const files = fs.readdirSync(uploadsDir);
    let deletedCount = 0;
    let failedCount = 0;
    let freedBytes = 0;

    for (const file of files) {
      try {
        const filePath = path.join(uploadsDir, file);
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          freedBytes += stat.size;
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (err) {
        // BUG-FIX 2026-04-24 (review-agent): tidigare räknades inte
        // misslyckade deletes — funktionen returnerade success: true ändå.
        failedCount++;
        console.error(`[Admin] Failed to delete file ${file}:`, err);
      }
    }

    console.info(
      `[Admin] Cleared uploads: ${deletedCount} files, ${formatBytes(freedBytes)} freed (failed: ${failedCount})`,
    );
    return {
      success: failedCount === 0,
      deletedCount,
      failedCount,
      freedSpace: formatBytes(freedBytes),
    };
  } catch (err) {
    console.error("[Admin] Failed to clear uploads:", err);
    return {
      success: false,
      deletedCount: 0,
      failedCount: 0,
      freedSpace: "0 B",
      error: "Failed to clear uploads folder",
    };
  }
}
