import { NextRequest, NextResponse } from "next/server";
import {
  getProjectById,
  updateProject,
  deleteProject,
  getProjectData,
  type Project,
  type ProjectData,
} from "@/lib/data/database";
import { getCache, setCache, deleteCache } from "@/lib/data/redis";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/projects/[id] - Get single project with data
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const cacheKey = `project:${id}`;
    const cached = await getCache<{ project: Project; data: ProjectData }>(
      cacheKey
    );
    if (cached) {
      console.log("[API/projects/:id] Redis cache hit for", id);
      return NextResponse.json({
        success: true,
        project: cached.project,
        data: cached.data,
        cached: true,
      });
    }

    const project = getProjectById(id);

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    const projectData = getProjectData(id);

    await setCache(cacheKey, { project, data: projectData }, 120);

    return NextResponse.json({
      success: true,
      project,
      data: projectData,
      cached: false,
    });
  } catch (error: unknown) {
    console.error("[API] Failed to get project:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[id] - Update project
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = getProjectById(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    const updated = updateProject(id, body);

    // Invalidate caches
    await deleteCache(`project:${id}`);
    await deleteCache("projects:list");

    return NextResponse.json({ success: true, project: updated });
  } catch (error: unknown) {
    console.error("[API] Failed to update project:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id] - Delete project
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const deleted = deleteProject(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    // Invalidate caches so deleted project disappears immediately
    await Promise.all([
      deleteCache(`project:${id}`),
      deleteCache("projects:list"),
    ]);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[API] Failed to delete project:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
