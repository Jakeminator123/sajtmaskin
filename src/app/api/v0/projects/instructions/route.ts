"use server";

import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { getRequestUserId } from "@/lib/tenant";
import { debugLog } from "@/lib/utils/debug";

const SYNTHETIC_V0_PROJECT_PREFIXES = ["chat:", "registry:"];

function isSyntheticV0ProjectId(value: string): boolean {
  return SYNTHETIC_V0_PROJECT_PREFIXES.some((prefix) => value.startsWith(prefix));
}

type UpdateInstructionsRequest = {
  projectId?: string;
  instructions?: string;
};

async function getProjectForRequest(req: Request, projectId: string) {
  const userId = await getRequestUserId(req);
  const baseFilter = userId ? eq(projects.userId, userId) : isNull(projects.userId);

  const byId = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), baseFilter))
    .limit(1);
  if (byId[0]) return byId[0];

  const byV0Id = await db
    .select()
    .from(projects)
    .where(and(eq(projects.v0ProjectId, projectId), baseFilter))
    .limit(1);
  return byV0Id[0] ?? null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as UpdateInstructionsRequest;
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const project = await getProjectForRequest(req, projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const v0ProjectId = project.v0ProjectId?.trim();
    const isInternalId = Boolean(v0ProjectId && v0ProjectId === project.id);
    if (!v0ProjectId || isSyntheticV0ProjectId(v0ProjectId) || isInternalId) {
      debugLog("projects", "Instruction sync skipped (no V0 Platform)", {
        projectId,
        v0ProjectId: v0ProjectId || null,
      });
      return NextResponse.json({
        success: true,
        projectId,
        v0ProjectId: v0ProjectId || null,
        skipped: true,
        reason: !v0ProjectId
          ? "missing_v0_project_id"
          : isInternalId
            ? "internal_project_id"
            : "synthetic_v0_project_id",
      });
    }

    debugLog("projects", "Project instructions accepted locally (V0 Platform sync removed)", {
      projectId,
      v0ProjectId,
      instructionLength: instructions.length,
    });

    return NextResponse.json({
      success: true,
      projectId,
      v0ProjectId,
      skipped: false,
      note: "Instructions are not synced to V0 Platform; own-engine uses project context in-app.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update project instructions" },
      { status: 500 },
    );
  }
}
