"use client";

/**
 * Beständig historik för Sajtagenten i buildern (`agent_messages`).
 *
 * Builderns egen historik (`engine_messages`) läses av byggmotorn, så
 * agentens samtal lagras separat och hydreras in i `openclaw-store` när en
 * chatt öppnas. Fail-soft hela vägen: saknas tabellen eller svarar API:t
 * fel fortsätter chatten utan beständighet (tabellen appliceras på eget
 * DB-mandat).
 */

import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { useOpenClawStore, type OpenClawMessage } from "@/lib/openclaw/openclaw-store";
import type { AgentMessageKind } from "@/lib/openclaw/agent-message-kind";

export interface PersistedAgentMessage {
  id: string;
  role: "user" | "assistant";
  kind: AgentMessageKind;
  content: string;
  createdAt: string;
  meta: {
    anchorBuilderMessageId?: string | null;
    anchorBuilderMessageIndex?: number | null;
    builderTarget?: { chatId: string; versionId: string } | null;
  } | null;
}

export function agentMessagesUrl(chatId: string): string {
  return `${engineChatBaseUrl(chatId)}/agent-messages`;
}

/** Rader som redan kvitterats (eller kommit från servern) — skickas aldrig om. */
const persistedIds = new Set<string>();

/** Speglar routens gränser (`agent-messages/route.ts`): rader per POST och tecken per rad. */
export const AGENT_MESSAGES_MAX_PER_POST = 20;
export const AGENT_MESSAGE_MAX_CONTENT_CHARS = 20_000;

function clampContent(content: string): string {
  return content.length > AGENT_MESSAGE_MAX_CONTENT_CHARS
    ? `${content.slice(0, AGENT_MESSAGE_MAX_CONTENT_CHARS - 1)}…`
    : content;
}

export function toStoreMessage(row: PersistedAgentMessage): OpenClawMessage {
  const createdAt = Date.parse(row.createdAt);
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    timestamp: Number.isFinite(createdAt) ? createdAt : 0,
    kind: row.kind,
    anchorBuilderMessageId: row.meta?.anchorBuilderMessageId ?? undefined,
    anchorBuilderMessageIndex:
      typeof row.meta?.anchorBuilderMessageIndex === "number"
        ? row.meta.anchorBuilderMessageIndex
        : undefined,
    builderTarget: row.meta?.builderTarget ?? null,
    hydrated: true,
  };
}

export function toPersistedPayload(message: OpenClawMessage): Omit<PersistedAgentMessage, "createdAt"> & {
  timestamp: number;
} {
  return {
    id: message.id,
    role: message.role,
    kind: message.kind ?? "chat",
    content: clampContent(message.content),
    timestamp: message.timestamp,
    meta: {
      anchorBuilderMessageId: message.anchorBuilderMessageId ?? null,
      anchorBuilderMessageIndex: message.anchorBuilderMessageIndex ?? null,
      builderTarget: message.builderTarget ?? null,
    },
  };
}

function isPersistedAgentMessage(value: unknown): value is PersistedAgentMessage {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    (row.role === "user" || row.role === "assistant") &&
    (row.kind === "chat" || row.kind === "internal") &&
    typeof row.content === "string" &&
    typeof row.createdAt === "string"
  );
}

/**
 * Läs historiken för `chatId` och fyll på storen — bara om samma chatt
 * fortfarande är öppen när svaret kommer.
 */
export async function hydrateAgentHistory(
  chatId: string,
  isStillCurrent: () => boolean,
): Promise<number> {
  try {
    const res = await fetch(agentMessagesUrl(chatId));
    if (!res.ok) return 0;
    const data = (await res.json().catch(() => null)) as { messages?: unknown } | null;
    if (!data || !Array.isArray(data.messages)) return 0;
    if (!isStillCurrent()) return 0;
    const rows = data.messages.filter(isPersistedAgentMessage);
    for (const row of rows) persistedIds.add(row.id);
    const messages = rows.map(toStoreMessage);
    useOpenClawStore.getState().hydrateMessages(messages);
    return messages.length;
  } catch {
    return 0;
  }
}

/**
 * Skriv ner allt i storen som ännu inte kvitterats. Anroparen lämnar hela
 * listan (inte bara senaste turen), så rader som släpptes efter ett misslyckat
 * försök följer med automatiskt nästa gång. Tomma platshållare, hydrerade
 * rader och redan kvitterade id:n hoppas över; större mängder delas upp i
 * routens batchstorlek. `true` bara när allt nytt faktiskt kvitterats.
 */
export async function persistAgentMessages(
  chatId: string,
  messages: readonly OpenClawMessage[],
): Promise<boolean> {
  const fresh = messages.filter(
    (message) =>
      !message.hydrated && !persistedIds.has(message.id) && message.content.trim().length > 0,
  );
  if (fresh.length === 0) return false;
  for (const message of fresh) persistedIds.add(message.id);
  let allPersisted = true;
  for (let start = 0; start < fresh.length; start += AGENT_MESSAGES_MAX_PER_POST) {
    const batch = fresh.slice(start, start + AGENT_MESSAGES_MAX_PER_POST);
    if (!(await postBatch(chatId, batch))) {
      // Routen är fail-soft: ett DB-fel ger 200 med `persisted: false`. Bara ett
      // uttryckligt `persisted: true` är ett kvitto — annars släpps raderna så
      // nästa anrop (nästa avslutade tur) skickar dem igen.
      for (const message of batch) persistedIds.delete(message.id);
      allPersisted = false;
    }
  }
  return allPersisted;
}

async function postBatch(chatId: string, batch: readonly OpenClawMessage[]): Promise<boolean> {
  try {
    const res = await fetch(agentMessagesUrl(chatId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: batch.map(toPersistedPayload) }),
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as { persisted?: unknown } | null;
    return data?.persisted === true;
  } catch {
    return false;
  }
}

export function resetAgentHistoryForTests(): void {
  persistedIds.clear();
}
