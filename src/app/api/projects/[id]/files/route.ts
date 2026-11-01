import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getProjectByIdForOwner, getProjectData } from "@/lib/db/services/projects";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_PROJECT_ID_CHARS = 200;

/**
 * GET /api/projects/[id]/files
 *
 * Returns files for a project.
 * Files are stored in project_data.files (synced from v0 or own-engine on save).
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;

    if (!projectId || projectId.length > MAX_PROJECT_ID_CHARS) {
      return NextResponse.json({ success: false, error: "Ogiltigt projekt-ID" }, { status: 400 });
    }

    // Require auth
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

    // Get project data with files
    const projectData = await getProjectData(projectId);
    const rawFiles = projectData?.files;

    if (!rawFiles || !Array.isArray(rawFiles) || rawFiles.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Inga filer hittades i projektet.",
          hint: "Generera en sajt först.",
        },
        { status: 404 },
      );
    }

    // Convert v0 file format
    const files = rawFiles
      .filter(
        (f): f is { name: string; content: string } =>
          f !== null &&
          typeof f === "object" &&
          "name" in f &&
          typeof f.name === "string" &&
          "content" in f &&
          typeof f.content === "string",
      )
      .map((f) => ({ path: f.name, content: f.content }));

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: "Inga giltiga filer hittades i projektet." },
        { status: 422 },
      );
    }

    return NextResponse.json({
      success: true,
      files,
      filesCount: files.length,
    });
  } catch (error: unknown) {
    console.error("[Projects/files] Error:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte hämta projektfiler" },
      { status: 500 },
    );
  }
}
