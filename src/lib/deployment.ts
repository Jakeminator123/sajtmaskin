import { db } from "@/lib/db/client";
import { deployments } from "@/lib/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getChatByIdForRequest } from "@/lib/tenant";

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

/**
 * The Vercel project id from the most relevant deployment of a chat. Fallback
 * source for domain-linking when the app_projects row has no persisted link
 * yet (e.g. sites published before the link column existed). Prefers a `ready`
 * deployment; otherwise takes the most recent one that carries a project id.
 */
export async function getLatestVercelProjectIdForChat(
  chatId: string,
): Promise<string | null> {
  const rows = await db
    .select({
      vercelProjectId: deployments.vercelProjectId,
      status: deployments.status,
    })
    .from(deployments)
    .where(and(eq(deployments.chatId, chatId), isNotNull(deployments.vercelProjectId)))
    .orderBy(desc(deployments.createdAt));
  if (rows.length === 0) return null;
  const ready = rows.find((r) => r.status === "ready");
  return (ready ?? rows[0]).vercelProjectId ?? null;
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

export async function setDeploymentDomainForRequest(
  req: Request,
  deploymentId: string,
  domain: string,
): Promise<boolean> {
  const [deployment] = await db
    .select({ chatId: deployments.chatId })
    .from(deployments)
    .where(eq(deployments.id, deploymentId))
    .limit(1);
  if (!deployment) return false;

  const chat = await getChatByIdForRequest(req, deployment.chatId);
  if (!chat) return false;

  const result = await db
    .update(deployments)
    .set({ domain, updatedAt: new Date() })
    .where(eq(deployments.id, deploymentId));
  return (result.rowCount ?? 0) > 0;
}
