import { NextRequest, NextResponse } from "next/server";
import {
  deleteProject,
  getProjectByIdForOwner,
  getProjectData,
  renameProjectIfNameIs,
  updateProject,
} from "@/lib/db/services/projects";
import type { Project, ProjectData } from "@/lib/db/services/shared";
import { getCache, setCache, deleteCache } from "@/lib/data/redis";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_PROJECT_ID_CHARS = 200;
const PROJECT_FIELD_LIMITS = {
  name: 200,
  category: 100,
  description: 5_000,
  thumbnail_path: 4_096,
} as const;

function invalidProjectId(id: string): boolean {
  return !id || id.length > MAX_PROJECT_ID_CHARS;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getOwnerCacheSegment(userId: string | null, sessionId: string | null): string {
  if (userId && sessionId) return `user:${userId}:session:${sessionId}`;
  if (userId) return `user:${userId}`;
  if (sessionId) return `session:${sessionId}`;
  return "anonymous";
}

function getOwnerCacheSegments(userId: string | null, sessionId: string | null): string[] {
  return Array.from(
    new Set(
      [getOwnerCacheSegment(userId, sessionId), userId ? `user:${userId}` : null, sessionId ? `session:${sessionId}` : null]
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

// GET /api/projects/[id] - Get single project with data
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (invalidProjectId(id)) {
      return NextResponse.json({ success: false, error: "Invalid project ID" }, { status: 400 });
    }
    const user = await getCurrentUser(request);
    const sessionId = getSessionIdFromRequest(request);
    const ownerKey = getOwnerCacheSegment(user?.id ?? null, sessionId);

    const cacheKey = `project:${id}:${ownerKey}`;
    const cached = await getCache<{ project: Project; data: ProjectData }>(cacheKey);
    if (cached) {
      console.info("[API/projects/:id] Redis cache hit for", id);
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

    await Promise.all([
      setCache(cacheKey, { project, data: projectData }, 120),
      ...(user?.id && sessionId ? [deleteCache(`project:${id}:session:${sessionId}`)] : []),
    ]);

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
        error: "Failed to get project",
      },
      { status: 500 },
    );
  }
}

// PUT /api/projects/[id] - Update project
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (invalidProjectId(id)) {
      return NextResponse.json({ success: false, error: "Invalid project ID" }, { status: 400 });
    }
    const body = asRecord(await request.json().catch(() => null));
    if (!body) {
      return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
    }
    const updateFields = ["name", "category", "description", "thumbnail_path"] as const;
    if (updateFields.some((field) => field in body && typeof body[field] !== "string")) {
      return NextResponse.json({ success: false, error: "Invalid project data" }, { status: 400 });
    }
    if (
      updateFields.some(
        (field) => typeof body[field] === "string" && body[field].length > PROJECT_FIELD_LIMITS[field],
      )
    ) {
      return NextResponse.json({ success: false, error: "Project data is too long" }, { status: 400 });
    }
    // `ifNameIs`: rename only while the stored name is still this one (the
    // builder's placeholder). Only `name` is written on this path.
    const ifNameIs = body.ifNameIs;
    if (
      ifNameIs !== undefined &&
      (typeof ifNameIs !== "string" ||
        ifNameIs.length > PROJECT_FIELD_LIMITS.name ||
        typeof body.name !== "string" ||
        !body.name.trim())
    ) {
      return NextResponse.json({ success: false, error: "Invalid project data" }, { status: 400 });
    }
    const user = await getCurrentUser(request);
    const sessionId = getSessionIdFromRequest(request);
    const ownerKeys = getOwnerCacheSegments(user?.id ?? null, sessionId);

    const ownerScope = { userId: user?.id ?? null, sessionId };
    const existing = await getProjectByIdForOwner(id, ownerScope);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    const invalidateCaches = () =>
      Promise.all([
        deleteCache(`project:${id}`),
        ...ownerKeys.map((ownerKey) => deleteCache(`project:${id}:${ownerKey}`)),
        deleteCache("projects:list"),
        ...ownerKeys.map((ownerKey) => deleteCache(`projects:list:${ownerKey}`)),
      ]);

    if (typeof ifNameIs === "string") {
      const renamed = await renameProjectIfNameIs(id, ifNameIs, body.name as string, ownerScope);
      if (!renamed) {
        return NextResponse.json({ success: true, renamed: false, project: existing });
      }
      await invalidateCaches();
      return NextResponse.json({ success: true, renamed: true, project: renamed });
    }

    const updated = await updateProject(id, body, ownerScope);
    await invalidateCaches();

    return NextResponse.json({ success: true, project: updated });
  } catch (error: unknown) {
    console.error("[API] Failed to update project:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update project",
      },
      { status: 500 },
    );
  }
}

// DELETE /api/projects/[id] - Delete project
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (invalidProjectId(id)) {
      return NextResponse.json({ success: false, error: "Invalid project ID" }, { status: 400 });
    }
    const user = await getCurrentUser(request);
    const sessionId = getSessionIdFromRequest(request);
    const ownerKeys = getOwnerCacheSegments(user?.id ?? null, sessionId);

    const ownerScope = { userId: user?.id ?? null, sessionId };
    const existing = await getProjectByIdForOwner(id, ownerScope);
    if (!existing) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    const deleted = await deleteProject(id, ownerScope);

    if (!deleted) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    // Invalidate caches so deleted project disappears immediately
    await Promise.all([
      deleteCache(`project:${id}`),
      ...ownerKeys.map((ownerKey) => deleteCache(`project:${id}:${ownerKey}`)),
      deleteCache("projects:list"),
      ...ownerKeys.map((ownerKey) => deleteCache(`projects:list:${ownerKey}`)),
    ]);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[API] Failed to delete project:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete project",
      },
      { status: 500 },
    );
  }
}
