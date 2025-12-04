/**
 * API Route: Admin Database Operations
 * GET /api/admin/database - Get database stats and download
 * POST /api/admin/database - Clear/reset database tables, manage uploads
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb, TEST_USER_EMAIL, getUploadsDir } from "@/lib/database";
import { getRedisInfo, flushRedisCache } from "@/lib/redis";
import fs from "fs";
import path from "path";

// Get data directory (supports DATA_DIR env var for Render persistent disk)
const DATA_DIR = process.env.DATA_DIR || process.cwd();
const DB_PATH = path.join(DATA_DIR, "sajtmaskin.db");

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
    const stats = {
      sqlite: {
        users:
          (db.prepare("SELECT COUNT(*) as count FROM users").get() as any)
            ?.count || 0,
        projects:
          (db.prepare("SELECT COUNT(*) as count FROM projects").get() as any)
            ?.count || 0,
        pageViews:
          (db.prepare("SELECT COUNT(*) as count FROM page_views").get() as any)
            ?.count || 0,
        transactions:
          (
            db
              .prepare("SELECT COUNT(*) as count FROM transactions")
              .get() as any
          )?.count || 0,
        guestUsage:
          (db.prepare("SELECT COUNT(*) as count FROM guest_usage").get() as any)
            ?.count || 0,
        companyProfiles:
          (
            db
              .prepare("SELECT COUNT(*) as count FROM company_profiles")
              .get() as any
          )?.count || 0,
      },
      redis: await getRedisInfo(),
      dbFileSize: getDbFileSize(),
      uploads: uploadsInfo,
      dataDir: DATA_DIR,
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
