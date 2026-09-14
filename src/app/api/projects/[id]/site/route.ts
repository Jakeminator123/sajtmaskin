import { NextRequest, NextResponse } from "next/server";
import { getProjectByIdForOwner } from "@/lib/db/services/projects";
import { getProjectSiteOverview } from "@/lib/projects/site-overview";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/projects/[id]/site — address and publish state for the portal.
 *
 * Not cached. The address can change the moment a domain verifies or a deploy
 * finishes, and a stale "din sajt är live på X" is worse than a slower page.
 *
 * Ownership is resolved from the request, never from the id in the URL: the
 * same 404 is returned for "does not exist" and "belongs to someone else", so
 * the endpoint cannot be used to probe which project ids are real.
 */
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
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    const overview = await getProjectSiteOverview(project.id);
    if (!overview) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      site: {
        ...overview,
        liveAt: overview.liveAt ? overview.liveAt.toISOString() : null,
      },
    });
  } catch (error: unknown) {
    console.error("[API/projects/:id/site] Failed to resolve site overview:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
