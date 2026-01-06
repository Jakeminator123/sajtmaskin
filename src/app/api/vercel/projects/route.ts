/**
 * Vercel Projects API Route
 * =========================
 *
 * GET /api/vercel/projects
 * List all Vercel projects
 */

import { NextRequest, NextResponse } from "next/server";
import { listProjects } from "@/lib/vercel/vercel-client";
import { isVercelConfigured } from "@/lib/vercel/vercel-client";
import { FEATURES } from "@/lib/config";

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get("teamId") || undefined;

    const projects = await listProjects(teamId);

    return NextResponse.json({
      success: true,
      projects,
    });
  } catch (error) {
    console.error("[API/vercel/projects] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
