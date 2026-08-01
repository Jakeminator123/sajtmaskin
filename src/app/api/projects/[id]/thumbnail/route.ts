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
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import {
  getProjectByIdForOwner,
  getProjectData,
  setProjectThumbnail,
} from "@/lib/db/services/projects";
import { deleteCache } from "@/lib/data/redis";
import {
  assertPreviewUrlAllowed,
  isAllowedCaptureUrl,
} from "@/lib/capture/preview-allowlist";
import { hostResolvesToPrivate, isDisallowedHost } from "@/lib/ssrf-guard";
import { withRateLimit } from "@/lib/rateLimit";
import { deleteBlob, uploadBlob } from "@/lib/vercel/blob-service";
import {
  captureThumbnailScreenshot,
  isTransientCaptureAbort,
} from "@/lib/projects/thumbnail-capture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Blob paths are PUBLIC URLs — never embed the raw session cookie value (it is
 * an ownership credential for guest projects; Codex/VADE P1 on PR #426). Use
 * the user id when logged in, else an opaque hash of the session id.
 */
function blobOwnerSegment(userId: string | null, sessionId: string | null): string {
  if (userId) return userId;
  if (sessionId) {
    return `sess-${createHash("sha256").update(sessionId).digest("hex").slice(0, 12)}`;
  }
  return "anonymous";
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
  const user = await getCurrentUser(req);
  const sessionId = getSessionIdFromRequest(req);
  // Rate-limit key: verified user id when logged in, else the caller IP.
  // The guest session id is CLIENT-CONTROLLED (cookie or x-session-id header),
  // so keying guests on it would let a caller rotate the header and mint a
  // fresh bucket per request on this expensive Chromium route (Codex P2,
  // PR #435). IP is the only guest dimension the caller cannot rotate freely.
  const rateLimitOptions = user?.id ? { userId: user.id } : undefined;

  return withRateLimit(
    req,
    "projects:thumbnail",
    () => handlePOST(req, ctx, { user, sessionId }),
    rateLimitOptions,
  );
}

async function handlePOST(
  req: NextRequest,
  { params }: RouteParams,
  identity: { user: Awaited<ReturnType<typeof getCurrentUser>>; sessionId: string | null },
) {
  try {
    const { id } = await params;
    const { user, sessionId } = identity;
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

    const allowlistDecision = assertPreviewUrlAllowed(target, "Thumbnail-capture");
    if (!allowlistDecision.ok) {
      return NextResponse.json(
        { success: false, error: allowlistDecision.error },
        { status: allowlistDecision.status },
      );
    }

    if (isDisallowedHost(target.hostname) || (await hostResolvesToPrivate(target.hostname))) {
      return NextResponse.json(
        { success: false, error: "Otillåten host för thumbnail." },
        { status: 403 },
      );
    }

    // The capture's request gate blocks private hosts per hop, but a redirect
    // can still land on an arbitrary PUBLIC site — the final main-frame URL
    // must pass the same allowlist as the initial URL (audit A#6).
    const buffer = await captureThumbnailScreenshot(target.toString(), {
      isFinalUrlAllowed: (finalUrl) => isAllowedCaptureUrl(finalUrl, "Thumbnail-capture"),
    });

    // Unique filename per capture: Vercel Blob rejects overwrites of an
    // existing pathname by default, so re-captures need a fresh path. The
    // superseded blob is deleted below once the DB points at the new one.
    const uploaded = await uploadBlob({
      userId: blobOwnerSegment(user?.id ?? null, sessionId),
      filename: `thumbnail-${Date.now()}.jpg`,
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

    let persisted: Awaited<ReturnType<typeof setProjectThumbnail>> | null = null;
    try {
      persisted = await setProjectThumbnail(id, uploaded.url, {
        userId: user?.id ?? null,
        sessionId,
      });
    } catch (persistError) {
      // DB write failed after successful blob upload: avoid orphaned public blobs.
      await deleteBlob(uploaded.url).catch(() => undefined);
      return NextResponse.json(
        {
          success: false,
          error: "Kunde inte spara thumbnail i projektet.",
          details: persistError instanceof Error ? persistError.message : "Unknown persistence error",
        },
        { status: 500 },
      );
    }
    if (!persisted) {
      // Ownership-constrained update failed; do not report a green response with
      // a blob that is not referenced by app_projects.thumbnail_path.
      await deleteBlob(uploaded.url).catch(() => undefined);
      return NextResponse.json(
        { success: false, error: "Kunde inte spara thumbnail i projektet." },
        { status: 500 },
      );
    }

    const previous = persisted.previousThumbnailPath;
    if (previous && previous !== uploaded.url && /^https?:\/\//.test(previous)) {
      // Best-effort: the DB already points at the new blob.
      await deleteBlob(previous).catch(() => undefined);
    }

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
    // Previewen navigerade om (eller deadline slog till) mitt i captureringen.
    // Thumbnailen är kosmetisk och klienten är fire-and-forget, så ett race får
    // inte rapporteras som serverfel — det gjorde att en helt frisk körning såg
    // ut att ha ett 502 i observability (observerat i prod 2026-07-27).
    // Svaret är fortfarande `success: false`: ingen thumbnail sparades.
    if (isTransientCaptureAbort(error)) {
      console.info(
        "[API] Thumbnail capture skipped — preview moved during capture:",
        error instanceof Error ? error.message : error,
      );
      return NextResponse.json(
        { success: false, skipped: true, reason: "capture_interrupted" },
        { status: 200 },
      );
    }
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
