import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listUserTakenOverProjects, ProjectMeta } from "@/lib/redis";

/**
 * GET /api/projects/taken-over
 * 
 * Returns all taken-over projects for the current user from Redis.
 * These are projects that have been "taken over" for AI editing.
 */
export async function GET(request: NextRequest) {
  try {
    // Get current user
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Du måste vara inloggad", projects: [] },
        { status: 401 }
      );
    }

    // Get taken-over projects from Redis
    const projects = await listUserTakenOverProjects(user.id);

    return NextResponse.json({
      success: true,
      projects: projects.map((p: ProjectMeta) => ({
        id: p.projectId,
        name: p.name,
        takenOverAt: p.takenOverAt,
        storageType: p.storageType,
        filesCount: p.filesCount,
        githubRepo: p.githubRepo,
        githubOwner: p.githubOwner,
        // For URL routing
        editUrl: p.storageType === "github" && p.githubOwner && p.githubRepo
          ? `/project/${p.githubRepo}?owner=${p.githubOwner}`
          : `/project/${p.projectId}`,
      })),
    });
  } catch (error) {
    console.error("[API] Error fetching taken-over projects:", error);
    return NextResponse.json(
      { success: false, error: "Kunde inte hämta projekt", projects: [] },
      { status: 500 }
    );
  }
}

