import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { TEST_USER_EMAIL } from "@/lib/db/services";
import { deleteProject, isVercelConfigured } from "@/lib/vercel/vercel-client";

async function isAdmin(req: NextRequest): Promise<boolean> {
  const user = await getCurrentUser(req);
  return Boolean(user?.email && user.email === TEST_USER_EMAIL);
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
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
