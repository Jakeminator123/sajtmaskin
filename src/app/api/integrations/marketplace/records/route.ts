import { NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userIntegrations } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/auth";
import { getProjectByIdForRequest } from "@/lib/tenant";

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId")?.trim() || "";
    if (projectId) {
      const project = await getProjectByIdForRequest(req, projectId);
      if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
      const rows = await db
        .select()
        .from(userIntegrations)
        .where(
          and(
            eq(userIntegrations.user_id, user.id),
            eq(userIntegrations.project_id, project.id),
          ),
        )
        .orderBy(desc(userIntegrations.updated_at));
      return NextResponse.json({ success: true, records: rows });
    }

    const rows = await db
      .select()
      .from(userIntegrations)
      .where(
        and(eq(userIntegrations.user_id, user.id), isNull(userIntegrations.project_id)),
      )
      .orderBy(desc(userIntegrations.updated_at));
    return NextResponse.json({ success: true, records: rows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list integration records" },
      { status: 500 },
    );
  }
}
