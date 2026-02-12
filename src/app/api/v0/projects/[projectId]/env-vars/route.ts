import { NextResponse } from "next/server";
import { z } from "zod";
import { assertV0Key, v0 } from "@/lib/v0";
import { withRateLimit } from "@/lib/rateLimit";
import { getProjectByIdForRequest } from "@/lib/tenant";
import { debugLog, errorLog } from "@/lib/utils/debug";

const SYNTHETIC_V0_PROJECT_PREFIXES = ["chat:", "registry:"];

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

type EnvVarListItem = {
  id?: string;
  key: string;
  value?: string | null;
  sensitive?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type V0ProjectsEnvClient = {
  projects?: {
    findEnvVars?: (arg: { projectId: string }) => Promise<unknown>;
    createEnvVars?: (arg: {
      projectId: string;
      body: Array<{ key: string; value: string; sensitive?: boolean }>;
      upsert?: boolean;
    }) => Promise<unknown>;
    deleteEnvVars?: (arg: { projectId: string; body: string[] }) => Promise<unknown>;
  };
};

function isSyntheticV0ProjectId(value: string): boolean {
  return SYNTHETIC_V0_PROJECT_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function normalizeEnvVarItem(value: unknown): EnvVarListItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const key =
    (typeof item.key === "string" && item.key) ||
    (typeof item.name === "string" && item.name) ||
    null;
  if (!key) return null;
  const id =
    (typeof item.id === "string" && item.id) ||
    (typeof item.envVarId === "string" && item.envVarId) ||
    undefined;
  return {
    id,
    key,
    value: typeof item.value === "string" ? item.value : null,
    sensitive: Boolean(item.sensitive),
    createdAt:
      (typeof item.createdAt === "string" && item.createdAt) ||
      (typeof item.created_at === "string" && item.created_at) ||
      null,
    updatedAt:
      (typeof item.updatedAt === "string" && item.updatedAt) ||
      (typeof item.updated_at === "string" && item.updated_at) ||
      null,
  };
}

function normalizeEnvVarList(payload: unknown): EnvVarListItem[] {
  const raw =
    Array.isArray(payload)
      ? payload
      : payload && typeof payload === "object"
        ? (payload as Record<string, unknown>).envVars ??
          (payload as Record<string, unknown>).items ??
          (payload as Record<string, unknown>).data ??
          (payload as Record<string, unknown>).variables ??
          (payload as Record<string, unknown>).vars ??
          []
        : [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => normalizeEnvVarItem(item))
    .filter((item): item is EnvVarListItem => Boolean(item))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function getV0ProjectsEnvClient() {
  const client = v0 as unknown as V0ProjectsEnvClient;
  if (!client.projects?.findEnvVars) {
    throw new Error("v0 SDK does not expose projects.findEnvVars");
  }
  if (!client.projects?.createEnvVars) {
    throw new Error("v0 SDK does not expose projects.createEnvVars");
  }
  if (!client.projects?.deleteEnvVars) {
    throw new Error("v0 SDK does not expose projects.deleteEnvVars");
  }
  return client.projects;
}

async function resolveOwnedV0ProjectId(req: Request, projectId: string) {
  const project = await getProjectByIdForRequest(req, projectId);
  if (!project) return { error: "Project not found", status: 404 as const };
  const v0ProjectId = (project.v0ProjectId || "").trim();
  if (!v0ProjectId) {
    return { error: "Project has no v0 project id", status: 422 as const };
  }
  if (isSyntheticV0ProjectId(v0ProjectId)) {
    return {
      error: "Env vars are not supported for synthetic project ids",
      status: 422 as const,
    };
  }
  return { project, v0ProjectId } as const;
}

async function fetchProjectEnvVars(v0ProjectId: string): Promise<EnvVarListItem[]> {
  const projectsClient = getV0ProjectsEnvClient();
  const response = await projectsClient.findEnvVars!({ projectId: v0ProjectId });
  return normalizeEnvVarList(response);
}

export async function GET(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  return withRateLimit(req, "projects:env-vars:list", async () => {
    try {
      assertV0Key();
      const { projectId } = await ctx.params;
      const resolved = await resolveOwnedV0ProjectId(req, projectId);
      if ("error" in resolved) {
        return NextResponse.json({ error: resolved.error }, { status: resolved.status });
      }
      const envVars = await fetchProjectEnvVars(resolved.v0ProjectId);
      return NextResponse.json({
        success: true,
        projectId: resolved.project.id,
        v0ProjectId: resolved.v0ProjectId,
        envVars,
      });
    } catch (error) {
      errorLog("v0", "Failed to list project env vars", error);
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
      assertV0Key();
      const body = await req.json().catch(() => ({}));
      const validation = createEnvVarsSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { error: "Validation failed", details: validation.error.issues },
          { status: 400 },
        );
      }

      const { projectId } = await ctx.params;
      const resolved = await resolveOwnedV0ProjectId(req, projectId);
      if ("error" in resolved) {
        return NextResponse.json({ error: resolved.error }, { status: resolved.status });
      }

      const projectsClient = getV0ProjectsEnvClient();
      await projectsClient.createEnvVars!({
        projectId: resolved.v0ProjectId,
        body: validation.data.vars.map((envVar) => ({
          key: envVar.key.trim().toUpperCase(),
          value: envVar.value,
          sensitive: envVar.sensitive ?? true,
        })),
        upsert: validation.data.upsert ?? true,
      });

      const envVars = await fetchProjectEnvVars(resolved.v0ProjectId);
      return NextResponse.json({
        success: true,
        projectId: resolved.project.id,
        v0ProjectId: resolved.v0ProjectId,
        envVars,
      });
    } catch (error) {
      errorLog("v0", "Failed to create/update project env vars", error);
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
      assertV0Key();
      const body = await req.json().catch(() => ({}));
      const validation = deleteEnvVarsSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { error: "Validation failed", details: validation.error.issues },
          { status: 400 },
        );
      }

      const { projectId } = await ctx.params;
      const resolved = await resolveOwnedV0ProjectId(req, projectId);
      if ("error" in resolved) {
        return NextResponse.json({ error: resolved.error }, { status: resolved.status });
      }

      const envVars = await fetchProjectEnvVars(resolved.v0ProjectId);
      const idsByKey = new Map<string, string>();
      envVars.forEach((envVar) => {
        if (envVar.id) idsByKey.set(envVar.key, envVar.id);
      });

      const idsFromKeys = (validation.data.keys ?? [])
        .map((key) => idsByKey.get(key.trim().toUpperCase()) || null)
        .filter((id): id is string => Boolean(id));
      const ids = Array.from(new Set([...(validation.data.ids ?? []), ...idsFromKeys]));
      if (ids.length === 0) {
        return NextResponse.json({ error: "No matching env var ids found" }, { status: 404 });
      }

      const projectsClient = getV0ProjectsEnvClient();
      await projectsClient.deleteEnvVars!({
        projectId: resolved.v0ProjectId,
        body: ids,
      });

      const nextEnvVars = await fetchProjectEnvVars(resolved.v0ProjectId);
      debugLog("v0", "Deleted project env vars", {
        projectId: resolved.project.id,
        v0ProjectId: resolved.v0ProjectId,
        deletedIds: ids,
      });
      return NextResponse.json({
        success: true,
        projectId: resolved.project.id,
        v0ProjectId: resolved.v0ProjectId,
        envVars: nextEnvVars,
      });
    } catch (error) {
      errorLog("v0", "Failed to delete project env vars", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to delete env vars" },
        { status: 500 },
      );
    }
  });
}
