import { desc, eq } from "drizzle-orm";
import { db, dbConfigured } from "@/lib/db/client";
import { agentMessages } from "@/lib/db/schema";
import type { AgentMessageKind } from "@/lib/openclaw/agent-message-kind";

/**
 * Sajtagentens beständiga historik per builderchatt (`agent_messages`).
 * Fail-soft som `live-review-grants.ts`: ett DB-fel (eller en ännu inte
 * applicerad tabell) loggas och ger tomt/false — chatten fortsätter utan
 * beständighet.
 */

export interface AgentMessageRow {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  kind: AgentMessageKind;
  content: string;
  meta: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AgentMessageInsert {
  id: string;
  role: "user" | "assistant";
  kind: AgentMessageKind;
  content: string;
  meta: Record<string, unknown> | null;
  /** Klientens skapelsetid (ms). Saknas → DB-default NOW(). */
  createdAt?: Date | null;
}

export const AGENT_MESSAGES_DEFAULT_LIMIT = 200;

function toKind(value: unknown): AgentMessageKind {
  return value === "internal" ? "internal" : "chat";
}

export async function listAgentMessages(
  chatId: string,
  limit = AGENT_MESSAGES_DEFAULT_LIMIT,
): Promise<AgentMessageRow[]> {
  const id = chatId.trim();
  if (!id || !dbConfigured) return [];
  try {
    // De NYASTE `limit` raderna, returnerade i kronologisk ordning: en lång
    // chatt får sin senaste historik, inte sina första 200 rader.
    const rows = await db
      .select()
      .from(agentMessages)
      .where(eq(agentMessages.chatId, id))
      .orderBy(desc(agentMessages.createdAt), desc(agentMessages.id))
      .limit(limit);
    rows.reverse();
    return rows
      .filter((row) => row.role === "user" || row.role === "assistant")
      .map((row) => ({
        id: row.id,
        chatId: row.chatId,
        role: row.role as "user" | "assistant",
        kind: toKind(row.kind),
        content: row.content,
        meta: row.meta ?? null,
        createdAt: row.createdAt,
      }));
  } catch (error) {
    console.warn(
      "[agent-messages] read failed:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/** Idempotent på id: en omsändning av samma tur skapar ingen dubblett. */
export async function appendAgentMessages(
  chatId: string,
  rows: readonly AgentMessageInsert[],
): Promise<boolean> {
  const id = chatId.trim();
  if (!id || !dbConfigured || rows.length === 0) return false;
  try {
    await db
      .insert(agentMessages)
      .values(
        rows.map((row) => ({
          id: row.id,
          chatId: id,
          role: row.role,
          kind: row.kind,
          content: row.content,
          meta: row.meta,
          ...(row.createdAt ? { createdAt: row.createdAt } : {}),
        })),
      )
      .onConflictDoNothing({ target: agentMessages.id });
    return true;
  } catch (error) {
    console.warn(
      "[agent-messages] write failed:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
