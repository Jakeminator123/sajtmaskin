import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chats, projects } from "@/lib/db/schema";
import { nanoid } from "nanoid";
import { getCurrentUser, getTokenFromRequest } from "@/lib/auth/auth";
import { getSessionIdFromRequest } from "@/lib/auth/session";
import { getProjectByIdForOwner } from "@/lib/db/services";
import {
  getChat as getEngineChat,
  getVersionById as getEngineVersionById,
  type ChatWithMessages as EngineChatWithMessages,
  type Version as EngineVersion,
} from "@/lib/db/chat-repository-pg";

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

const AUTH_DEBUG_ENABLED = process.env.NODE_ENV !== "production" && process.env.AUTH_DEBUG === "1";

function maskId(value: string): string {
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function logAuthDebug(_event: string, _details: Record<string, unknown>): void {
  if (!AUTH_DEBUG_ENABLED) return;
}

export async function getRequestUserId(
  req: Request,
  options?: { sessionId?: string },
): Promise<string | null> {
  const token = AUTH_DEBUG_ENABLED ? getTokenFromRequest(req) : null;
  try {
    const user = await getCurrentUser(req);
    if (user?.id) {
      if (AUTH_DEBUG_ENABLED) {
        logAuthDebug("auth", { userId: maskId(user.id), hasToken: Boolean(token) });
      }
      return user.id;
    }
  } catch (error) {
    if (AUTH_DEBUG_ENABLED) {
      logAuthDebug("auth-error", {
        message: error instanceof Error ? error.message : "Unknown error",
        hasToken: Boolean(token),
      });
    }
    // ignore auth errors, fall back to headers/session
  }

  if (AUTH_DEBUG_ENABLED && token) {
    logAuthDebug("auth-miss", { reason: "token-present-but-no-user" });
  }

  const sessionId = options?.sessionId ?? getSessionIdFromRequest(req);
  if (sessionId) {
    if (AUTH_DEBUG_ENABLED) {
      logAuthDebug("guest", { sessionId: maskId(sessionId) });
    }
    return `guest:${sessionId}`;
  }

  if (AUTH_DEBUG_ENABLED) {
    logAuthDebug("missing", { hasToken: Boolean(token) });
  }

  return null;
}

export async function getChatByV0ChatIdForRequest(
  req: Request,
  v0ChatId: string,
  options?: { sessionId?: string },
) {
  const userId = await getRequestUserId(req, options);

  if (!userId) {
    const rows = await db
      .select({ chat: chats, project: projects })
      .from(chats)
      .leftJoin(projects, eq(chats.projectId, projects.id))
      .where(and(eq(chats.v0ChatId, v0ChatId), isNull(projects.userId)))
      .limit(1);
    return rows[0]?.chat ?? null;
  }

  // Build ownership conditions: exact userId match + guest session fallback.
  // When a user creates content as a guest and then logs in, the project still
  // has userId='guest:<sessionId>'. We check both so the transition is seamless.
  const ownerConditions = [eq(projects.userId, userId)];
  if (!userId.startsWith("guest:")) {
    const sessionId = options?.sessionId ?? getSessionIdFromRequest(req);
    if (sessionId) {
      ownerConditions.push(eq(projects.userId, `guest:${sessionId}`));
    }
  }

  const rows = await db
    .select({ chat: chats, project: projects })
    .from(chats)
    .leftJoin(projects, eq(chats.projectId, projects.id))
    .where(
      and(
        eq(chats.v0ChatId, v0ChatId),
        ownerConditions.length > 1 ? or(...ownerConditions) : ownerConditions[0],
      ),
    )
    .limit(1);

  return rows[0]?.chat ?? null;
}

export async function getChatByIdForRequest(
  req: Request,
  chatId: string,
  options?: { sessionId?: string },
) {
  const userId = await getRequestUserId(req, options);

  if (!userId) {
    const rows = await db
      .select({ chat: chats, project: projects })
      .from(chats)
      .leftJoin(projects, eq(chats.projectId, projects.id))
      .where(and(eq(chats.id, chatId), isNull(projects.userId)))
      .limit(1);
    return rows[0]?.chat ?? null;
  }

  // Same guest-session fallback as getChatByV0ChatIdForRequest
  const ownerConditions = [eq(projects.userId, userId)];
  if (!userId.startsWith("guest:")) {
    const sessionId = options?.sessionId ?? getSessionIdFromRequest(req);
    if (sessionId) {
      ownerConditions.push(eq(projects.userId, `guest:${sessionId}`));
    }
  }

  const rows = await db
    .select({ chat: chats, project: projects })
    .from(chats)
    .leftJoin(projects, eq(chats.projectId, projects.id))
    .where(
      and(
        eq(chats.id, chatId),
        ownerConditions.length > 1 ? or(...ownerConditions) : ownerConditions[0],
      ),
    )
    .limit(1);

  return rows[0]?.chat ?? null;
}

export async function getProjectByIdForRequest(
  req: Request,
  projectId: string,
  options?: { sessionId?: string },
) {
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId) return null;

  const userId = await getRequestUserId(req, options);
  const projectCondition = or(
    eq(projects.id, normalizedProjectId),
    eq(projects.v0ProjectId, normalizedProjectId),
  );

  if (!userId) {
    const rows = await db
      .select()
      .from(projects)
      .where(and(projectCondition, isNull(projects.userId)))
      .limit(1);
    return rows[0] ?? null;
  }

  const ownerConditions = [eq(projects.userId, userId)];
  if (!userId.startsWith("guest:")) {
    const sessionId = options?.sessionId ?? getSessionIdFromRequest(req);
    if (sessionId) {
      ownerConditions.push(eq(projects.userId, `guest:${sessionId}`));
    }
  }

  const rows = await db
    .select()
    .from(projects)
    .where(
      and(
        projectCondition,
        ownerConditions.length > 1 ? or(...ownerConditions) : ownerConditions[0],
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

type OwnerScope = {
  userId: string | null;
  sessionId: string | null;
};

async function getRequestOwnerScope(
  req: Request,
  options?: { sessionId?: string },
): Promise<OwnerScope> {
  let userId: string | null = null;
  try {
    const user = await getCurrentUser(req);
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }
  const sessionId = options?.sessionId ?? getSessionIdFromRequest(req) ?? null;
  return { userId, sessionId };
}

export async function getAppProjectByIdForRequest(
  req: Request,
  projectId: string,
  options?: { sessionId?: string },
) {
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId) return null;
  const ownerScope = await getRequestOwnerScope(req, options);
  return getProjectByIdForOwner(normalizedProjectId, ownerScope);
}

export async function resolveAppProjectIdForRequest(
  req: Request,
  params: {
    appProjectId?: string | null;
    projectId?: string | null;
  },
  options?: { sessionId?: string },
): Promise<string | null> {
  const explicitAppProjectId = params.appProjectId?.trim();
  if (explicitAppProjectId) {
    const appProject = await getAppProjectByIdForRequest(req, explicitAppProjectId, options);
    return appProject?.id ?? null;
  }

  const fallbackProjectId = params.projectId?.trim();
  if (fallbackProjectId) {
    const project = await getProjectByIdForRequest(req, fallbackProjectId, options);
    return project?.id ?? null;
  }

  return null;
}

export async function getEngineChatByIdForRequest(
  req: Request,
  chatId: string,
  options?: { sessionId?: string },
): Promise<EngineChatWithMessages | null> {
  const normalizedChatId = chatId.trim();
  if (!normalizedChatId) return null;
  const chat = await getEngineChat(normalizedChatId);
  if (!chat) return null;
  const projectId = typeof chat.project_id === "string" ? chat.project_id.trim() : "";
  if (!projectId) return null;
  const project = await getAppProjectByIdForRequest(req, projectId, options);
  if (!project) return null;
  return chat;
}

export async function getEngineVersionByIdForRequest(
  req: Request,
  versionId: string,
  options?: { sessionId?: string },
): Promise<{ chat: EngineChatWithMessages; version: EngineVersion } | null> {
  const normalizedVersionId = versionId.trim();
  if (!normalizedVersionId) return null;
  const version = await getEngineVersionById(normalizedVersionId);
  if (!version) return null;
  const chat = await getEngineChatByIdForRequest(req, version.chat_id, options);
  if (!chat) return null;
  return { chat, version };
}

export async function getEngineVersionForChatByIdForRequest(
  req: Request,
  chatId: string,
  versionId: string,
  options?: { sessionId?: string },
): Promise<{ chat: EngineChatWithMessages; version: EngineVersion } | null> {
  const normalizedChatId = chatId.trim();
  if (!normalizedChatId) return null;
  const scoped = await getEngineVersionByIdForRequest(req, versionId, options);
  if (!scoped) return null;
  if (scoped.version.chat_id !== normalizedChatId) return null;
  return scoped;
}

export async function ensureProjectForRequest(params: {
  req: Request;
  v0ProjectId: string;
  name?: string | null;
  sessionId?: string;
}): Promise<{ id: string; v0ProjectId: string }> {
  const userId = await getRequestUserId(params.req, { sessionId: params.sessionId });
  const v0ProjectId = params.v0ProjectId.trim();
  if (!v0ProjectId) {
    throw new Error("Missing v0ProjectId");
  }

  const name = params.name ?? null;
  const id = nanoid();

  // Use upsert to prevent race condition - atomically insert or update
  const result = await db
    .insert(projects)
    .values({
      id,
      userId: userId ?? null,
      v0ProjectId,
      name: name ?? `Project ${v0ProjectId}`,
    })
    .onConflictDoUpdate({
      target: [projects.userId, projects.v0ProjectId],
      set: {
        // Update name if provided, otherwise keep existing
        ...(name ? { name } : {}),
        updatedAt: new Date(),
      },
    })
    .returning({ id: projects.id, v0ProjectId: projects.v0ProjectId });

  if (result.length > 0) {
    return { id: result[0].id, v0ProjectId: result[0].v0ProjectId };
  }

  // Fallback: fetch existing project if upsert didn't return (shouldn't happen)
  const existing = userId
    ? await db
        .select()
        .from(projects)
        .where(and(eq(projects.v0ProjectId, v0ProjectId), eq(projects.userId, userId)))
        .limit(1)
    : await db
        .select()
        .from(projects)
        .where(and(eq(projects.v0ProjectId, v0ProjectId), isNull(projects.userId)))
        .limit(1);

  if (existing.length > 0) {
    return { id: existing[0].id, v0ProjectId: existing[0].v0ProjectId };
  }

  // This should never happen, but return the generated ID as last resort
  return { id, v0ProjectId };
}
