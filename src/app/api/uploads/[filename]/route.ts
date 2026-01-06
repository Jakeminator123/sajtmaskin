import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { PATHS } from "@/lib/config";

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
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    // Security: Prevent directory traversal
    if (
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\")
    ) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    // Construct file path
    const uploadsDir = PATHS.uploads;
    const filePath = path.join(uploadsDir, filename);

    // Check if file exists
    if (!existsSync(filePath)) {
      console.error("[API/uploads] File not found:", filePath);
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Read file
    const fileBuffer = readFileSync(filePath);

    // Determine content type from extension
    const ext = path.extname(filename).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".pdf": "application/pdf",
      ".txt": "text/plain",
    };

    const contentType = contentTypeMap[ext] || "application/octet-stream";

    // Return file with proper headers
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable", // 1 year cache
      },
    });
  } catch (error) {
    console.error("[API/uploads] Error serving file:", error);
    return NextResponse.json(
      { error: "Failed to serve file" },
      { status: 500 }
    );
  }
}
