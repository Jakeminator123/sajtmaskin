import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getUploadsDir } from "@/lib/db/services/shared";
import { hasTraversalSegment } from "@/lib/utils/path-utils";
import { existsSync } from "fs";

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

/**
 * Media File Serving API
 * ======================
 *
 * GET /api/uploads/media/[userId]/[filename]
 *
 * Serves media files from local storage.
 * Used when Vercel Blob is not available.
 *
 * SECURITY:
 * - Path traversal protection (resolved path must be within uploads directory)
 * - Only serves files from /data/uploads/media/[userId]/ directory
 *
 * CACHING:
 * - Aggressive caching (1 year) since filenames are unique/timestamped
 */

// Content type mapping for common file extensions
const CONTENT_TYPE_MAP: Record<string, string> = {
  // Images
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  // Videos
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  // Documents
  ".pdf": "application/pdf",
  // Text
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".css": "text/css",
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { path: pathSegments } = await params;

    // Validate path structure: need at least [userId]/[filename]
    if (!pathSegments || pathSegments.length < 2) {
      return NextResponse.json({ error: "Ogiltig sökväg" }, { status: 400 });
    }

    const [userId, ...filenameParts] = pathSegments;
    const filename = filenameParts.join("/");

    // Validate userId and filename (basic sanitation). Segment-based (PR #396
    // class): a stored filename that merely CONTAINS `..` (e.g. `img..png`)
    // is legit — only real `..` segments are traversal. Backslashes are
    // normalized first so `a\..\b` cannot smuggle a segment past the check on
    // Windows; the path.relative() check below stays the authoritative
    // escape guard on every platform.
    if (
      !userId ||
      !filename ||
      hasTraversalSegment(userId.replace(/\\/g, "/")) ||
      hasTraversalSegment(filename.replace(/\\/g, "/"))
    ) {
      return NextResponse.json({ error: "Ogiltig sökväg" }, { status: 400 });
    }

    const uploadsDir = getUploadsDir();
    const filePath = path.join(uploadsDir, "media", userId, filename);

    // SECURITY: Ensure the resolved path is within the uploads directory
    // This prevents path traversal attacks like /api/uploads/media/../../../etc/passwd
    //
    // NOTE: We use path.relative() instead of startsWith() because startsWith()
    // only checks string prefix, not directory boundaries. An attacker could bypass
    // startsWith() with paths like /data/uploadsEvil/file if uploadsDir is /data/uploads
    const resolvedPath = path.resolve(filePath);
    const resolvedUploadsDir = path.resolve(uploadsDir);

    // Calculate relative path from uploads dir to requested file
    const relativePath = path.relative(resolvedUploadsDir, resolvedPath);

    // If relative path starts with ".." or is absolute, the file is outside uploads dir
    // - "../uploadsEvil/file" = outside (starts with ..)
    // - "media/userId/file.jpg" = inside (no ..)
    // - "D:\other\path" = outside on Windows (absolute path from different drive)
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      console.warn(
        `[Media/Serve] Path traversal attempt blocked: ${resolvedPath} (relative: ${relativePath})`,
      );
      return NextResponse.json({ error: "Åtkomst nekad" }, { status: 403 });
    }

    // Check if file exists
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "Filen hittades inte" }, { status: 404 });
    }

    // Determine content type from extension. Never serve active/scriptable
    // document types from local fallback storage.
    const ext = path.extname(filename).toLowerCase();
    if (ext === ".svg" || ext === ".html") {
      return NextResponse.json({ error: "Filtypen får inte serveras" }, { status: 415 });
    }
    const contentType = CONTENT_TYPE_MAP[ext] || "application/octet-stream";

    // Read file
    const fileBuffer = await readFile(filePath);

    // Return file with appropriate headers
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        // Aggressive caching since filenames are unique (timestamp + random)
        "Cache-Control": "public, max-age=31536000, immutable",
        // Allow cross-origin access (needed for live preview).
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("[API/Uploads/Media] Error:", error);
    return NextResponse.json({ error: "Kunde inte hämta filen" }, { status: 500 });
  }
}
