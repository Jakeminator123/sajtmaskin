/**
 * Vercel Deployment API Route
 * ===========================
 *
 * POST /api/vercel/deploy
 * Deploy a project to Vercel
 */

import { NextRequest, NextResponse } from "next/server";
import { deployProject } from "@/lib/vercel-deployment-service";
import { isVercelConfigured } from "@/lib/vercel-client";
import { FEATURES } from "@/lib/config";

export async function POST(request: NextRequest) {
  try {
    // Check if Vercel integration is enabled
    if (!FEATURES.useVercelApi || !isVercelConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Vercel integration not configured. Set VERCEL_API_TOKEN environment variable.",
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { projectId, projectName, framework, env, target } = body;

    if (!projectId || !projectName) {
      return NextResponse.json(
        {
          success: false,
          error: "projectId and projectName are required",
        },
        { status: 400 }
      );
    }

    const result = await deployProject({
      projectId,
      projectName,
      framework,
      env,
      target,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[API/vercel/deploy] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
