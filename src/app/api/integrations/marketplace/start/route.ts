import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { userIntegrations } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/auth";
import { getProjectByIdForRequest } from "@/lib/tenant";

const startMarketplaceInstallSchema = z.object({
  integrationType: z.enum(["neon", "supabase", "upstash"]),
  projectId: z.string().min(1).optional(),
});

const INTEGRATION_TO_MARKETPLACE_SLUG: Record<string, string> = {
  neon: "neon",
  supabase: "supabase",
  upstash: "upstash",
};

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const validation = startMarketplaceInstallSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 },
      );
    }

    const { integrationType, projectId } = validation.data;
    const project = projectId ? await getProjectByIdForRequest(req, projectId) : null;
    if (projectId && !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const marketplaceSlug = INTEGRATION_TO_MARKETPLACE_SLUG[integrationType];
    const installUrl = `https://vercel.com/marketplace/${marketplaceSlug}`;
    const now = new Date();

    const existing = project?.id
      ? await db
          .select()
          .from(userIntegrations)
          .where(
            and(
              eq(userIntegrations.user_id, user.id),
              eq(userIntegrations.project_id, project.id),
              eq(userIntegrations.integration_type, integrationType),
            ),
          )
          .limit(1)
      : await db
          .select()
          .from(userIntegrations)
          .where(
            and(
              eq(userIntegrations.user_id, user.id),
              isNull(userIntegrations.project_id),
              eq(userIntegrations.integration_type, integrationType),
            ),
          )
          .limit(1);

    if (existing[0]) {
      await db
        .update(userIntegrations)
        .set({
          status: "pending",
          marketplace_slug: marketplaceSlug,
          install_url: installUrl,
          ownership_model: "user_managed_vercel",
          billing_owner: "user",
          v0_project_id: project?.v0ProjectId ?? null,
          updated_at: now,
        })
        .where(eq(userIntegrations.id, existing[0].id));
    } else {
      await db.insert(userIntegrations).values({
        id: nanoid(),
        user_id: user.id,
        project_id: project?.id ?? null,
        v0_project_id: project?.v0ProjectId ?? null,
        integration_type: integrationType,
        marketplace_slug: marketplaceSlug,
        ownership_model: "user_managed_vercel",
        billing_owner: "user",
        status: "pending",
        install_url: installUrl,
        created_at: now,
        updated_at: now,
      });
    }

    return NextResponse.json({
      success: true,
      strategy: {
        key: "user_managed_vercel",
        ownershipModel: "user_vercel_account",
        billingOwner: "user",
      },
      installUrl,
      integrationType,
      projectId: project?.id ?? null,
      v0ProjectId: project?.v0ProjectId ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start marketplace flow" },
      { status: 500 },
    );
  }
}
