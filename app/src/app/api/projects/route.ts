import { NextRequest, NextResponse } from "next/server";
import { createProject, getAllProjects } from "@/lib/database";
import { getCache, setCache, deleteCache } from "@/lib/redis";

// GET /api/projects - List all projects
export async function GET() {
  try {
    // Try Redis cache first (short TTL for freshness)
    const cacheKey = "projects:list";
    const cached = await getCache<{ projects: any[] }>(cacheKey);
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
  } catch (error: any) {
    console.error("[API] Failed to get projects:", error);
    return NextResponse.json(
      { success: false, error: error.message },
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

    const project = createProject(name, category, description);

    // Invalidate projects list cache
    await deleteCache("projects:list");

    return NextResponse.json({ success: true, project });
  } catch (error: any) {
    console.error("[API] Failed to create project:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
