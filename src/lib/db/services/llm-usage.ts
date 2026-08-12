import { and, eq, gt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { llmUsage } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";

/**
 * En rad per LLM-anrop. Skrivs av `recordLlmUsage`
 * (`src/lib/observability/llm-usage.ts`), som är den enda anropsvägen
 * pipeline-koden ska använda — den är best-effort och kastar aldrig.
 *
 * Ligger vid sidan av `engine_generation_logs`/`generation_telemetry`: de
 * beskriver genereringen, den här tabellen beskriver varje enskilt anrop.
 */
export type CreateLlmUsageRecord = {
  phase: string;
  model: string;
  runId?: string | null;
  chatId?: string | null;
  versionId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  workload?: string | null;
  provider?: string | null;
  modelTier?: string | null;
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
  durationMs?: number | null;
  ok?: boolean;
  errorCode?: string | null;
  meta?: Record<string, unknown> | null;
};

export type LlmUsageRow = typeof llmUsage.$inferSelect;

export async function createLlmUsageRecord(record: CreateLlmUsageRecord): Promise<LlmUsageRow> {
  assertDbConfigured();
  const rows = await db
    .insert(llmUsage)
    .values({
      id: nanoid(),
      run_id: record.runId ?? null,
      chat_id: record.chatId ?? null,
      version_id: record.versionId ?? null,
      user_id: record.userId ?? null,
      session_id: record.sessionId ?? null,
      phase: record.phase,
      workload: record.workload ?? null,
      provider: record.provider ?? null,
      model: record.model,
      model_tier: record.modelTier ?? null,
      input_tokens: record.inputTokens ?? null,
      cached_input_tokens: record.cachedInputTokens ?? null,
      output_tokens: record.outputTokens ?? null,
      reasoning_tokens: record.reasoningTokens ?? null,
      duration_ms: record.durationMs ?? null,
      ok: record.ok ?? true,
      error_code: record.errorCode ?? null,
      meta: record.meta ?? null,
    })
    .returning();
  return rows[0];
}

/**
 * Stämpla `chat_id` på sessionens rader som saknar det.
 *
 * På init körs Deep Brief och scaffold-embeddings INNAN chatten existerar, så
 * `chat_id` kan inte sättas vid skrivning. Utan den här claim:en blir de raderna
 * föräldralösa: de syns inte i chat-filtrerad export, och versions-stämplingen
 * nedan (som matchar på `chat_id`) hittar dem aldrig.
 *
 * Nyckeln är `claimKey` — unik per request — vilket gör claim:en exakt även när
 * två init-strömmar delar sessionscookie. Saknas nyckeln (äldre rader) faller den
 * tillbaka på session + tidsfönster, och rader utan `session_id` claimas aldrig.
 *
 * Returnerar antalet uppdaterade rader.
 */
export async function attachChatToUnassignedLlmUsage(
  sessionId: string,
  chatId: string,
  options?: { maxAgeMinutes?: number; claimKey?: string | null },
): Promise<number> {
  assertDbConfigured();
  if (!sessionId) return 0;
  const maxAgeMinutes = Math.min(Math.max(options?.maxAgeMinutes ?? 30, 1), 24 * 60);
  const claimKey = options?.claimKey?.trim() || null;
  const rows = await db
    .update(llmUsage)
    .set({ chat_id: chatId })
    .where(
      and(
        eq(llmUsage.session_id, sessionId),
        sql`${llmUsage.chat_id} IS NULL`,
        gt(llmUsage.created_at, sql`now() - (${String(maxAgeMinutes)} || ' minutes')::interval`),
        ...(claimKey ? [sql`${llmUsage.meta} ->> 'claimKey' = ${claimKey}`] : []),
      ),
    )
    .returning({ id: llmUsage.id });
  return rows.length;
}

/**
 * Stämpla `version_id` på chattens rader som saknar det.
 *
 * Deep Brief, scaffold-embeddings och intent-klassificeraren körs INNAN
 * versionsraden finns, så de kan inte bära `version_id` vid skrivning. Utan den
 * här efterstämplingen faller de utanför körningens summa och kostnaden per
 * körning blir systematiskt underskattad.
 *
 * Två gränser hindrar att en TIDIGARE generations föräldralösa rader knyts till
 * den här versionen och blåser upp dess kostnad:
 *
 * 1. raden måste vara nyare än chattens senast attribuerade rad (allt äldre hör
 *    per definition till en föregående körning), och
 * 2. den måste ligga inom `maxAgeMinutes` (gäller den allra första versionen i en
 *    chat, där ingen tidigare attribuering finns att jämföra med).
 *
 * Returnerar antalet uppdaterade rader.
 */
export async function attachVersionToUnassignedLlmUsage(
  chatId: string,
  versionId: string,
  options?: { maxAgeMinutes?: number },
): Promise<number> {
  assertDbConfigured();
  const maxAgeMinutes = Math.min(Math.max(options?.maxAgeMinutes ?? 30, 1), 24 * 60);
  const rows = await db
    .update(llmUsage)
    .set({ version_id: versionId })
    .where(
      and(
        eq(llmUsage.chat_id, chatId),
        sql`${llmUsage.version_id} IS NULL`,
        gt(llmUsage.created_at, sql`now() - (${String(maxAgeMinutes)} || ' minutes')::interval`),
        sql`${llmUsage.created_at} > COALESCE(
          (
            SELECT MAX(prior.created_at)
            FROM ${llmUsage} AS prior
            WHERE prior.chat_id = ${chatId} AND prior.version_id IS NOT NULL
          ),
          '-infinity'::timestamptz
        )`,
      ),
    )
    .returning({ id: llmUsage.id });
  return rows.length;
}
