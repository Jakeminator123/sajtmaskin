import { NextRequest, NextResponse } from "next/server";
import {
  createProject,
  getAllProjects,
  type Project,
} from "@/lib/database";
import { getCache, setCache, deleteCache } from "@/lib/redis";
import { canCreateProject } from "@/lib/project-cleanup";
import { getCurrentUser } from "@/lib/auth";
import { getSessionIdFromRequest } from "@/lib/session";

// GET /api/projects - List all projects
export async function GET() {
  try {
    // Try Redis cache first (short TTL for freshness)
    const cacheKey = "projects:list";
    const cached = await getCache<{ projects: Project[] }>(cacheKey);
    if (cached) {
      console.log("[API/projects] Redis cache hit");
      return NextResponse.json({
        success: true,
        projects: cached.projects,
        cached: true,
      });
    }

    const projects = getAllProjects();

    // Cache best-effort (120s TTL)
    await setCache(cacheKey, { projects }, 120);

    return NextResponse.json({ success: true, projects, cached: false });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[API] Failed to get projects:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
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
        { status: 400 }
      );
    }

    // Get user and session from request (cookies, not body)
    const user = await getCurrentUser(request);
    const sessionId = getSessionIdFromRequest(request);
    const isPaidUser = user ? user.diamonds > 100 : false; // Simple check - could be more sophisticated

    const limitCheck = canCreateProject(
      user?.id || null,
      sessionId || null,
      isPaidUser
    );

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
        { status: 403 }
      );
    }

    const project = createProject(
      name,
      category,
      description,
      user ? undefined : sessionId || undefined, // sessionId only for anonymous
      user?.id // userId for authenticated
    );

    // Invalidate projects list cache
    await deleteCache("projects:list");

    return NextResponse.json({
      success: true,
      project,
      projectsRemaining: limitCheck.limit - limitCheck.current - 1,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[API] Failed to create project:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
