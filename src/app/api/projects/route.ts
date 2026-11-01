import { NextRequest, NextResponse } from "next/server";
import {
  createProject,
  getAllProjectsForOwner,
  getProjectData,
} from "@/lib/db/services/projects";
import type { Project } from "@/lib/db/services/shared";
import { getCache, setCache, deleteCache } from "@/lib/data/redis";
import { canCreateProject } from "@/lib/projects/project-cleanup";
import { getCurrentUser } from "@/lib/auth/auth";
import { ensureSessionIdFromRequest, getSessionIdFromRequest } from "@/lib/auth/session";

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

// GET /api/projects - List all projects
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    const sessionId = getSessionIdFromRequest(request);
    const ownerKey = getOwnerCacheSegment(user?.id ?? null, sessionId);
    const cacheKey = `projects:list:${ownerKey}`;

    // Try Redis cache first (short TTL for freshness)
    const cached = await getCache<{ projects: Array<Project & { demo_url?: string | null }> }>(cacheKey);
    if (cached) {
      console.info("[API/projects] Redis cache hit");
      return NextResponse.json({
        success: true,
        projects: cached.projects,
        cached: true,
      });
    }

    const projects = await getAllProjectsForOwner({
      userId: user?.id ?? null,
      sessionId,
    });

    // Include lightweight preview reference for project cards.
    const projectDataRows = await Promise.all(projects.map((project) => getProjectData(project.id)));
    const projectsWithPreview = projects.map((project, index) => ({
      ...project,
      demo_url: projectDataRows[index]?.demo_url ?? null,
    }));

    // Cache best-effort (120s TTL)
    await Promise.all([
      setCache(cacheKey, { projects: projectsWithPreview }, 120),
      ...(user?.id && sessionId ? [deleteCache(`projects:list:session:${sessionId}`)] : []),
    ]);

    return NextResponse.json({ success: true, projects: projectsWithPreview, cached: false });
  } catch (error: unknown) {
    console.error("[API] Failed to get projects:", error);
    return NextResponse.json({ success: false, error: "Failed to get projects" }, { status: 500 });
  }
}

// POST /api/projects - Create new project
export async function POST(request: NextRequest) {
  const session = ensureSessionIdFromRequest(request);
  const attachSessionCookie = (response: Response) => {
    const setCookies =
      session.setCookies ?? (session.setCookie ? [session.setCookie] : []);
    for (const setCookie of setCookies) {
      response.headers.append("Set-Cookie", setCookie);
    }
    return response;
  };
  try {
    const body = asRecord(await request.json().catch(() => null));
    if (!body) {
      return attachSessionCookie(
        NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 }),
      );
    }
    const { name, category, description } = body;

    if (typeof name !== "string" || !name.trim()) {
      return attachSessionCookie(
        NextResponse.json({ success: false, error: "Project name is required" }, { status: 400 }),
      );
    }
    if (
      (category !== undefined && category !== null && typeof category !== "string") ||
      (description !== undefined && description !== null && typeof description !== "string")
    ) {
      return attachSessionCookie(
        NextResponse.json({ success: false, error: "Invalid project data" }, { status: 400 }),
      );
    }
    const normalizedCategory =
      typeof category === "string" ? category.trim() || undefined : undefined;
    const normalizedDescription =
      typeof description === "string" ? description.trim() || undefined : undefined;

    // Get user and session from request (cookies, not body)
    const user = await getCurrentUser(request);
    const sessionId = session.sessionId;
    if (normalizedCategory === "kostnadsfri" && !user?.id) {
      return attachSessionCookie(
        NextResponse.json(
          {
            success: false,
            error: "Logga in för att bygga hemsidan.",
            requiresAuth: true,
          },
          { status: 401 },
        ),
      );
    }
    const isPaidUser = user ? user.diamonds > 100 : false; // Simple check - could be more sophisticated

    const limitCheck = await canCreateProject(user?.id || null, sessionId || null, isPaidUser);

    if (!limitCheck.allowed) {
      console.info("[API/projects] Project limit reached:", {
        userId: user?.id,
        sessionId,
        current: limitCheck.current,
        limit: limitCheck.limit,
      });
      return attachSessionCookie(
        NextResponse.json(
          {
            success: false,
            error: limitCheck.reason,
            limitReached: true,
            current: limitCheck.current,
            limit: limitCheck.limit,
          },
          { status: 403 },
        ),
      );
    }

    const project = await createProject(
      name.trim(),
      normalizedCategory,
      normalizedDescription,
      user ? undefined : sessionId || undefined, // sessionId only for anonymous
      user?.id, // userId for authenticated
    );

    // Invalidate projects list caches
    const ownerKeys = getOwnerCacheSegments(user?.id ?? null, sessionId);
    await Promise.all([
      deleteCache("projects:list"),
      ...ownerKeys.map((ownerKey) => deleteCache(`projects:list:${ownerKey}`)),
    ]);

    return attachSessionCookie(
      NextResponse.json({
        success: true,
        project,
        projectsRemaining: limitCheck.limit - limitCheck.current - 1,
      }),
    );
  } catch (error: unknown) {
    console.error("[API] Failed to create project:", error);
    return attachSessionCookie(
      NextResponse.json({ success: false, error: "Failed to create project" }, { status: 500 }),
    );
  }
}
