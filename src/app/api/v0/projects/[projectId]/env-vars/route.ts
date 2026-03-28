import { NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rateLimit";
import { getProjectByIdForOwner } from "@/lib/db/services";
import {
  deleteStoredProjectEnvVars,
  getStoredProjectEnvVars,
  upsertStoredProjectEnvVars,
} from "@/lib/project-env-vars";
import { getCurrentUser } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import { debugLog, errorLog } from "@/lib/utils/debug";

const createEnvVarsSchema = z.object({
  vars: z
    .array(
      z.object({
        key: z
          .string()
          .min(1, "Key is required")
          .regex(/^[A-Z][A-Z0-9_]*$/, "Use UPPER_SNAKE_CASE for env keys"),
        value: z.string(),
        sensitive: z.boolean().optional(),
      }),
    )
    .min(1, "At least one env var is required"),
  upsert: z.boolean().optional(),
});

const deleteEnvVarsSchema = z
  .object({
    ids: z.array(z.string().min(1)).optional(),
    keys: z
      .array(z.string().regex(/^[A-Z][A-Z0-9_]*$/, "Use UPPER_SNAKE_CASE for env keys"))
      .optional(),
  })
  .refine((value) => (value.ids?.length ?? 0) > 0 || (value.keys?.length ?? 0) > 0, {
    message: "Provide ids or keys",
    path: ["ids"],
  });

/** @deprecated V0 Platform env sync removed; app-project env vars are stored locally. */
const LEGACY_ENV_SYNC_REMOVED =
  "V0 Platform env-synk är borttagen. Använd ett app-projekt från byggaren (lagrade env i Sajtmaskin).";

async function resolveOwnedAppProject(req: Request, projectId: string) {
  const user = await getCurrentUser(req);
  const sessionId = getSessionIdFromRequest(req);
  const project = await getProjectByIdForOwner(projectId, {
    userId: user?.id ?? null,
    sessionId,
  });
  return project ?? null;
}

export async function GET(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  return withRateLimit(req, "projects:env-vars:list", async () => {
    try {
      const { projectId } = await ctx.params;
      const appProject = await resolveOwnedAppProject(req, projectId);
      if (appProject) {
        const envVars = await getStoredProjectEnvVars(appProject.id);
        return NextResponse.json({
          success: true,
          projectId: appProject.id,
          source: "app-project",
          envVars,
        });
      }
      return NextResponse.json({ error: LEGACY_ENV_SYNC_REMOVED }, { status: 410 });
    } catch (error) {
      errorLog("env-vars", "Failed to list project env vars", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to list env vars" },
        { status: 500 },
      );
    }
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  return withRateLimit(req, "projects:env-vars:create", async () => {
    try {
      const body = await req.json().catch(() => ({}));
      const validation = createEnvVarsSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { error: "Validation failed", details: validation.error.issues },
          { status: 400 },
        );
      }

      const { projectId } = await ctx.params;
      const appProject = await resolveOwnedAppProject(req, projectId);
      if (appProject) {
        const envVars = await upsertStoredProjectEnvVars(
          appProject.id,
          validation.data.vars.map((envVar) => ({
            key: envVar.key.trim().toUpperCase(),
            value: envVar.value,
            sensitive: envVar.sensitive ?? true,
          })),
        );
        return NextResponse.json({
          success: true,
          projectId: appProject.id,
          source: "app-project",
          envVars,
        });
      }
      return NextResponse.json({ error: LEGACY_ENV_SYNC_REMOVED }, { status: 410 });
    } catch (error) {
      errorLog("env-vars", "Failed to create/update project env vars", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to create env vars" },
        { status: 500 },
      );
    }
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  return withRateLimit(req, "projects:env-vars:delete", async () => {
    try {
      const body = await req.json().catch(() => ({}));
      const validation = deleteEnvVarsSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { error: "Validation failed", details: validation.error.issues },
          { status: 400 },
        );
      }

      const { projectId } = await ctx.params;
      const appProject = await resolveOwnedAppProject(req, projectId);
      if (appProject) {
        const nextEnvVars = await deleteStoredProjectEnvVars(appProject.id, {
          ids: validation.data.ids ?? [],
          keys: validation.data.keys ?? [],
        });
        debugLog("env-vars", "Deleted stored app-project env vars", {
          projectId: appProject.id,
          deletedIds: validation.data.ids ?? [],
          deletedKeys: validation.data.keys ?? [],
        });
        return NextResponse.json({
          success: true,
          projectId: appProject.id,
          source: "app-project",
          envVars: nextEnvVars,
        });
      }
      return NextResponse.json({ error: LEGACY_ENV_SYNC_REMOVED }, { status: 410 });
    } catch (error) {
      errorLog("env-vars", "Failed to delete project env vars", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to delete env vars" },
        { status: 500 },
      );
    }
  });
}
