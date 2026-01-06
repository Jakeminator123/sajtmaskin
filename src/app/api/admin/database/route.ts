/**
 * API Route: Admin Database Operations
 * GET /api/admin/database - Get database stats and download
 * POST /api/admin/database - Clear/reset database tables, manage uploads
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getDb, TEST_USER_EMAIL, getUploadsDir } from "@/lib/data/database";
import { getRedisInfo, flushRedisCache } from "@/lib/data/redis";
import { PATHS } from "@/lib/config";
import fs from "fs";
import path from "path";

// Use centralized path configuration
const DB_PATH = PATHS.database;

// Check if user is admin
async function isAdmin(req: NextRequest): Promise<boolean> {
  const user = await getCurrentUser(req);
  return user?.email === TEST_USER_EMAIL;
}

// Get database stats
export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const action = req.nextUrl.searchParams.get("action");

  try {
    const db = getDb();

    // Download database file
    if (action === "download") {
      if (!fs.existsSync(DB_PATH)) {
        return NextResponse.json(
          { success: false, error: "Database file not found" },
          { status: 404 }
        );
      }

      const fileBuffer = fs.readFileSync(DB_PATH);

      return new NextResponse(fileBuffer, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="sajtmaskin-backup-${new Date()
            .toISOString()
            .slice(0, 10)}.db"`,
        },
      });
    }

    // Get stats
    const uploadsInfo = getUploadsInfo();

    // Get template cache stats
    type CountResult = { count: number };
    const templateCacheCount =
      (db.prepare("SELECT COUNT(*) as count FROM template_cache").get() as CountResult | undefined)
        ?.count || 0;

    const templateCacheExpired =
      (
        db
          .prepare(
            "SELECT COUNT(*) as count FROM template_cache WHERE datetime(expires_at) < datetime('now')"
          )
          .get() as CountResult | undefined
      )?.count || 0;

    const stats = {
      sqlite: {
        users:
          (db.prepare("SELECT COUNT(*) as count FROM users").get() as CountResult | undefined)
            ?.count || 0,
        projects:
          (db.prepare("SELECT COUNT(*) as count FROM projects").get() as CountResult | undefined)
            ?.count || 0,
        pageViews:
          (db.prepare("SELECT COUNT(*) as count FROM page_views").get() as CountResult | undefined)
            ?.count || 0,
        transactions:
          (
            db
              .prepare("SELECT COUNT(*) as count FROM transactions")
              .get() as CountResult | undefined
          )?.count || 0,
        guestUsage:
          (db.prepare("SELECT COUNT(*) as count FROM guest_usage").get() as CountResult | undefined)
            ?.count || 0,
        companyProfiles:
          (
            db
              .prepare("SELECT COUNT(*) as count FROM company_profiles")
              .get() as CountResult | undefined
          )?.count || 0,
        templateCache: templateCacheCount,
        templateCacheExpired: templateCacheExpired,
      },
      redis: await getRedisInfo(),
      dbFileSize: getDbFileSize(),
      uploads: uploadsInfo,
      dataDir: PATHS.dataDir,
    };

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error("[API/admin/database] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get database stats" },
      { status: 500 }
    );
  }
}

// Clear database tables
export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const { action, table } = body as { action?: string; table?: string };

    const db = getDb();

    if (action === "clear") {
      // Clear specific table
      const allowedTables = [
        "page_views",
        "guest_usage",
        "transactions",
        "projects",
        "company_profiles",
        "users",
      ];

      if (!table || !allowedTables.includes(table)) {
        return NextResponse.json(
          { success: false, error: "Invalid table name" },
          { status: 400 }
        );
      }

      // Special handling for users - don't delete test user
      if (table === "users") {
        db.prepare(`DELETE FROM users WHERE email != ?`).run(TEST_USER_EMAIL);
      } else {
        db.prepare(`DELETE FROM ${table}`).run();
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
      // Clear all data except test user
      db.prepare("DELETE FROM page_views").run();
      db.prepare("DELETE FROM guest_usage").run();
      db.prepare("DELETE FROM transactions").run();
      db.prepare("DELETE FROM projects").run();
      db.prepare("DELETE FROM company_profiles").run();
      db.prepare(`DELETE FROM users WHERE email != ?`).run(TEST_USER_EMAIL);

      // Also flush Redis
      await flushRedisCache();

      // Clear uploads folder
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
    // Export/import templates to avoid API costs
    // ═══════════════════════════════════════════════════════════════════════

    if (action === "export-templates") {
      // Export all cached templates as JSON
      const templates = db
        .prepare(
          `SELECT template_id, chat_id, demo_url, version_id, code, files_json, model, created_at
           FROM template_cache ORDER BY created_at DESC`
        )
        .all() as Array<{
        template_id: string;
        chat_id: string;
        demo_url: string | null;
        version_id: string | null;
        code: string | null;
        files_json: string | null;
        model: string | null;
        created_at: string;
      }>;

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
          { status: 400 }
        );
      }

      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO template_cache 
          (template_id, chat_id, demo_url, version_id, code, files_json, model, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let imported = 0;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days cache

      for (const t of templates as ImportTemplate[]) {
        if (!t.templateId || !t.chatId) continue;
        try {
          insertStmt.run(
            t.templateId,
            t.chatId,
            t.demoUrl || null,
            t.versionId || null,
            t.code || null,
            t.files ? JSON.stringify(t.files) : null,
            t.model || null,
            new Date().toISOString(),
            expiresAt.toISOString()
          );
          imported++;
        } catch (err) {
          console.error(
            "[Admin] Failed to import template:",
            t.templateId,
            err
          );
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
      const result = db.prepare("DELETE FROM template_cache").run();
      console.log(`[Admin] Cleared ${result.changes} cached templates`);
      return NextResponse.json({
        success: true,
        deleted: result.changes,
        message: `Cleared ${result.changes} cached templates`,
      });
    }

    if (action === "extend-template-cache") {
      // Extend all template cache expiry by 30 days
      const newExpiry = new Date();
      newExpiry.setDate(newExpiry.getDate() + 30);

      const result = db
        .prepare("UPDATE template_cache SET expires_at = ?")
        .run(newExpiry.toISOString());

      console.log(`[Admin] Extended cache for ${result.changes} templates`);
      return NextResponse.json({
        success: true,
        extended: result.changes,
        newExpiry: newExpiry.toISOString(),
        message: `Extended cache for ${
          result.changes
        } templates to ${newExpiry.toLocaleDateString()}`,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CLEANUP ACTIONS - Manage old projects and storage
    // ═══════════════════════════════════════════════════════════════════════════

    if (action === "run-cleanup") {
      const { runCleanup, getCleanupStats } = await import(
        "@/lib/project-cleanup"
      );

      // Get stats before cleanup
      const statsBefore = getCleanupStats();

      // Run cleanup
      const result = await runCleanup();

      // Get stats after cleanup
      const statsAfter = getCleanupStats();

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
      const { getCleanupStats, CLEANUP_CONFIG } = await import(
        "@/lib/project-cleanup"
      );
      const stats = getCleanupStats();
      return NextResponse.json({
        success: true,
        stats,
        config: CLEANUP_CONFIG,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MEGA CLEANUP - Clear v0, Vercel, SQLite, and Redis
    // ═══════════════════════════════════════════════════════════════════════════

    if (action === "mega-cleanup") {
      const results: {
        v0: { deleted: number; errors: string[] };
        vercel: { deleted: number; errors: string[] };
        sqlite: { deleted: number };
        redis: { success: boolean };
      } = {
        v0: { deleted: 0, errors: [] },
        vercel: { deleted: 0, errors: [] },
        sqlite: { deleted: 0 },
        redis: { success: false },
      };

      // 1. Delete v0 projects
      const v0ApiKey = process.env.V0_API_KEY;
      if (v0ApiKey) {
        try {
          // Fetch all v0 projects
          const projectsRes = await fetch("https://api.v0.dev/v1/projects", {
            headers: { Authorization: `Bearer ${v0ApiKey}` },
          });

          if (projectsRes.ok) {
            const projectsData = await projectsRes.json();
            const v0Projects = projectsData.data || [];

            for (const proj of v0Projects) {
              try {
                const delRes = await fetch(
                  `https://api.v0.dev/v1/projects/${proj.id}`,
                  {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${v0ApiKey}` },
                  }
                );
                if (delRes.ok) {
                  results.v0.deleted++;
                }
              } catch (err) {
                results.v0.errors.push(
                  `Failed to delete ${proj.id}: ${
                    err instanceof Error ? err.message : "Unknown"
                  }`
                );
              }
            }
          }
        } catch (err) {
          results.v0.errors.push(
            `Failed to fetch v0 projects: ${
              err instanceof Error ? err.message : "Unknown"
            }`
          );
        }
      }

      // 2. Delete Vercel projects
      const vercelToken = process.env.VERCEL_API_TOKEN;
      if (vercelToken) {
        try {
          // Fetch all Vercel projects
          const projectsRes = await fetch(
            "https://api.vercel.com/v9/projects",
            {
              headers: { Authorization: `Bearer ${vercelToken}` },
            }
          );

          if (projectsRes.ok) {
            const projectsData = await projectsRes.json();
            const vercelProjects = projectsData.projects || [];

            for (const proj of vercelProjects) {
              try {
                const delRes = await fetch(
                  `https://api.vercel.com/v9/projects/${proj.id}`,
                  {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${vercelToken}` },
                  }
                );
                if (delRes.ok || delRes.status === 204) {
                  results.vercel.deleted++;
                }
              } catch (err) {
                results.vercel.errors.push(
                  `Failed to delete ${proj.id}: ${
                    err instanceof Error ? err.message : "Unknown"
                  }`
                );
              }
            }
          }
        } catch (err) {
          results.vercel.errors.push(
            `Failed to fetch Vercel projects: ${
              err instanceof Error ? err.message : "Unknown"
            }`
          );
        }
      }

      // 3. Clear SQLite tables
      const tablesToClear = [
        "project_files",
        "project_data",
        "vercel_deployments",
        "projects",
        "images",
        "media_library",
        "company_profiles",
        "template_cache",
        "page_views",
        "guest_usage",
        "transactions",
      ];

      for (const table of tablesToClear) {
        try {
          const result = db.prepare(`DELETE FROM ${table}`).run();
          results.sqlite.deleted += result.changes;
        } catch {
          // Table might not exist
        }
      }

      // Keep test user
      db.prepare(`DELETE FROM users WHERE email != ?`).run(TEST_USER_EMAIL);

      // 4. Flush Redis
      results.redis.success = await flushRedisCache();

      // 5. Clear uploads folder
      clearUploadsFolder();

      console.log("[Admin] MEGA CLEANUP completed:", results);
      return NextResponse.json({
        success: true,
        results,
        message: `Mega cleanup: ${results.v0.deleted} v0, ${results.vercel.deleted} Vercel, ${results.sqlite.deleted} SQLite rows`,
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
            const delRes = await fetch(
              `https://api.v0.dev/v1/projects/${proj.id}`,
              {
                method: "DELETE",
                headers: { Authorization: `Bearer ${v0ApiKey}` },
              }
            );
            if (delRes.ok) {
              deleted.push(proj.id);
            } else {
              errors.push(`${proj.id}: ${delRes.status}`);
            }
          } catch (err) {
            errors.push(
              `${proj.id}: ${err instanceof Error ? err.message : "Unknown"}`
            );
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
      const vercelToken = process.env.VERCEL_API_TOKEN;
      if (!vercelToken) {
        return NextResponse.json({
          success: false,
          error: "VERCEL_API_TOKEN not configured",
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
            const delRes = await fetch(
              `https://api.vercel.com/v9/projects/${proj.id}`,
              {
                method: "DELETE",
                headers: { Authorization: `Bearer ${vercelToken}` },
              }
            );
            if (delRes.ok || delRes.status === 204) {
              deleted.push(proj.id);
            } else {
              errors.push(`${proj.id}: ${delRes.status}`);
            }
          } catch (err) {
            errors.push(
              `${proj.id}: ${err instanceof Error ? err.message : "Unknown"}`
            );
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
      // Delete all anonymous projects older than X days
      const days = (body as { days?: number })?.days || 7;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const result = db
        .prepare(
          `
        DELETE FROM projects 
        WHERE user_id IS NULL 
        AND session_id IS NOT NULL 
        AND datetime(updated_at) < datetime(?)
      `
        )
        .run(cutoff.toISOString());

      console.log(
        `[Admin] Deleted ${result.changes} anonymous projects older than ${days} days`
      );
      return NextResponse.json({
        success: true,
        deleted: result.changes,
        message: `Deleted ${result.changes} anonymous projects older than ${days} days`,
      });
    }

    return NextResponse.json(
      { success: false, error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[API/admin/database] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to perform action" },
      { status: 500 }
    );
  }
}

function getDbFileSize(): string {
  try {
    const stats = fs.statSync(DB_PATH);
    const bytes = stats.size;
    return formatBytes(bytes);
  } catch {
    return "Unknown";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

    console.log(
      `[Admin] Cleared uploads: ${deletedCount} files, ${formatBytes(
        freedBytes
      )} freed`
    );
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
