import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/admin";
import { listEnvironmentVariables, isVercelConfigured } from "@/lib/vercel/vercel-client";

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
