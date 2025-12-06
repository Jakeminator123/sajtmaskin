import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProjectMeta } from "@/lib/redis";
import { loadProjectFilesWithFallback } from "@/lib/project-files";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/[id]/files
 *
 * Returns files + metadata for a taken-over project.
 * Uses centralized file loading with fallback chain: Redis → SQLite → Legacy.
 */
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

    // Try to load files (uses centralized fallback chain)
    const files = await loadProjectFilesWithFallback(projectId);
    
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
      storageType: meta?.storageType || "sqlite",
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
