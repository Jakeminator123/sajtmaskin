import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import { getProjectByIdForOwner } from "@/lib/db/services";
import { captureAndSaveProjectThumbnail } from "@/lib/thumbnail-capture";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  url: z.string().url(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getCurrentUser(request);
    const sessionId = getSessionIdFromRequest(request);

    const project = await getProjectByIdForOwner(id, {
      userId: user?.id ?? null,
      sessionId,
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const ownerId = user?.id || sessionId || "anonymous";
    const thumbnailUrl = await captureAndSaveProjectThumbnail({
      url: parsed.data.url,
      projectId: id,
      userId: ownerId,
    });

    if (!thumbnailUrl) {
      return NextResponse.json(
        { error: "Could not capture thumbnail" },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, thumbnailUrl });
  } catch (err) {
    console.error("[thumbnail] Route error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Thumbnail capture failed" },
      { status: 500 },
    );
  }
}
