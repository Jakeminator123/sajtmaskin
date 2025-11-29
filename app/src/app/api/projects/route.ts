import { NextRequest, NextResponse } from "next/server";
import { createProject, getAllProjects } from "@/lib/database";

// GET /api/projects - List all projects
export async function GET() {
  try {
    const projects = getAllProjects();
    return NextResponse.json({ success: true, projects });
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

    return NextResponse.json({ success: true, project });
  } catch (error: any) {
    console.error("[API] Failed to create project:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
