/**
 * API Route: Admin Database Operations
 * GET /api/admin/database - Get database stats
 * POST /api/admin/database - Clear/reset database tables, manage uploads
 */

import { and, desc, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
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
import { TEST_USER_EMAIL, getUploadsDir } from "@/lib/db/services";
import { getRedisInfo, flushRedisCache } from "@/lib/data/redis";
import { PATHS } from "@/lib/config";

// Check if user is admin
async function isAdmin(req: NextRequest): Promise<boolean> {
  const user = await getCurrentUser(req);
  return user?.email === TEST_USER_EMAIL;
}

async function countTable(table: unknown): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)` }).from(table as never);
  return rows[0]?.count ?? 0;
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
  if (!(await isAdmin(req))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
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
  if (!(await isAdmin(req))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, table } = body as { action?: string; table?: string };

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

      if (!table || !(table in tableMap)) {
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

      console.log(`[Admin] Cleared table: ${table}`);
      return NextResponse.json({ success: true, message: `Cleared ${table}` });
    }

    if (action === "flush-redis") {
      const success = await flushRedisCache();
      return NextResponse.json({
        success,
        message: success ? "Redis cache flushed" : "Failed to flush Redis",
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

      await flushRedisCache();
      clearUploadsFolder();

      console.log("[Admin] Reset all databases");
      return NextResponse.json({ success: true, message: "All data cleared" });
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

      console.log(`[Admin] Exported ${templates.length} templates`);
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
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      for (const t of templates as ImportTemplate[]) {
        if (!t.templateId || !t.chatId) continue;
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
          console.error("[Admin] Failed to import template:", t.templateId, err);
        }
      }

      console.log(`[Admin] Imported ${imported} templates`);
      return NextResponse.json({
        success: true,
        imported,
        message: `Imported ${imported} templates`,
      });
    }

    if (action === "clear-template-cache") {
      const deleted = await db
        .delete(templateCache)
        .where(sql`true`)
        .returning({ id: templateCache.id });
      console.log(`[Admin] Cleared ${deleted.length} cached templates`);
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

      console.log(`[Admin] Extended cache for ${updated.length} templates`);
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

      console.log("[Admin] Cleanup completed:", result);
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
    // MEGA CLEANUP - Clear v0, Vercel, Postgres, and Redis
    // ═══════════════════════════════════════════════════════════════════════════

    if (action === "mega-cleanup") {
      const results: {
        v0: { deleted: number; errors: string[] };
        vercel: { deleted: number; errors: string[] };
        database: { deleted: number };
        redis: { success: boolean };
      } = {
        v0: { deleted: 0, errors: [] },
        vercel: { deleted: 0, errors: [] },
        database: { deleted: 0 },
        redis: { success: false },
      };

      const v0ApiKey = process.env.V0_API_KEY;
      if (v0ApiKey) {
        try {
          const projectsRes = await fetch("https://api.v0.dev/v1/projects", {
            headers: { Authorization: `Bearer ${v0ApiKey}` },
          });

          if (projectsRes.ok) {
            const projectsData = await projectsRes.json();
            const v0Projects = projectsData.data || [];

            for (const proj of v0Projects) {
              try {
                const delRes = await fetch(`https://api.v0.dev/v1/projects/${proj.id}`, {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${v0ApiKey}` },
                });
                if (delRes.ok) {
                  results.v0.deleted++;
                }
              } catch (err) {
                results.v0.errors.push(
                  `Failed to delete ${proj.id}: ${err instanceof Error ? err.message : "Unknown"}`,
                );
              }
            }
          }
        } catch (err) {
          results.v0.errors.push(
            `Failed to fetch v0 projects: ${err instanceof Error ? err.message : "Unknown"}`,
          );
        }
      }

      const vercelToken = process.env.VERCEL_TOKEN;
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

      results.redis.success = await flushRedisCache();
      clearUploadsFolder();

      console.log("[Admin] MEGA CLEANUP completed:", results);
      return NextResponse.json({
        success: true,
        results,
        message: `Mega cleanup: ${results.v0.deleted} v0, ${results.vercel.deleted} Vercel, ${results.database.deleted} DB rows`,
      });
    }

    if (action === "cleanup-v0-projects") {
      const v0ApiKey = process.env.V0_API_KEY;
      if (!v0ApiKey) {
        return NextResponse.json({
          success: false,
          error: "V0_API_KEY not configured",
        });
      }

      const deleted: string[] = [];
      const errors: string[] = [];

      try {
        const projectsRes = await fetch("https://api.v0.dev/v1/projects", {
          headers: { Authorization: `Bearer ${v0ApiKey}` },
        });

        if (!projectsRes.ok) {
          return NextResponse.json({
            success: false,
            error: `Failed to fetch v0 projects: ${projectsRes.status}`,
          });
        }

        const projectsData = await projectsRes.json();
        const v0Projects = projectsData.data || [];

        for (const proj of v0Projects) {
          try {
            const delRes = await fetch(`https://api.v0.dev/v1/projects/${proj.id}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${v0ApiKey}` },
            });
            if (delRes.ok) {
              deleted.push(proj.id);
            } else {
              errors.push(`${proj.id}: ${delRes.status}`);
            }
          } catch (err) {
            errors.push(`${proj.id}: ${err instanceof Error ? err.message : "Unknown"}`);
          }
        }

        return NextResponse.json({
          success: true,
          deleted: deleted.length,
          total: v0Projects.length,
          errors,
          message: `Deleted ${deleted.length}/${v0Projects.length} v0 projects`,
        });
      } catch (err) {
        return NextResponse.json({
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    if (action === "cleanup-vercel-projects") {
      const vercelToken = process.env.VERCEL_TOKEN;
      if (!vercelToken) {
        return NextResponse.json({
          success: false,
          error: "VERCEL_TOKEN not configured",
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

        return NextResponse.json({
          success: true,
          deleted: deleted.length,
          total: vercelProjects.length,
          errors,
          message: `Deleted ${deleted.length}/${vercelProjects.length} Vercel projects`,
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

      console.log(`[Admin] Deleted ${deleted.length} anonymous projects older than ${days} days`);
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
  freedSpace: string;
  error?: string;
} {
  try {
    const uploadsDir = getUploadsDir();

    if (!fs.existsSync(uploadsDir)) {
      return { success: true, deletedCount: 0, freedSpace: "0 B" };
    }

    const files = fs.readdirSync(uploadsDir);
    let deletedCount = 0;
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
        console.error(`[Admin] Failed to delete file ${file}:`, err);
      }
    }

    console.log(`[Admin] Cleared uploads: ${deletedCount} files, ${formatBytes(freedBytes)} freed`);
    return {
      success: true,
      deletedCount,
      freedSpace: formatBytes(freedBytes),
    };
  } catch (err) {
    console.error("[Admin] Failed to clear uploads:", err);
    return {
      success: false,
      deletedCount: 0,
      freedSpace: "0 B",
      error: "Failed to clear uploads folder",
    };
  }
}
