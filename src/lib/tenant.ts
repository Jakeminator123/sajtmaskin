import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { chats, projects } from '@/lib/db/schema';
import { nanoid } from 'nanoid';

/**
 * Standardized v0ProjectId resolution.
 * Priority order:
 * 1. v0 API response projectId (chatData.projectId)
 * 2. Request body projectId (clientProjectId)
 * 3. Fallback to chat-based ID (chat:{v0ChatId})
 */
export function resolveV0ProjectId(params: {
  v0ChatId: string;
  chatDataProjectId?: string | null;
  clientProjectId?: string | null;
}): string {
  const { v0ChatId, chatDataProjectId, clientProjectId } = params;
  return chatDataProjectId || clientProjectId || `chat:${v0ChatId}`;
}

/**
 * Generate a project name based on available IDs
 */
export function generateProjectName(params: {
  v0ChatId: string;
  clientProjectId?: string | null;
}): string {
  const { v0ChatId, clientProjectId } = params;
  return clientProjectId ? `Project ${clientProjectId}` : `Chat ${v0ChatId}`;
}

export function getRequestUserId(req: Request): string | null {
  const userId = req.headers.get('x-user-id');
  const trimmed = userId ? userId.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

export async function getChatByV0ChatIdForRequest(req: Request, v0ChatId: string) {
  const userId = getRequestUserId(req);

  if (!userId) {
    const rows = await db.select().from(chats).where(eq(chats.v0ChatId, v0ChatId)).limit(1);
    return rows[0] ?? null;
  }

  const rows = await db
    .select({ chat: chats, project: projects })
    .from(chats)
    .leftJoin(projects, eq(chats.projectId, projects.id))
    .where(and(eq(chats.v0ChatId, v0ChatId), eq(projects.userId, userId)))
    .limit(1);

  return rows[0]?.chat ?? null;
}

export async function getChatByIdForRequest(req: Request, chatId: string) {
  const userId = getRequestUserId(req);

  if (!userId) {
    const rows = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
    return rows[0] ?? null;
  }

  const rows = await db
    .select({ chat: chats, project: projects })
    .from(chats)
    .leftJoin(projects, eq(chats.projectId, projects.id))
    .where(and(eq(chats.id, chatId), eq(projects.userId, userId)))
    .limit(1);

  return rows[0]?.chat ?? null;
}

export async function ensureProjectForRequest(params: {
  req: Request;
  v0ProjectId: string;
  name?: string | null;
}): Promise<{ id: string; v0ProjectId: string }> {
  const userId = getRequestUserId(params.req);
  const v0ProjectId = params.v0ProjectId.trim();
  if (!v0ProjectId) {
    throw new Error('Missing v0ProjectId');
  }

  const name = params.name ?? null;

  const existing = userId
    ? await db
        .select()
        .from(projects)
        .where(and(eq(projects.v0ProjectId, v0ProjectId), eq(projects.userId, userId)))
        .limit(1)
    : await db.select().from(projects).where(eq(projects.v0ProjectId, v0ProjectId)).limit(1);

  if (existing.length > 0) {
    return { id: existing[0].id, v0ProjectId: existing[0].v0ProjectId };
  }

  if (userId) {
    const unowned = await db
      .select()
      .from(projects)
      .where(and(eq(projects.v0ProjectId, v0ProjectId), isNull(projects.userId)))
      .limit(1);

    if (unowned.length > 0) {
      await db
        .update(projects)
        .set({ userId, ...(name ? { name } : {}) })
        .where(eq(projects.id, unowned[0].id));

      return { id: unowned[0].id, v0ProjectId: unowned[0].v0ProjectId };
    }
  }

  const id = nanoid();

  await db.insert(projects).values({
    id,
    userId: userId ?? null,
    v0ProjectId,
    name: name ?? `Project ${v0ProjectId}`,
  });

  return { id, v0ProjectId };
}
