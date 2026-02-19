import { NextRequest, NextResponse } from "next/server";
import {
  getProjectByIdForOwner,
  updateProject,
  deleteProject,
  getProjectData,
  type Project,
  type ProjectData,
} from "@/lib/db/services";
import { getCache, setCache, deleteCache } from "@/lib/data/redis";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function getOwnerCacheSegment(userId: string | null, sessionId: string | null): string {
  if (userId) return `user:${userId}`;
  if (sessionId) return `session:${sessionId}`;
  return "anonymous";
}

// GET /api/projects/[id] - Get single project with data
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getCurrentUser(request);
    const sessionId = getSessionIdFromRequest(request);
    const ownerKey = getOwnerCacheSegment(user?.id ?? null, sessionId);

    const cacheKey = `project:${id}:${ownerKey}`;
    const cached = await getCache<{ project: Project; data: ProjectData }>(cacheKey);
    if (cached) {
      console.log("[API/projects/:id] Redis cache hit for", id);
      return NextResponse.json({
        success: true,
        project: cached.project,
        data: cached.data,
        cached: true,
      });
    }

    const project = await getProjectByIdForOwner(id, {
      userId: user?.id ?? null,
      sessionId,
    });

    if (!project) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    const projectData = await getProjectData(id);

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
      { status: 500 },
    );
  }
}

// PUT /api/projects/[id] - Update project
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const user = await getCurrentUser(request);
    const sessionId = getSessionIdFromRequest(request);
    const ownerKey = getOwnerCacheSegment(user?.id ?? null, sessionId);

    const existing = await getProjectByIdForOwner(id, {
      userId: user?.id ?? null,
      sessionId,
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    const updated = await updateProject(id, body);

    // Invalidate caches
    await Promise.all([
      deleteCache(`project:${id}`),
      deleteCache(`project:${id}:${ownerKey}`),
      deleteCache("projects:list"),
      deleteCache(`projects:list:${ownerKey}`),
    ]);

    return NextResponse.json({ success: true, project: updated });
  } catch (error: unknown) {
    console.error("[API] Failed to update project:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// DELETE /api/projects/[id] - Delete project
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getCurrentUser(request);
    const sessionId = getSessionIdFromRequest(request);
    const ownerKey = getOwnerCacheSegment(user?.id ?? null, sessionId);

    const existing = await getProjectByIdForOwner(id, {
      userId: user?.id ?? null,
      sessionId,
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    const deleted = await deleteProject(id);

    if (!deleted) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    // Invalidate caches so deleted project disappears immediately
    await Promise.all([
      deleteCache(`project:${id}`),
      deleteCache(`project:${id}:${ownerKey}`),
      deleteCache("projects:list"),
      deleteCache(`projects:list:${ownerKey}`),
    ]);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[API] Failed to delete project:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
