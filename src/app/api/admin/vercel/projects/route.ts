import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/admin";
import { listProjects, isVercelConfigured } from "@/lib/vercel/vercel-client";
import { isSelfVercelProject } from "@/lib/vercel/self-project-guard";

export async function GET(req: NextRequest) {
  const admin = await requireAdminAccess(req);
  if (!admin.ok) {
    return admin.response;
  }

  if (!isVercelConfigured()) {
    return NextResponse.json(
      { success: false, error: "Vercel integration not configured" },
      { status: 503 },
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId") || process.env.VERCEL_TEAM_ID?.trim() || undefined;
    const projects = await listProjects(teamId);
    // Mark Sajtmaskin's own project so the UI can render it as protected instead
    // of offering a delete button that the API would reject anyway.
    const annotated = projects.map((project) => ({
      ...project,
      isSelf: isSelfVercelProject(project.id),
    }));
    return NextResponse.json({ success: true, projects: annotated });
  } catch (error) {
    console.error("[API/admin/vercel/projects] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
