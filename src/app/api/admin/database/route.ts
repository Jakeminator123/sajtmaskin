/**
 * API Route: Admin Database Operations
 * GET /api/admin/database - Get database stats
 * POST /api/admin/database - Clear/reset database tables, manage uploads
 */

import { and, desc, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
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
import { PATHS } from "@/lib/config";
import { pickVercelAccessTokenFromEnv } from "@/lib/vercel";

async function countTable(table: unknown): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)` }).from(table as never);
  return (rows[0] as { count: number } | undefined)?.count ?? 0;
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

      if (table === "users" && TEST_USER_EMAIL) {
        await db.delete(users).where(ne(users.email, TEST_USER_EMAIL));
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

    if (action === "reset-all") {
      await db.delete(pageViews).where(sql`true`);
      await db.delete(guestUsage).where(sql`true`);
      await db.delete(transactions).where(sql`true`);
      await db.delete(projectData).where(sql`true`);
      await db.delete(projectFiles).where(sql`true`);
      await db.delete(images).where(sql`true`);
      await db.delete(mediaLibrary).where(sql`true`);
      await db.delete(companyProfiles).where(sql`true`);
      await db.delete(templateCache).where(sql`true`);
      await db.delete(domainOrders).where(sql`true`);
      await db.delete(appProjects).where(sql`true`);

      if (TEST_USER_EMAIL) {
        await db.delete(users).where(ne(users.email, TEST_USER_EMAIL));
      } else {
        await db.delete(users).where(sql`true`);
      }

      // BUG-FIX 2026-04-24 (test-agent rapport): tidigare ignorerades
      // returvärdet från flushRedisCache helt — `success: true` kunde
      // returneras även när Redis-flushen failade. Nu härleds success.
      const flushed = await flushRedisCache();
      clearUploadsFolder();

      const redisOk = flushed >= 0;
      console.info(
        `[Admin] Reset all databases (Redis: ${redisOk ? `${flushed} keys flushed` : "FAILED"})`,
      );
      return NextResponse.json({
        success: redisOk,
        message: redisOk
          ? `All data cleared (Redis: ${flushed} keys i denna miljö)`
          : "Database cleared but Redis flush failed — check server logs",
        redisFlushedKeys: redisOk ? flushed : null,
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
    // TEMPLATE CACHE MANAGEMENT
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
      const { runCleanup, getCleanupStats } = await import("@/lib/project-cleanup");
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
      const { getCleanupStats, CLEANUP_CONFIG } = await import("@/lib/project-cleanup");
      const stats = await getCleanupStats();
      return NextResponse.json({
        success: true,
        stats,
        config: CLEANUP_CONFIG,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MEGA CLEANUP - Clear Vercel, Postgres, and Redis
    // ═══════════════════════════════════════════════════════════════════════════

    if (action === "mega-cleanup") {
      const results: {
        vercel: { deleted: number; errors: string[] };
        database: { deleted: number };
        redis: { success: boolean; deleted: number };
      } = {
        vercel: { deleted: 0, errors: [] },
        database: { deleted: 0 },
        redis: { success: false, deleted: 0 },
      };

      const vercelToken = pickVercelAccessTokenFromEnv();
      if (vercelToken) {
        try {
          const projectsRes = await fetch("https://api.vercel.com/v9/projects", {
            headers: { Authorization: `Bearer ${vercelToken}` },
          });

          if (projectsRes.ok) {
            const projectsData = await projectsRes.json();
            const vercelProjects = projectsData.projects || [];

            for (const proj of vercelProjects) {
              try {
                const delRes = await fetch(`https://api.vercel.com/v9/projects/${proj.id}`, {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${vercelToken}` },
                });
                if (delRes.ok || delRes.status === 204) {
                  results.vercel.deleted++;
                }
              } catch (err) {
                results.vercel.errors.push(
                  `Failed to delete ${proj.id}: ${err instanceof Error ? err.message : "Unknown"}`,
                );
              }
            }
          }
        } catch (err) {
          results.vercel.errors.push(
            `Failed to fetch Vercel projects: ${err instanceof Error ? err.message : "Unknown"}`,
          );
        }
      }

      const deletedRows = await Promise.all([
        db.delete(projectFiles).where(sql`true`).returning({ id: projectFiles.id }),
        db.delete(projectData).where(sql`true`).returning({ id: projectData.project_id }),
        db.delete(images).where(sql`true`).returning({ id: images.id }),
        db.delete(mediaLibrary).where(sql`true`).returning({ id: mediaLibrary.id }),
        db.delete(companyProfiles).where(sql`true`).returning({ id: companyProfiles.id }),
        db.delete(templateCache).where(sql`true`).returning({ id: templateCache.id }),
        db.delete(pageViews).where(sql`true`).returning({ id: pageViews.id }),
        db.delete(guestUsage).where(sql`true`).returning({ id: guestUsage.id }),
        db.delete(transactions).where(sql`true`).returning({ id: transactions.id }),
        db.delete(domainOrders).where(sql`true`).returning({ id: domainOrders.id }),
        db.delete(appProjects).where(sql`true`).returning({ id: appProjects.id }),
      ]);

      results.database.deleted = deletedRows.reduce((sum, rows) => sum + rows.length, 0);

      const deletedUsers = TEST_USER_EMAIL
        ? await db.delete(users).where(ne(users.email, TEST_USER_EMAIL)).returning({ id: users.id })
        : await db.delete(users).where(sql`true`).returning({ id: users.id });
      results.database.deleted += deletedUsers.length;

      // BUG-FIX 2026-04-24: prefix-scoped flush (se `flushRedisCache` JSDoc).
      const flushedKeys = await flushRedisCache();
      results.redis.success = flushedKeys >= 0;
      results.redis.deleted = flushedKeys >= 0 ? flushedKeys : 0;
      clearUploadsFolder();

      // BUG-FIX 2026-04-24 (test-agent rapport): tidigare hardcoded
      // `success: true` även när redis.success var false eller vercel
      // hade fel. Nu härleds top-level success från delresultaten.
      const allOk =
        results.redis.success && results.vercel.errors.length === 0;

      return NextResponse.json({
        success: allOk,
        partialSuccess: !allOk,
        results,
        message: `Mega cleanup: ${results.vercel.deleted} Vercel, ${results.database.deleted} DB rows, ${results.redis.deleted} Redis keys${
          allOk ? "" : " (med fel — se results)"
        }`,
      });
    }

    if (action === "cleanup-vercel-projects") {
      const vercelToken = pickVercelAccessTokenFromEnv();
      if (!vercelToken) {
        return NextResponse.json({
          success: false,
          error: "VERCEL_TOKEN (or VERCEL_TOKEN_FULL) not configured",
        });
      }

      const deleted: string[] = [];
      const errors: string[] = [];

      try {
        const projectsRes = await fetch("https://api.vercel.com/v9/projects", {
          headers: { Authorization: `Bearer ${vercelToken}` },
        });

        if (!projectsRes.ok) {
          return NextResponse.json({
            success: false,
            error: `Failed to fetch Vercel projects: ${projectsRes.status}`,
          });
        }

        const projectsData = await projectsRes.json();
        const vercelProjects = projectsData.projects || [];

        for (const proj of vercelProjects) {
          try {
            const delRes = await fetch(`https://api.vercel.com/v9/projects/${proj.id}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${vercelToken}` },
            });
            if (delRes.ok || delRes.status === 204) {
              deleted.push(proj.id);
            } else {
              errors.push(`${proj.id}: ${delRes.status}`);
            }
          } catch (err) {
            errors.push(`${proj.id}: ${err instanceof Error ? err.message : "Unknown"}`);
          }
        }

        // BUG-FIX 2026-04-24 (review-agent): tidigare alltid success: true
        // även om enstaka projekt-deletes failade. Speglar samma härlednings-
        // mönster som import-templates / mega-cleanup.
        const allOk = errors.length === 0;
        return NextResponse.json({
          success: allOk,
          partialSuccess: !allOk && deleted.length > 0,
          deleted: deleted.length,
          total: vercelProjects.length,
          failed: errors.length,
          errors,
          message: allOk
            ? `Deleted ${deleted.length}/${vercelProjects.length} Vercel projects`
            : `Deleted ${deleted.length}/${vercelProjects.length} Vercel projects (${errors.length} failed)`,
        });
      } catch (err) {
        return NextResponse.json({
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
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
