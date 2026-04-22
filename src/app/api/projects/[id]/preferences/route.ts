/**
 * Project preferences endpoint.
 *
 * Lightweight `PATCH` for boolean toggles persisted in `project_data.meta`.
 * Today: `allowPlaceholdersInF3` only — added in Phase 5 of the F3-readiness
 * rework so the UI can opt the project into "use placeholders even for
 * tier-3 keys at F3 build time".
 *
 * This route deliberately does NOT touch chat / files / messages so it is
 * safe to call from any panel without race conditions against the larger
 * `/save` endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getProjectByIdForOwner,
  getProjectData,
  saveProjectData,
} from "@/lib/db/services/projects";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const preferencesSchema = z.object({
  allowPlaceholdersInF3: z.boolean().optional(),
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getCurrentUser(request);
    const sessionId = getSessionIdFromRequest(request);

    const project = await getProjectByIdForOwner(id, {
      userId: user?.id ?? null,
      sessionId,
    });
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = preferencesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const existingData = await getProjectData(id);
    const existingMeta = asRecord(existingData?.meta);

    if (typeof parsed.data.allowPlaceholdersInF3 === "boolean") {
      existingMeta.allowPlaceholdersInF3 = parsed.data.allowPlaceholdersInF3;
    }

    await saveProjectData({
      project_id: id,
      meta: existingMeta,
    });

    return NextResponse.json({
      success: true,
      preferences: {
        allowPlaceholdersInF3: existingMeta.allowPlaceholdersInF3 === true,
      },
    });
  } catch (error) {
    console.error("[API] /api/projects/[id]/preferences PATCH failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const user = await getCurrentUser(request);
    const sessionId = getSessionIdFromRequest(request);

    const project = await getProjectByIdForOwner(id, {
      userId: user?.id ?? null,
      sessionId,
    });
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 },
      );
    }

    const data = await getProjectData(id);
    const meta = asRecord(data?.meta);
    return NextResponse.json({
      success: true,
      preferences: {
        allowPlaceholdersInF3: meta.allowPlaceholdersInF3 === true,
      },
    });
  } catch (error) {
    console.error("[API] /api/projects/[id]/preferences GET failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
