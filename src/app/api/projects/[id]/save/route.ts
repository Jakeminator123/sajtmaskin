import { NextRequest, NextResponse } from "next/server";
import { getProjectById, saveProjectData } from "@/lib/database";
import { deleteCache } from "@/lib/redis";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/projects/[id]/save - Save project data (chat, files, etc.)
 *
 * NOTE: This route ONLY saves data locally (SQLite + Redis cache).
 * Vercel deployment is NOT triggered here!
 *
 * For deployment, use POST /api/vercel/deploy manually when user clicks "Publish".
 * During editing, use v0's demoUrl for live preview (no build needed).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    const project = getProjectById(id);
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    const { chatId, demoUrl, currentCode, files, messages } = body;

    // Save project data to database
    saveProjectData({
      project_id: id,
      chat_id: chatId,
      demo_url: demoUrl,
      current_code: currentCode,
      files: files || [],
      messages: messages || [],
    });

    // Invalidate caches (project detail + list)
    await Promise.all([
      deleteCache(`project:${id}`),
      deleteCache("projects:list"),
    ]);

    // ═══════════════════════════════════════════════════════════════════════════
    // NO AUTOMATIC VERCEL DEPLOYMENT!
    // ═══════════════════════════════════════════════════════════════════════════
    // Previously, this route auto-deployed to Vercel on every save.
    // This caused unnecessary builds and deployment quota usage.
    //
    // Now:
    // - Use v0's demoUrl for preview during editing (instant, no build)
    // - Only deploy to Vercel when user clicks "Publish" (/api/vercel/deploy)
    // ═══════════════════════════════════════════════════════════════════════════

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[API] Failed to save project data:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
