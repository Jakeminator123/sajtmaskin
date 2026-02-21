import { NextRequest, NextResponse } from "next/server";
import { getProjectByIdForOwner, saveProjectData } from "@/lib/db/services";
import { deleteCache } from "@/lib/data/redis";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function getOwnerCacheSegment(userId: string | null, sessionId: string | null): string {
  if (userId) return `user:${userId}`;
  if (sessionId) return `session:${sessionId}`;
  return "anonymous";
}

/**
 * POST /api/projects/[id]/save - Save project data (chat, files, etc.)
 *
 * NOTE: This route saves data to Supabase + Redis cache.
 * Vercel deployment is NOT triggered here!
 *
 * For deployment, use POST /api/v0/deployments when user clicks "Publish".
 * During editing, use v0's demoUrl for live preview (no build needed).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const user = await getCurrentUser(request);
    const sessionId = getSessionIdFromRequest(request);
    const ownerKey = getOwnerCacheSegment(user?.id ?? null, sessionId);

    const project = await getProjectByIdForOwner(id, {
      userId: user?.id ?? null,
      sessionId,
    });
    if (!project) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    const { chatId, demoUrl, currentCode, files, messages, meta } = body;

    const payload: Parameters<typeof saveProjectData>[0] = {
      project_id: id,
    };
    if (Object.prototype.hasOwnProperty.call(body, "chatId")) {
      payload.chat_id = chatId ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "demoUrl")) {
      payload.demo_url = demoUrl ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "currentCode")) {
      payload.current_code = currentCode ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "files")) {
      payload.files = Array.isArray(files) ? files : [];
    }
    if (Object.prototype.hasOwnProperty.call(body, "messages")) {
      payload.messages = Array.isArray(messages) ? messages : [];
    }
    if (Object.prototype.hasOwnProperty.call(body, "meta")) {
      payload.meta = meta ?? null;
    }

    // Save project data to database
    await saveProjectData(payload);

    // Invalidate caches (project detail + list)
    await Promise.all([
      deleteCache(`project:${id}`),
      deleteCache(`project:${id}:${ownerKey}`),
      deleteCache("projects:list"),
      deleteCache(`projects:list:${ownerKey}`),
    ]);

    // ═══════════════════════════════════════════════════════════════════════════
    // NO AUTOMATIC VERCEL DEPLOYMENT!
    // ═══════════════════════════════════════════════════════════════════════════
    // Previously, this route auto-deployed to Vercel on every save.
    // This caused unnecessary builds and deployment quota usage.
    //
    // Now:
    // - Use v0's demoUrl for preview during editing (instant, no build)
    // - Only deploy to Vercel when user clicks "Publish" (/api/v0/deployments)
    // ═══════════════════════════════════════════════════════════════════════════

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[API] Failed to save project data:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
