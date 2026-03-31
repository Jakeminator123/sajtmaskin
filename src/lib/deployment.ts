import { db } from "@/lib/db/client";
import { deployments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export type DeploymentStatus = "pending" | "building" | "ready" | "error" | "cancelled";

export async function createDeploymentRecord(params: {
  chatId: string;
  versionId: string;
  vercelProjectId?: string;
  vercelDeploymentId?: string;
  url?: string;
  inspectorUrl?: string;
}): Promise<string> {
  const id = nanoid();

  await db.insert(deployments).values({
    id,
    chatId: params.chatId,
    versionId: params.versionId,
    vercelProjectId: params.vercelProjectId || null,
    vercelDeploymentId: params.vercelDeploymentId || null,
    status: "pending",
    url: params.url || null,
    inspectorUrl: params.inspectorUrl || null,
  });

  return id;
}

export async function updateDeploymentStatus(
  deploymentId: string,
  status: DeploymentStatus,
  updates?: {
    url?: string | null;
    inspectorUrl?: string | null;
    vercelDeploymentId?: string | null;
    vercelProjectId?: string | null;
  },
): Promise<void> {
  const nextValues: Record<string, string | Date | null> = {
    status,
    updatedAt: new Date(),
  };
  if (updates && Object.prototype.hasOwnProperty.call(updates, "url")) {
    nextValues.url = updates.url ?? null;
  }
  if (updates && Object.prototype.hasOwnProperty.call(updates, "inspectorUrl")) {
    nextValues.inspectorUrl = updates.inspectorUrl ?? null;
  }
  if (updates && Object.prototype.hasOwnProperty.call(updates, "vercelDeploymentId")) {
    nextValues.vercelDeploymentId = updates.vercelDeploymentId ?? null;
  }
  if (updates && Object.prototype.hasOwnProperty.call(updates, "vercelProjectId")) {
    nextValues.vercelProjectId = updates.vercelProjectId ?? null;
  }
  await db
    .update(deployments)
    .set(nextValues)
    .where(eq(deployments.id, deploymentId));
}

export async function setDeploymentDomain(
  deploymentId: string,
  domain: string,
): Promise<void> {
  await db
    .update(deployments)
    .set({ domain, updatedAt: new Date() })
    .where(eq(deployments.id, deploymentId));
}
