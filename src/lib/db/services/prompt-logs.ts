import { desc, sql } from "drizzle-orm";
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
  promptAssistMode?: string | null;
  buildIntent?: string | null;
  buildMethod?: string | null;
  modelTier?: string | null;
  imageGenerations?: boolean | null;
  thinking?: boolean | null;
  attachmentsCount?: number | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  assertDbConfigured();
  const retentionLimit = 20;
  const now = new Date();
  await db.insert(promptLogs).values({
    id: nanoid(),
    event: payload.event,
    user_id: payload.userId || null,
    session_id: payload.sessionId || null,
    app_project_id: payload.appProjectId || null,
    v0_project_id: payload.v0ProjectId || null,
    chat_id: payload.chatId || null,
    prompt_original: payload.promptOriginal || null,
    prompt_formatted: payload.promptFormatted || null,
    system_prompt: payload.systemPrompt || null,
    prompt_assist_model: payload.promptAssistModel || null,
    prompt_assist_deep:
      typeof payload.promptAssistDeep === "boolean" ? payload.promptAssistDeep : null,
    prompt_assist_mode: payload.promptAssistMode || null,
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
  await db.execute(
    sql`DELETE FROM prompt_logs WHERE id IN (
      SELECT id FROM prompt_logs ORDER BY created_at DESC OFFSET ${retentionLimit}
    )`,
  );
}

export async function getRecentPromptLogs(limit = 20): Promise<PromptLog[]> {
  assertDbConfigured();
  const resolved = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 20;
  return db.select().from(promptLogs).orderBy(desc(promptLogs.created_at)).limit(resolved);
}
