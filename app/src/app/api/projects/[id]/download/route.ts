import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProjectMeta } from "@/lib/redis";
import { loadProjectFilesWithFallback } from "@/lib/project-files";
import { sanitizeProjectPath } from "@/lib/path-utils";
import JSZip from "jszip";

/**
 * GET /api/projects/[id]/download
 *
 * Downloads a taken-over project as a ZIP file.
 * Uses centralized file loading with fallback chain: Redis → SQLite → Legacy.
 */

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;

    // Get current user
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Du måste vara inloggad" },
        { status: 401 }
      );
    }

    // Get project metadata
    const meta = await getProjectMeta(projectId);
    if (!meta) {
      return NextResponse.json(
        { success: false, error: "Projektet hittades inte" },
        { status: 404 }
      );
    }

    // Verify user owns this project
    if (meta.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: "Du kan bara ladda ner dina egna projekt" },
        { status: 403 }
      );
    }

    // For GitHub projects, redirect to GitHub instead
    if (meta.storageType === "github" && meta.githubOwner && meta.githubRepo) {
      // Return redirect response instead of JSON (client expects download)
      return NextResponse.redirect(
        `https://github.com/${meta.githubOwner}/${meta.githubRepo}/archive/refs/heads/main.zip`,
        302
      );
    }

    // Get project files (uses centralized fallback chain)
    const files = await loadProjectFilesWithFallback(projectId);

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: "Inga filer hittades i projektet" },
        { status: 404 }
      );
    }

    // Validate & normalize paths to prevent traversal
    const normalizedFiles = [];
    for (const file of files) {
      const safePath = sanitizeProjectPath(file.path);
      if (!safePath) {
        return NextResponse.json(
          {
            success: false,
            error: `Ogiltig filväg upptäcktes: ${file.path}`,
          },
          { status: 400 }
        );
      }
      normalizedFiles.push({ ...file, path: safePath });
    }

    // Create ZIP file
    const zip = new JSZip();

    // Add each file to the ZIP
    for (const file of normalizedFiles) {
      // Skip base64 image placeholders (these are markers, not actual image data)
      // Check for exact placeholder format to avoid skipping real files
      if (
        file.content &&
        typeof file.content === "string" &&
        file.content.trim() === `[BASE64_IMAGE:${file.path.split("/").pop()}]`
      ) {
        continue;
      }
      zip.file(file.path, file.content);
    }

    // Generate ZIP as ArrayBuffer (compatible with NextResponse)
    const zipArrayBuffer = await zip.generateAsync({
      type: "arraybuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });

    // Create filename from project name
    const safeProjectName = (meta.name || "project")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .substring(0, 50);
    const filename = `${safeProjectName}-${Date.now()}.zip`;

    // Return ZIP file
    return new NextResponse(zipArrayBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": zipArrayBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("[API] Error downloading project:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte ladda ner projektet" },
      { status: 500 }
    );
  }
}
