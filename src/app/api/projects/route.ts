import { NextRequest, NextResponse } from "next/server";
import {
  createProject,
  getAllProjectsForOwner,
  getProjectData,
  type Project,
} from "@/lib/db/services";
import { getCache, setCache, deleteCache } from "@/lib/data/redis";
import { canCreateProject } from "@/lib/project-cleanup";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";

function getOwnerCacheSegment(userId: string | null, sessionId: string | null): string {
  if (userId) return `user:${userId}`;
  if (sessionId) return `session:${sessionId}`;
  return "anonymous";
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
      console.log("[API/projects] Redis cache hit");
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
    await setCache(cacheKey, { projects: projectsWithPreview }, 120);

    return NextResponse.json({ success: true, projects: projectsWithPreview, cached: false });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[API] Failed to get projects:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/projects - Create new project
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, category, description } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Project name is required" },
        { status: 400 },
      );
    }

    // Get user and session from request (cookies, not body)
    const user = await getCurrentUser(request);
    const sessionId = getSessionIdFromRequest(request);
    const isPaidUser = user ? user.diamonds > 100 : false; // Simple check - could be more sophisticated

    const limitCheck = await canCreateProject(user?.id || null, sessionId || null, isPaidUser);

    if (!limitCheck.allowed) {
      console.log("[API/projects] Project limit reached:", {
        userId: user?.id,
        sessionId,
        current: limitCheck.current,
        limit: limitCheck.limit,
      });
      return NextResponse.json(
        {
          success: false,
          error: limitCheck.reason,
          limitReached: true,
          current: limitCheck.current,
          limit: limitCheck.limit,
        },
        { status: 403 },
      );
    }

    const project = await createProject(
      name,
      category,
      description,
      user ? undefined : sessionId || undefined, // sessionId only for anonymous
      user?.id, // userId for authenticated
    );

    // Invalidate projects list caches
    const ownerKey = getOwnerCacheSegment(user?.id ?? null, sessionId);
    await Promise.all([deleteCache("projects:list"), deleteCache(`projects:list:${ownerKey}`)]);

    return NextResponse.json({
      success: true,
      project,
      projectsRemaining: limitCheck.limit - limitCheck.current - 1,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[API] Failed to create project:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
