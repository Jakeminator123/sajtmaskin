import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "path";
import { PATHS } from "@/lib/config";

const MAX_UPLOAD_FILENAME_CHARS = 255;

/**
 * GET /api/uploads/[filename]
 * ===========================
 *
 * Serves uploaded files from data/uploads directory
 * Next.js doesn't serve files outside of public/ by default,
 * so we need this API route to serve user uploads
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  try {
    const { filename } = await params;

    // Security: Prevent directory traversal. Substring check is safe here:
    // `/` and `\` are rejected on the same line, so no path segments can
    // exist and the conservative match cannot drop legit route files.
    if (
      !filename ||
      filename.length > MAX_UPLOAD_FILENAME_CHARS ||
      filename.includes("..") || // traversal-substring-allow: single filename; separators rejected below
      filename.includes("/") ||
      filename.includes("\\")
    ) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    // Construct file path
    const uploadsDir = PATHS.uploads;
    const filePath = path.join(uploadsDir, filename);

    // Never serve active document types from same-origin local storage. This
    // matches the scoped /api/uploads/media route and protects legacy files.
    const ext = path.extname(filename).toLowerCase();
    if (ext === ".svg" || ext === ".html") {
      return NextResponse.json({ error: "File type not allowed" }, { status: 415 });
    }

    // Read asynchronously so large local assets do not block unrelated requests.
    let fileBuffer: Buffer;
    try {
      fileBuffer = await readFile(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
      throw error;
    }

    // Determine content type from extension
    const contentTypeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".pdf": "application/pdf",
      ".txt": "text/plain",
    };

    const contentType = contentTypeMap[ext] || "application/octet-stream";

    // Return file with proper headers
    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=31536000, immutable", // 1 year cache
      },
    });
  } catch (error) {
    console.error("[API/uploads] Error serving file:", error);
    return NextResponse.json({ error: "Failed to serve file" }, { status: 500 });
  }
}
