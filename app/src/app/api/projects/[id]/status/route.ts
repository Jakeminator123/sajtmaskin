/**
 * Project Status API
 * ===================
 * Check if a project is owned (saved to Redis/GitHub) and get its storage type.
 */

import { NextRequest, NextResponse } from "next/server";
import { getProjectMeta } from "@/lib/redis";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID required" },
        { status: 400 }
      );
    }

    // Check if project exists in Redis (takeover)
    const meta = await getProjectMeta(projectId);

    if (meta) {
      return NextResponse.json({
        isOwned: true,
        storageType: meta.storageType || "redis",
        projectId: meta.projectId,
        takenOverAt: meta.takenOverAt,
        filesCount: meta.filesCount,
      });
    }

    return NextResponse.json({
      isOwned: false,
      storageType: null,
    });
  } catch (error) {
    console.error("[API] Failed to check project status:", error);
    return NextResponse.json(
      { error: "Failed to check project status" },
      { status: 500 }
    );
  }
}
