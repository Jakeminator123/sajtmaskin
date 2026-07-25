import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/admin";
import { deleteProject, isVercelConfigured } from "@/lib/vercel/vercel-client";
import { SELF_PROJECT_DELETE_ERROR, isSelfVercelProject } from "@/lib/vercel/self-project-guard";

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
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
    const { projectId } = await ctx.params;
    const teamId = req.nextUrl.searchParams.get("teamId") || process.env.VERCEL_TEAM_ID?.trim();
    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "projectId is required" },
        { status: 400 },
      );
    }

    // Fail closed on Sajtmaskin's own project — deleting it would take the whole
    // app (and this very admin panel) down. See self-project-guard.ts.
    if (isSelfVercelProject(projectId)) {
      return NextResponse.json(
        { success: false, error: SELF_PROJECT_DELETE_ERROR },
        { status: 400 },
      );
    }

    await deleteProject(projectId, teamId || undefined);

    return NextResponse.json({ success: true, projectId });
  } catch (error) {
    console.error("[API/admin/vercel/projects/[projectId]] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
