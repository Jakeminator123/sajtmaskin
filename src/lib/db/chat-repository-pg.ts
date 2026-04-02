/**
 * Postgres-based engine chat repository (Drizzle).
 *
 * This is the canonical own-engine chat store.
 * The exported API remains stable for stream routes and builder flows.
 */
import { db } from "./client";
import {
  type EngineVersionReleaseState,
  type EngineVersionVerificationState,
  selectPreferredEngineVersion,
} from "./engine-version-lifecycle";
import {
  engineChats,
  engineMessages,
  engineVersions,
  engineGenerationLogs,
} from "./schema";
import { eq, desc, sql } from "drizzle-orm";

export interface Chat {
  id: string;
  project_id: string;
  title: string | null;
  model: string;
  system_prompt: string | null;
  scaffold_id: string | null;
  orchestration_snapshot?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  chat_id: string;
  role: "system" | "user" | "assistant" | "thinking";
  content: string;
  ui_parts?: Record<string, unknown>[] | null;
  token_count: number | null;
  created_at: string;
}

export interface Version {
  id: string;
  chat_id: string;
  message_id: string | null;
  version_number: number;
  files_json: string;
  sandbox_url: string | null;
  release_state: EngineVersionReleaseState;
  verification_state: EngineVersionVerificationState;
  verification_summary: string | null;
  promoted_at: string | null;
  created_at: string;
}

export interface GenerationLog {
  id: string;
  chat_id: string;
  model: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  duration_ms: number | null;
  success: number;
  error_message: string | null;
  created_at: string;
}

export interface ChatWithMessages extends Chat {
  messages: Message[];
}

function uuid(): string {
  return crypto.randomUUID();
}

function toRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    const snakeKey = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    out[snakeKey] = val instanceof Date ? val.toISOString() : val;
  }
  return out;
}

export async function createChat(
  projectId: string,
  model = "gpt-5.4",
  systemPrompt?: string,
  scaffoldId?: string,
): Promise<Chat> {
  const id = uuid();
  await db.insert(engineChats).values({
    id,
    projectId,
    model,
    systemPrompt: systemPrompt ?? null,
    scaffoldId: scaffoldId ?? null,
  });
  const rows = await db.select().from(engineChats).where(eq(engineChats.id, id)).limit(1);
  return toRow(rows[0]) as unknown as Chat;
}

export async function getChat(id: string): Promise<ChatWithMessages | null> {
  const chatRows = await db.select().from(engineChats).where(eq(engineChats.id, id)).limit(1);
  if (chatRows.length === 0) return null;
  const chat = toRow(chatRows[0]) as unknown as Chat;
  const msgRows = await db
    .select()
    .from(engineMessages)
    .where(eq(engineMessages.chatId, id))
    .orderBy(engineMessages.createdAt);
  const messages = msgRows.map((r) => toRow(r) as unknown as Message);
  return { ...chat, messages };
}

export async function addMessage(
  chatId: string,
  role: Message["role"],
  content: string,
  tokenCount?: number,
  uiParts?: Record<string, unknown>[] | null,
): Promise<Message> {
  const id = uuid();
  await db.insert(engineMessages).values({
    id,
    chatId,
    role,
    content,
    uiParts: Array.isArray(uiParts) ? uiParts : null,
    tokenCount: tokenCount ?? null,
  });
  await db
    .update(engineChats)
    .set({ updatedAt: new Date() })
    .where(eq(engineChats.id, chatId));
  const rows = await db.select().from(engineMessages).where(eq(engineMessages.id, id)).limit(1);
  return toRow(rows[0]) as unknown as Message;
}

async function loadVersionById(
  executor: Pick<typeof db, "select">,
  versionId: string,
): Promise<Version> {
  const rows = await executor
    .select()
    .from(engineVersions)
    .where(eq(engineVersions.id, versionId))
    .limit(1);
  return toRow(rows[0]) as unknown as Version;
}

async function getStoredVersion(versionId: string): Promise<Version> {
  return loadVersionById(db, versionId);
}

async function insertDraftVersionRow(
  executor: typeof db,
  params: {
    chatId: string;
    messageId: string | null;
    filesJson: string;
    sandboxUrl?: string;
  },
): Promise<Version> {
  const id = uuid();
  const latest = await executor
    .select({ maxVer: sql<number>`COALESCE(MAX(${engineVersions.versionNumber}), 0)` })
    .from(engineVersions)
    .where(eq(engineVersions.chatId, params.chatId));
  const versionNumber = (latest[0]?.maxVer ?? 0) + 1;

  await executor.insert(engineVersions).values({
    id,
    chatId: params.chatId,
    messageId: params.messageId,
    versionNumber,
    filesJson: params.filesJson,
    sandboxUrl: params.sandboxUrl ?? null,
    releaseState: "draft",
    verificationState: "pending",
    verificationSummary: null,
    promotedAt: null,
  });
  return loadVersionById(executor, id);
}

/**
 * Inserts the assistant row and draft version in a single DB transaction.
 * If the version insert fails, the message row is rolled back (no orphan assistant).
 */
export async function addAssistantMessageAndCreateDraftVersion(
  chatId: string,
  content: string,
  filesJson: string,
  options: {
    tokenCount?: number;
    uiParts?: Record<string, unknown>[] | null;
    sandboxUrl?: string;
  } = {},
): Promise<{ message: Message; version: Version }> {
  const { tokenCount, uiParts, sandboxUrl } = options;
  return db.transaction(async (tx) => {
    const messageId = uuid();
    await tx.insert(engineMessages).values({
      id: messageId,
      chatId,
      role: "assistant",
      content,
      uiParts: Array.isArray(uiParts) ? uiParts : null,
      tokenCount: tokenCount ?? null,
    });
    await tx
      .update(engineChats)
      .set({ updatedAt: new Date() })
      .where(eq(engineChats.id, chatId));

    // Drizzle `tx` is a transaction-scoped client with the same insert/select surface as `db`.
    const version = await insertDraftVersionRow(tx as unknown as typeof db, {
      chatId,
      messageId,
      filesJson,
      sandboxUrl,
    });

    const msgRows = await tx.select().from(engineMessages).where(eq(engineMessages.id, messageId)).limit(1);
    return {
      message: toRow(msgRows[0]) as unknown as Message,
      version,
    };
  });
}

export async function createDraftVersion(
  chatId: string,
  messageId: string | null,
  filesJson: string,
  sandboxUrl?: string,
): Promise<Version> {
  return insertDraftVersionRow(db, { chatId, messageId, filesJson, sandboxUrl });
}

export async function getLatestVersion(chatId: string): Promise<Version | null> {
  const rows = await db
    .select()
    .from(engineVersions)
    .where(eq(engineVersions.chatId, chatId))
    .orderBy(desc(engineVersions.versionNumber))
    .limit(1);
  return rows.length > 0 ? (toRow(rows[0]) as unknown as Version) : null;
}

export async function getPreferredVersion(chatId: string): Promise<Version | null> {
  const versions = await getVersionsByChat(chatId);
  return selectPreferredEngineVersion(versions) ?? null;
}

export async function listChatsByProject(projectId: string): Promise<Chat[]> {
  const rows = await db
    .select()
    .from(engineChats)
    .where(eq(engineChats.projectId, projectId))
    .orderBy(desc(engineChats.updatedAt));
  return rows.map((r) => toRow(r) as unknown as Chat);
}

export async function updateChatProjectId(chatId: string, projectId: string): Promise<boolean> {
  const result = await db
    .update(engineChats)
    .set({ projectId, updatedAt: new Date() })
    .where(eq(engineChats.id, chatId));
  return (result.rowCount ?? 0) > 0;
}

export async function updateChatScaffoldId(chatId: string, scaffoldId: string | null): Promise<boolean> {
  const result = await db
    .update(engineChats)
    .set({ scaffoldId, updatedAt: new Date() })
    .where(eq(engineChats.id, chatId));
  return (result.rowCount ?? 0) > 0;
}

export async function getChatOrchestrationSnapshot(
  chatId: string,
): Promise<Record<string, unknown> | null> {
  const rows = await db
    .select({ orchestrationSnapshot: engineChats.orchestrationSnapshot })
    .from(engineChats)
    .where(eq(engineChats.id, chatId))
    .limit(1);
  if (rows.length === 0) return null;
  const v = rows[0].orchestrationSnapshot;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export async function updateChatOrchestrationSnapshot(
  chatId: string,
  snapshot: Record<string, unknown> | null,
): Promise<boolean> {
  const result = await db
    .update(engineChats)
    .set({ orchestrationSnapshot: snapshot, updatedAt: new Date() })
    .where(eq(engineChats.id, chatId));
  return (result.rowCount ?? 0) > 0;
}

export async function getVersionsByChat(chatId: string): Promise<Version[]> {
  const rows = await db
    .select()
    .from(engineVersions)
    .where(eq(engineVersions.chatId, chatId))
    .orderBy(desc(engineVersions.versionNumber));
  return rows.map((r) => toRow(r) as unknown as Version);
}

export async function getVersionById(versionId: string): Promise<Version | null> {
  const rows = await db
    .select()
    .from(engineVersions)
    .where(eq(engineVersions.id, versionId))
    .limit(1);
  return rows.length > 0 ? (toRow(rows[0]) as unknown as Version) : null;
}

export async function updateVersionFiles(versionId: string, filesJson: string): Promise<boolean> {
  const result = await db
    .update(engineVersions)
    .set({ filesJson })
    .where(eq(engineVersions.id, versionId));
  return (result.rowCount ?? 0) > 0;
}

export async function updateVersionSandboxUrl(
  versionId: string,
  sandboxUrl: string | null,
): Promise<boolean> {
  const result = await db
    .update(engineVersions)
    .set({ sandboxUrl })
    .where(eq(engineVersions.id, versionId));
  return (result.rowCount ?? 0) > 0;
}

export async function markVersionVerifying(
  versionId: string,
  verificationSummary: string | null = "Automatic verification in progress.",
): Promise<Version | null> {
  const result = await db
    .update(engineVersions)
    .set({
      releaseState: "draft",
      verificationState: "verifying",
      verificationSummary,
      promotedAt: null,
    })
    .where(eq(engineVersions.id, versionId));
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  return getStoredVersion(versionId);
}

export async function markVersionRepairing(
  versionId: string,
  verificationSummary: string | null = "Server-side repair in progress.",
): Promise<Version | null> {
  const result = await db
    .update(engineVersions)
    .set({
      releaseState: "draft",
      verificationState: "repairing",
      verificationSummary,
      promotedAt: null,
    })
    .where(eq(engineVersions.id, versionId));
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  return getStoredVersion(versionId);
}

export async function promoteVersion(
  versionId: string,
  verificationSummary: string | null = "Automatic verification passed.",
): Promise<Version | null> {
  const promotedAt = new Date();
  const result = await db
    .update(engineVersions)
    .set({
      releaseState: "promoted",
      verificationState: "passed",
      verificationSummary,
      promotedAt,
    })
    .where(eq(engineVersions.id, versionId));
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  return getStoredVersion(versionId);
}

export async function failVersionVerification(
  versionId: string,
  verificationSummary: string | null = "Automatic verification failed.",
): Promise<Version | null> {
  const result = await db
    .update(engineVersions)
    .set({
      releaseState: "draft",
      verificationState: "failed",
      verificationSummary,
      promotedAt: null,
    })
    .where(eq(engineVersions.id, versionId));
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  return getStoredVersion(versionId);
}

export async function logGeneration(
  chatId: string,
  model: string,
  tokens: { prompt?: number; completion?: number },
  durationMs: number,
  success: boolean,
  error?: string,
): Promise<GenerationLog> {
  const id = uuid();
  await db.insert(engineGenerationLogs).values({
    id,
    chatId,
    model,
    promptTokens: tokens.prompt ?? null,
    completionTokens: tokens.completion ?? null,
    durationMs,
    success,
    errorMessage: error ?? null,
  });
  const rows = await db
    .select()
    .from(engineGenerationLogs)
    .where(eq(engineGenerationLogs.id, id))
    .limit(1);
  return toRow(rows[0]) as unknown as GenerationLog;
}

