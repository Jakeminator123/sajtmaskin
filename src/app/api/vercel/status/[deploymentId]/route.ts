/**
 * Vercel Deployment Status API Route
 * GET /api/vercel/status/[deploymentId]
 */

import { NextRequest, NextResponse } from "next/server";
import { getProjectDeploymentStatus } from "@/lib/vercel-deployment-service";
import { isVercelConfigured } from "@/lib/vercel-client";
import { FEATURES } from "@/lib/config";

interface RouteParams {
  params: Promise<{ deploymentId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    if (!FEATURES.useVercelApi || !isVercelConfigured()) {
      return NextResponse.json(
        { success: false, error: "Vercel integration not configured." },
        { status: 503 }
      );
    }

    const { deploymentId } = await params;

    if (!deploymentId) {
      return NextResponse.json(
        { success: false, error: "deploymentId is required" },
        { status: 400 }
      );
    }

    const status = await getProjectDeploymentStatus(deploymentId);

    if (!status) {
      return NextResponse.json(
        { success: false, error: "Deployment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, deployment: status });
  } catch (error) {
    console.error("[API/vercel/status] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
