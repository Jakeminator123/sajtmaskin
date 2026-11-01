import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getProjectByIdForOwner, getProjectData } from "@/lib/db/services/projects";
import { sanitizeProjectPath } from "@/lib/utils/path-utils";
import JSZip from "jszip";
import {
  importedFileContentForExport,
  MAX_IMPORTED_FILES,
  MAX_IMPORTED_TEXT_BYTES,
} from "@/lib/import/extract-imported-archive";

/**
 * GET /api/projects/[id]/download
 *
 * Downloads a project as a ZIP file.
 * Files are loaded from project_data.files (synced from v0 or own-engine on save).
 */

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_PROJECT_ID_CHARS = 200;
const MAX_PROJECT_FILE_PATH_CHARS = 1_024;

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;

    if (!projectId || projectId.length > MAX_PROJECT_ID_CHARS) {
      return NextResponse.json({ success: false, error: "Ogiltigt projekt-ID" }, { status: 400 });
    }

    // Get current user
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Du måste vara inloggad" },
        { status: 401 },
      );
    }

    // Get project
    const project = await getProjectByIdForOwner(projectId, { userId: user.id });
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Projektet hittades inte" },
        { status: 404 },
      );
    }

    // Get project files from project_data
    const projectData = await getProjectData(projectId);
    const rawFiles = projectData?.files;

    if (!rawFiles || !Array.isArray(rawFiles) || rawFiles.length === 0) {
      return NextResponse.json(
        { success: false, error: "Inga filer hittades i projektet" },
        { status: 404 },
      );
    }

    if (rawFiles.length > MAX_IMPORTED_FILES) {
      return NextResponse.json(
        { success: false, error: "Projektet innehåller för många filer" },
        { status: 413 },
      );
    }

    // Convert v0 file format while bounding the in-memory ZIP workload.
    const files: Array<{ path: string; content: string; language?: string }> = [];
    let totalTextBytes = 0;
    for (const file of rawFiles) {
      if (
        file === null ||
        typeof file !== "object" ||
        !("name" in file) ||
        typeof file.name !== "string" ||
        file.name.length === 0 ||
        file.name.length > MAX_PROJECT_FILE_PATH_CHARS ||
        !("content" in file) ||
        typeof file.content !== "string"
      ) {
        return NextResponse.json(
          { success: false, error: "Projektet innehåller en ogiltig fil" },
          { status: 400 },
        );
      }
      totalTextBytes += Buffer.byteLength(file.content, "utf8");
      if (totalTextBytes > MAX_IMPORTED_TEXT_BYTES) {
        return NextResponse.json(
          { success: false, error: "Projektet är för stort för nedladdning" },
          { status: 413 },
        );
      }
      files.push({
        path: file.name,
        content: file.content,
        language:
          "language" in file && typeof file.language === "string" ? file.language : undefined,
      });
    }

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: "Inga filer hittades i projektet" },
        { status: 404 },
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
          { status: 400 },
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
      zip.file(file.path, importedFileContentForExport(file.path, file.content, file.language));
    }

    // Generate ZIP as ArrayBuffer (compatible with NextResponse)
    const zipArrayBuffer = await zip.generateAsync({
      type: "arraybuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });

    // Create filename from project name
    const safeProjectName = (project.name || "project")
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
      { status: 500 },
    );
  }
}
