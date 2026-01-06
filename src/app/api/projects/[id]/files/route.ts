import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getProjectById, getProjectData } from "@/lib/data/database";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/[id]/files
 *
 * Returns files for a project.
 * Files are stored in project_data.files (from v0 generation).
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

    // Get project
    const project = getProjectById(projectId);
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Projektet hittades inte" },
        { status: 404 }
      );
    }

      // Ownership check
    if (project.user_id !== user.id) {
        return NextResponse.json(
          { success: false, error: "Du kan bara visa dina egna projekt" },
          { status: 403 }
        );
      }

    // Get project data with files
    const projectData = getProjectData(projectId);
    const rawFiles = projectData?.files;

    if (!rawFiles || !Array.isArray(rawFiles) || rawFiles.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Inga filer hittades i projektet.",
          hint: "Generera en sajt först.",
        },
        { status: 404 }
      );
    }

    // Convert v0 file format
    const files = rawFiles
      .filter((f): f is { name: string; content: string } => 
        f !== null && 
        typeof f === "object" && 
        "name" in f && 
        "content" in f
      )
      .map(f => ({ path: f.name, content: f.content }));

    return NextResponse.json({
      success: true,
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
