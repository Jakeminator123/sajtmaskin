import { db } from "../client";
import { engineChats, engineMessages } from "../schema";
import { eq, desc } from "drizzle-orm";
import type { Chat, ChatWithMessages, Message } from "./types";
import { uuid, toRow } from "./internal";

/** `options.id` is the caller-minted primary key (init lock-before-row). Omitted → mint here. */
export async function createChat(
  projectId: string,
  model = "gpt-5.4",
  systemPrompt?: string,
  scaffoldId?: string,
  options?: {
    id?: string;
    /** Transaktion att skriva genom, t.ex. takkontrollen i `project-cap.ts`. */
    database?: Pick<typeof db, "insert" | "select">;
  },
): Promise<Chat> {
  const suppliedId = options?.id?.trim();
  const id = suppliedId || uuid();
  const database = options?.database ?? db;
  await database.insert(engineChats).values({
    id,
    projectId,
    model,
    systemPrompt: systemPrompt ?? null,
    scaffoldId: scaffoldId ?? null,
  });
  const rows = await database.select().from(engineChats).where(eq(engineChats.id, id)).limit(1);
  return toRow(rows[0]) as unknown as Chat;
}

export async function getChatProjectId(id: string): Promise<string | null> {
  const [chat] = await db
    .select({ projectId: engineChats.projectId })
    .from(engineChats)
    .where(eq(engineChats.id, id))
    .limit(1);
  return chat?.projectId ?? null;
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
