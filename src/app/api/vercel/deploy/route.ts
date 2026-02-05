/**
 * Vercel Deployment API Route
 * ===========================
 *
 * POST /api/vercel/deploy
 * Deploy a project to Vercel
 */

import { NextRequest, NextResponse } from "next/server";
import { deployProject } from "@/lib/vercel/vercel-deployment-service";
import { isVercelConfigured } from "@/lib/vercel/vercel-client";
import { FEATURES } from "@/lib/config";
import { prepareCredits } from "@/lib/credits/server";

export async function POST(request: NextRequest) {
  try {
    // Check if Vercel integration is enabled
    if (!FEATURES.useVercelApi || !isVercelConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: "Vercel integration not configured. Set VERCEL_TOKEN environment variable.",
        },
        { status: 503 },
      );
    }

    const body = await request.json();
    const { projectId, projectName, framework, env, target, teamId } = body;
    const resolvedTeamId = teamId || process.env.VERCEL_TEAM_ID?.trim() || undefined;

    if (!projectId || !projectName) {
      return NextResponse.json(
        {
          success: false,
          error: "projectId and projectName are required",
        },
        { status: 400 },
      );
    }

    const deployTarget = target === "preview" ? "preview" : "production";
    const creditCheck = await prepareCredits(
      request,
      deployTarget === "preview" ? "deploy.preview" : "deploy.production",
      { target: deployTarget },
    );
    if (!creditCheck.ok) {
      return creditCheck.response;
    }

    const result = await deployProject({
      projectId,
      projectName,
      framework,
      env,
      target,
      teamId: resolvedTeamId,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 500 });
    }

    try {
      await creditCheck.commit();
    } catch (error) {
      console.error("[credits] Failed to charge deploy:", error);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[API/vercel/deploy] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
