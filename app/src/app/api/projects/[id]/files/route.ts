import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProjectData } from "@/lib/database";
import {
  getProjectFiles,
  getProjectMeta,
  saveProjectFiles,
  ProjectFile,
} from "@/lib/redis";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/[id]/files
 *
 * Returns files + metadata for a taken-over project.
 * Currently supports Redis-backed projects (default takeover mode).
 */

async function loadFilesWithFallback(
  projectId: string
): Promise<ProjectFile[]> {
  const redisFiles = await getProjectFiles(projectId);
  if (redisFiles && redisFiles.length > 0) {
    return redisFiles;
  }

  const projectData = getProjectData(projectId);
  if (
    projectData?.files &&
    Array.isArray(projectData.files) &&
    projectData.files.length > 0
  ) {
    const filesFromDb: ProjectFile[] = projectData.files
      .filter(
        (f: unknown) =>
          f &&
          typeof f === "object" &&
          "name" in f &&
          "content" in f &&
          typeof (f as { name: unknown }).name === "string" &&
          typeof (f as { content: unknown }).content === "string"
      )
      .map((f: { name: string; content: string }) => ({
        path: f.name,
        content: f.content,
        lastModified: new Date().toISOString(),
      }));

    if (filesFromDb.length > 0) {
      try {
        await saveProjectFiles(projectId, filesFromDb);
      } catch (error) {
        console.warn(
          "[Projects/files] Failed to seed Redis from DB fallback",
          error
        );
      }
      return filesFromDb;
    }
  }

  return [];
}
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;

    // Require auth
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Du måste vara inloggad" },
        { status: 401 }
      );
    }

    // Fetch metadata (may not exist if project wasn't formally "taken over")
    const meta = await getProjectMeta(projectId);
    
    // If meta exists, check ownership and storage type
    if (meta) {
      // Ownership check
      if (meta.userId !== user.id) {
        return NextResponse.json(
          { success: false, error: "Du kan bara visa dina egna projekt" },
          { status: 403 }
        );
      }

      // GitHub mode requires different handling
      if (meta.storageType === "github") {
        return NextResponse.json(
          {
            success: false,
            error: "GitHub-projekt hanteras via GitHub API",
            storageType: meta.storageType,
          },
          { status: 400 }
        );
      }
    }

    // Try to load files (works even without formal takeover meta)
    const files = await loadFilesWithFallback(projectId);
    
    if (!files || files.length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Inga filer hittades. Gör en takeover från Builder först.",
          hint: "Gå till Builder, generera en sajt, och tryck 'Ta över'." 
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      storageType: meta?.storageType || "redis",
      meta: meta || null,
      files,
      filesCount: files.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Okänt fel";
    console.error("[Projects/files] Error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
