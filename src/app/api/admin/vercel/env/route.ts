import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { TEST_USER_EMAIL } from "@/lib/db/services";
import { listEnvironmentVariables, isVercelConfigured } from "@/lib/vercel/vercel-client";

async function isAdmin(req: NextRequest): Promise<boolean> {
  const user = await getCurrentUser(req);
  return Boolean(user?.email && user.email === TEST_USER_EMAIL);
}

export async function GET(req: NextRequest) {
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
    const { searchParams } = new URL(req.url);
    const projectId =
      searchParams.get("projectId") || process.env.VERCEL_PROJECT_ID?.trim() || "";
    const teamId = searchParams.get("teamId") || process.env.VERCEL_TEAM_ID?.trim() || undefined;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: "projectId is required" },
        { status: 400 },
      );
    }

    const envs = await listEnvironmentVariables(projectId, teamId);

    return NextResponse.json({
      success: true,
      projectId,
      envs: envs.map((env) => ({
        id: env.id || null,
        key: env.key,
        target: env.target,
        type: env.type || null,
      })),
    });
  } catch (error) {
    console.error("[API/admin/vercel/env] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
