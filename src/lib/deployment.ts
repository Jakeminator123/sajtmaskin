import { db } from '@/lib/db/client';
import { deployments, versions, chats } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export type DeploymentStatus =
  | 'pending'
  | 'building'
  | 'ready'
  | 'error'
  | 'cancelled';

export interface DeploymentInfo {
  id: string;
  chatId: string;
  versionId: string;
  status: DeploymentStatus;
  vercelProjectId?: string | null;
  url?: string | null;
  inspectorUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

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
    status: 'pending',
    url: params.url || null,
    inspectorUrl: params.inspectorUrl || null,
  });

  return id;
}

export async function updateDeploymentStatus(
  deploymentId: string,
  status: DeploymentStatus,
  updates?: {
    url?: string;
    inspectorUrl?: string;
    vercelDeploymentId?: string;
    vercelProjectId?: string;
  }
): Promise<void> {
  await db
    .update(deployments)
    .set({
      status,
      ...(updates?.url && { url: updates.url }),
      ...(updates?.inspectorUrl && { inspectorUrl: updates.inspectorUrl }),
      ...(updates?.vercelDeploymentId && { vercelDeploymentId: updates.vercelDeploymentId }),
      ...(updates?.vercelProjectId && { vercelProjectId: updates.vercelProjectId }),
      updatedAt: new Date(),
    })
    .where(eq(deployments.id, deploymentId));
}

export async function getDeployment(deploymentId: string): Promise<DeploymentInfo | null> {
  const result = await db
    .select()
    .from(deployments)
    .where(eq(deployments.id, deploymentId))
    .limit(1);

  if (result.length === 0) return null;

  return {
    id: result[0].id,
    chatId: result[0].chatId,
    versionId: result[0].versionId,
    status: result[0].status as DeploymentStatus,
    vercelProjectId: result[0].vercelProjectId,
    url: result[0].url,
    inspectorUrl: result[0].inspectorUrl,
    createdAt: result[0].createdAt,
    updatedAt: result[0].updatedAt,
  };
}

export async function getDeploymentsForChat(chatId: string): Promise<DeploymentInfo[]> {
  const result = await db
    .select()
    .from(deployments)
    .where(eq(deployments.chatId, chatId))
    .orderBy(desc(deployments.createdAt));

  return result.map((d) => ({
    id: d.id,
    chatId: d.chatId,
    versionId: d.versionId,
    status: d.status as DeploymentStatus,
    vercelProjectId: d.vercelProjectId,
    url: d.url,
    inspectorUrl: d.inspectorUrl,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));
}

export async function getLatestDeployment(chatId: string): Promise<DeploymentInfo | null> {
  const result = await db
    .select()
    .from(deployments)
    .where(eq(deployments.chatId, chatId))
    .orderBy(desc(deployments.createdAt))
    .limit(1);

  if (result.length === 0) return null;

  return {
    id: result[0].id,
    chatId: result[0].chatId,
    versionId: result[0].versionId,
    status: result[0].status as DeploymentStatus,
    vercelProjectId: result[0].vercelProjectId,
    url: result[0].url,
    inspectorUrl: result[0].inspectorUrl,
    createdAt: result[0].createdAt,
    updatedAt: result[0].updatedAt,
  };
}

export async function getVersionForDeployment(versionId: string) {
  const result = await db
    .select()
    .from(versions)
    .where(eq(versions.id, versionId))
    .limit(1);

  return result[0] || null;
}

export async function getChatById(chatId: string) {
  const result = await db
    .select()
    .from(chats)
    .where(eq(chats.id, chatId))
    .limit(1);

  return result[0] || null;
}
