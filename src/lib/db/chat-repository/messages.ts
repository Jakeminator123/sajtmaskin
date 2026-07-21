import { db } from "../client";
import { engineChats, engineMessages } from "../schema";
import { and, eq, sql } from "drizzle-orm";
import type { Message } from "./types";
import { uuid, toRow } from "./internal";

export async function addMessage(
  chatId: string,
  role: Message["role"],
  content: string,
  tokenCount?: number,
  uiParts?: Record<string, unknown>[] | null,
): Promise<Message> {
  const id = uuid();
  return await db.transaction(async (tx) => {
    await tx.insert(engineMessages).values({
      id,
      chatId,
      role,
      content,
      uiParts: Array.isArray(uiParts) ? uiParts : null,
      tokenCount: tokenCount ?? null,
    });
    await tx
      .update(engineChats)
      .set({ updatedAt: new Date() })
      .where(eq(engineChats.id, chatId));
    const rows = await tx
      .select()
      .from(engineMessages)
      .where(eq(engineMessages.id, id))
      .limit(1);
    return toRow(rows[0]) as unknown as Message;
  });
}

/**
 * Atomic consumption of the F3-continuation marker (Bugbot MEDIUM, PR #382).
 *
 * The follow-up route reads the pending marker from a request-start snapshot
 * of `engine_messages`; without an arbiter two rapid replies would BOTH see
 * it pending and both inherit `lifecycleStage: "integrations"`. This
 * conditional jsonb UPDATE is the arbiter (same pattern as the repository's
 * other jsonb-conditional writes): it flags the marker part with
 * `f3ContinuationConsumed: true` ONLY while the row still contains an
 * unconsumed marker. Under READ COMMITTED the second concurrent UPDATE
 * blocks on the row lock, re-evaluates the WHERE against the committed row,
 * sees the consumed flag and reports 0 rows — exactly one caller ever gets
 * `true`. Callers MUST treat anything but a confirmed `true` (including
 * thrown errors) as "do not inherit F3" (fail-safe F2).
 *
 * Marker contract lives in `src/lib/gen/stream/f3-continuation.ts`
 * (`F3_CONTINUATION_FLAG_KEY` / `F3_CONTINUATION_CONSUMED_KEY`).
 */
export async function consumeF3ContinuationMarker(
  chatId: string,
  messageId: string,
): Promise<boolean> {
  const markerContainment = JSON.stringify([{ output: { f3Continuation: true } }]);
  const consumedContainment = JSON.stringify([
    { output: { f3ContinuationConsumed: true } },
  ]);
  const result = await db
    .update(engineMessages)
    .set({
      uiParts: sql<Record<string, unknown>[]>`(
        SELECT jsonb_agg(
          CASE
            WHEN part -> 'output' -> 'f3Continuation' = 'true'::jsonb
              THEN jsonb_set(part, '{output,f3ContinuationConsumed}'::text[], 'true'::jsonb, true)
            ELSE part
          END
        )
        FROM jsonb_array_elements(${engineMessages.uiParts}) AS part
      )`,
    })
    .where(
      and(
        eq(engineMessages.id, messageId),
        eq(engineMessages.chatId, chatId),
        sql`${engineMessages.uiParts} @> ${markerContainment}::jsonb`,
        sql`NOT (${engineMessages.uiParts} @> ${consumedContainment}::jsonb)`,
      ),
    );
  return (result.rowCount ?? 0) > 0;
}
