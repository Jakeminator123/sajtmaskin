import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { promptLogs } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";
import type { PromptLog } from "./shared";

export async function createPromptLog(payload: {
  event: string;
  userId?: string | null;
  sessionId?: string | null;
  appProjectId?: string | null;
  v0ProjectId?: string | null;
  chatId?: string | null;
  promptOriginal?: string | null;
  promptFormatted?: string | null;
  systemPrompt?: string | null;
  promptAssistModel?: string | null;
  promptAssistDeep?: boolean | null;
  buildIntent?: string | null;
  buildMethod?: string | null;
  modelTier?: string | null;
  imageGenerations?: boolean | null;
  thinking?: boolean | null;
  attachmentsCount?: number | null;
  meta?: Record<string, unknown> | null;
}): Promise<string> {
  assertDbConfigured();
  const retentionLimit = 200;
  const now = new Date();
  const ownerId = payload.userId || payload.sessionId || null;
  const id = nanoid();
  await db.insert(promptLogs).values({
    id,
    event: payload.event,
    user_id: payload.userId || null,
    session_id: payload.sessionId || null,
    app_project_id: payload.appProjectId || null,
    v0_project_id: payload.v0ProjectId || null,
    chat_id: payload.chatId || null,
    prompt_original: payload.promptOriginal?.slice(0, 40_000) || null,
    prompt_formatted: payload.promptFormatted?.slice(0, 40_000) || null,
    system_prompt: payload.systemPrompt?.slice(0, 8_000) || null,
    prompt_assist_model: payload.promptAssistModel || null,
    prompt_assist_deep:
      typeof payload.promptAssistDeep === "boolean" ? payload.promptAssistDeep : null,
    prompt_assist_mode: null,
    build_intent: payload.buildIntent || null,
    build_method: payload.buildMethod || null,
    model_tier: payload.modelTier || null,
    image_generations:
      typeof payload.imageGenerations === "boolean" ? payload.imageGenerations : null,
    thinking: typeof payload.thinking === "boolean" ? payload.thinking : null,
    attachments_count:
      typeof payload.attachmentsCount === "number" ? payload.attachmentsCount : null,
    meta: payload.meta || null,
    created_at: now,
  });

  try {
    if (ownerId) {
      const ownerFilter = payload.userId
        ? sql`user_id = ${payload.userId}`
        : sql`session_id = ${payload.sessionId}`;
      await db.execute(
        sql`DELETE FROM prompt_logs WHERE id IN (
        SELECT id FROM prompt_logs WHERE ${ownerFilter} ORDER BY created_at DESC OFFSET ${retentionLimit}
      )`,
      );
    } else {
      await db.execute(
        sql`DELETE FROM prompt_logs WHERE id IN (
        SELECT id FROM prompt_logs WHERE user_id IS NULL AND session_id IS NULL ORDER BY created_at DESC OFFSET ${retentionLimit}
      )`,
      );
    }
  } catch (error) {
    // INSERT är redan gjord. Retention får inte släcka id:t — då kan inte
    // init claima chat_id på den skrivna raden.
    console.warn("[prompt-log] Retention cleanup failed after insert:", error);
  }

  return id;
}

/**
 * Stämpla `chat_id` på en redan skriven prompt-logg som saknar det.
 *
 * Init skriver `create_chat` innan `engine_chats`-raden finns, så `chat_id`
 * kan inte sättas vid INSERT. Utan den här claim:en blir init-raden
 * föräldralös: `/logg` och `dump-logs --kinds=prompts` filtrerar på chat och
 * hittar bara uppföljningarna.
 *
 * Uppdaterar bara när `chat_id` fortfarande är null, så en senare anropare
 * inte kan skriva över en redan claimad rad.
 */
export async function attachPromptLogChatId(logId: string, chatId: string): Promise<void> {
  assertDbConfigured();
  const id = logId.trim();
  const chat = chatId.trim();
  if (!id || !chat) return;
  await db
    .update(promptLogs)
    .set({ chat_id: chat })
    .where(and(eq(promptLogs.id, id), isNull(promptLogs.chat_id)));
}

/**
 * Get recent prompt logs for a specific user (admin use).
 * When userId is provided, returns only that user's logs.
 * When omitted, returns all logs (admin-only — caller must enforce auth).
 */
export async function getRecentPromptLogs(limit = 20, userId?: string): Promise<PromptLog[]> {
  assertDbConfigured();
  const resolved = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 1000)) : 20;
  if (userId) {
    return db
      .select()
      .from(promptLogs)
      .where(eq(promptLogs.user_id, userId))
      .orderBy(desc(promptLogs.created_at))
      .limit(resolved);
  }
  return db.select().from(promptLogs).orderBy(desc(promptLogs.created_at)).limit(resolved);
}
