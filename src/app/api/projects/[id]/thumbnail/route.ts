/**
 * POST /api/projects/[id]/thumbnail
 * Body: { previewUrl?: string }
 *
 * Captures a screenshot of the project's live preview and persists it as the
 * project thumbnail (`app_projects.thumbnail_path`) shown in "Mina projekt".
 * Fire-and-forget from the builder when a preview session becomes ready —
 * failures here must never affect the builder flow.
 *
 * URL source: explicit `previewUrl` in the body, else the stored
 * `project_data.demo_url`. The URL is SSRF-guarded (public http/https only).
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import {
  getProjectByIdForOwner,
  getProjectData,
  updateProject,
} from "@/lib/db/services/projects";
import { deleteCache } from "@/lib/data/redis";
import { hostResolvesToPrivate, isDisallowedHost } from "@/lib/ssrf-guard";
import { withRateLimit } from "@/lib/rateLimit";
import { uploadBlob } from "@/lib/vercel/blob-service";
import { captureThumbnailScreenshot } from "@/lib/projects/thumbnail-capture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RouteParams {
  params: Promise<{ id: string }>;
}

function ownerCacheSegments(userId: string | null, sessionId: string | null): string[] {
  const segments = [
    userId && sessionId ? `user:${userId}:session:${sessionId}` : null,
    userId ? `user:${userId}` : null,
    sessionId ? `session:${sessionId}` : null,
  ].filter((value): value is string => Boolean(value));
  return segments.length > 0 ? Array.from(new Set(segments)) : ["anonymous"];
}

export async function POST(req: NextRequest, ctx: RouteParams) {
  return withRateLimit(req, "projects:thumbnail", () => handlePOST(req, ctx));
}

async function handlePOST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getCurrentUser(req);
    const sessionId = getSessionIdFromRequest(req);
    if (!user && !sessionId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const project = await getProjectByIdForOwner(id, {
      userId: user?.id ?? null,
      sessionId,
    });
    if (!project) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => null)) as { previewUrl?: unknown } | null;
    const bodyUrl = typeof body?.previewUrl === "string" ? body.previewUrl.trim() : "";
    let sourceUrl = bodyUrl;
    if (!sourceUrl) {
      const projectData = await getProjectData(id).catch(() => null);
      sourceUrl = typeof projectData?.demo_url === "string" ? projectData.demo_url.trim() : "";
    }
    if (!sourceUrl) {
      return NextResponse.json(
        { success: false, error: "Ingen preview-URL att fota. Generera en preview först." },
        { status: 409 },
      );
    }

    let target: URL;
    try {
      target = new URL(sourceUrl);
    } catch {
      return NextResponse.json({ success: false, error: "Ogiltig preview-URL." }, { status: 400 });
    }
    if (!["http:", "https:"].includes(target.protocol)) {
      return NextResponse.json({ success: false, error: "Endast http/https stöds." }, { status: 400 });
    }
    if (isDisallowedHost(target.hostname) || (await hostResolvesToPrivate(target.hostname))) {
      return NextResponse.json(
        { success: false, error: "Otillåten host för thumbnail." },
        { status: 403 },
      );
    }

    const buffer = await captureThumbnailScreenshot(target.toString());

    const uploaded = await uploadBlob({
      userId: user?.id ?? sessionId ?? "anonymous",
      filename: `thumbnail-${id}.jpg`,
      buffer,
      contentType: "image/jpeg",
      projectId: id,
      category: "media",
    });
    if (!uploaded?.url) {
      return NextResponse.json(
        { success: false, error: "Kunde inte spara thumbnail-bilden." },
        { status: 502 },
      );
    }

    await updateProject(
      id,
      { thumbnail_path: uploaded.url },
      { userId: user?.id ?? null, sessionId },
    );

    // "Mina projekt" is Redis-cached — invalidate so the new thumbnail shows.
    const ownerKeys = ownerCacheSegments(user?.id ?? null, sessionId);
    await Promise.all([
      deleteCache(`project:${id}`),
      ...ownerKeys.map((key) => deleteCache(`project:${id}:${key}`)),
      deleteCache("projects:list"),
      ...ownerKeys.map((key) => deleteCache(`projects:list:${key}`)),
    ]).catch(() => undefined);

    return NextResponse.json({ success: true, thumbnailPath: uploaded.url });
  } catch (error) {
    console.error("[API] Thumbnail capture failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Kunde inte skapa thumbnail.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 502 },
    );
  }
}
