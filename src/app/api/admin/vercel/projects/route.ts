import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/admin";
import { listProjects, isVercelConfigured } from "@/lib/vercel/vercel-client";
import {
  assertVercelProjectDeletable,
  resolveSelfVercelProject,
} from "@/lib/vercel/self-project-guard";

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
    // Annotate with the SAME decision the delete route makes, so the UI can never
    // offer a delete the API would reject: `isSelf` for the app's own project and
    // `deletable: false` for everything while the self id is unknown.
    const self = resolveSelfVercelProject();
    const annotated = projects.map((project) => {
      const decision = assertVercelProjectDeletable(project.id);
      return {
        ...project,
        isSelf: !decision.allowed && decision.reason === "self",
        deletable: decision.allowed,
      };
    });
    return NextResponse.json({
      success: true,
      projects: annotated,
      /** False → deletion is disabled for every project (see self-project-guard). */
      selfProjectKnown: Boolean(self.id),
      selfProjectIdSource: self.source,
    });
  } catch (error) {
    console.error("[API/admin/vercel/projects] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
