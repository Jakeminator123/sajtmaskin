import { desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { getScaffoldById } from "@/lib/gen/scaffolds";
import { engineChats, engineVersionErrorLogs, versionErrorLogs } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";
import type { VersionErrorLog } from "./shared";

type VersionErrorLogPayload = {
  chatId: string;
  versionId: string;
  v0VersionId?: string | null;
  level: "info" | "warning" | "error";
  category?: string | null;
  message: string;
  meta?: Record<string, unknown> | null;
};

type EngineScaffoldContext = {
  scaffoldId: string;
  scaffoldFamily: string | null;
  scaffoldLabel: string | null;
  persistedOn: "engine_chat";
};

function mapLogPayload(payload: VersionErrorLogPayload, now: Date) {
  return {
    id: nanoid(),
    chat_id: payload.chatId,
    version_id: payload.versionId,
    v0_version_id: payload.v0VersionId || null,
    level: payload.level,
    category: payload.category || null,
    message: payload.message,
    meta: payload.meta || null,
    created_at: now,
  };
}

function buildEngineScaffoldContext(scaffoldId: string | null): EngineScaffoldContext | null {
  if (!scaffoldId) return null;
  const manifest = getScaffoldById(scaffoldId);
  return {
    scaffoldId,
    scaffoldFamily: manifest?.family ?? null,
    scaffoldLabel: manifest?.label ?? null,
    persistedOn: "engine_chat",
  };
}

function mergeScaffoldContext(
  meta: Record<string, unknown> | null | undefined,
  scaffoldContext: EngineScaffoldContext | null,
) {
  const base =
    meta && typeof meta === "object"
      ? { ...meta }
      : {};
  if (!scaffoldContext) {
    return Object.keys(base).length > 0 ? base : null;
  }

  const existing =
    base.scaffoldContext && typeof base.scaffoldContext === "object"
      ? (base.scaffoldContext as Record<string, unknown>)
      : {};

  return {
    ...base,
    scaffoldContext: {
      ...existing,
      ...scaffoldContext,
    },
  };
}

async function enrichEnginePayloads(
  payloads: VersionErrorLogPayload[],
): Promise<VersionErrorLogPayload[]> {
  const chatIds = Array.from(new Set(payloads.map((payload) => payload.chatId).filter(Boolean)));
  if (chatIds.length === 0) return payloads;

  const rows = await db
    .select({
      id: engineChats.id,
      scaffoldId: engineChats.scaffoldId,
    })
    .from(engineChats)
    .where(inArray(engineChats.id, chatIds));

  const byChatId = new Map(
    rows.map((row) => [row.id, buildEngineScaffoldContext(row.scaffoldId ?? null)]),
  );

  return payloads.map((payload) => ({
    ...payload,
    meta: mergeScaffoldContext(payload.meta, byChatId.get(payload.chatId) ?? null),
  }));
}

export async function createVersionErrorLog(payload: VersionErrorLogPayload): Promise<VersionErrorLog> {
  assertDbConfigured();
  const now = new Date();
  const rows = await db
    .insert(versionErrorLogs)
    .values(mapLogPayload(payload, now))
    .returning();
  return rows[0];
}

export async function createVersionErrorLogs(
  payloads: VersionErrorLogPayload[],
): Promise<VersionErrorLog[]> {
  assertDbConfigured();
  if (payloads.length === 0) return [];
  const now = new Date();
  const rows = await db
    .insert(versionErrorLogs)
    .values(payloads.map((payload) => mapLogPayload(payload, now)))
    .returning();
  return rows;
}

export async function getVersionErrorLogs(versionId: string): Promise<VersionErrorLog[]> {
  assertDbConfigured();
  return db
    .select()
    .from(versionErrorLogs)
    .where(eq(versionErrorLogs.version_id, versionId))
    .orderBy(desc(versionErrorLogs.created_at));
}

export async function createEngineVersionErrorLog(
  payload: VersionErrorLogPayload,
): Promise<VersionErrorLog> {
  assertDbConfigured();
  const now = new Date();
  const [enrichedPayload] = await enrichEnginePayloads([payload]);
  const rows = await db
    .insert(engineVersionErrorLogs)
    .values(mapLogPayload(enrichedPayload, now))
    .returning();
  return rows[0] as VersionErrorLog;
}

export async function createEngineVersionErrorLogs(
  payloads: VersionErrorLogPayload[],
): Promise<VersionErrorLog[]> {
  assertDbConfigured();
  if (payloads.length === 0) return [];
  const now = new Date();
  const enrichedPayloads = await enrichEnginePayloads(payloads);
  const rows = await db
    .insert(engineVersionErrorLogs)
    .values(enrichedPayloads.map((payload) => mapLogPayload(payload, now)))
    .returning();
  return rows as VersionErrorLog[];
}

export async function getEngineVersionErrorLogs(versionId: string): Promise<VersionErrorLog[]> {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(engineVersionErrorLogs)
    .where(eq(engineVersionErrorLogs.version_id, versionId))
    .orderBy(desc(engineVersionErrorLogs.created_at));
  return rows as VersionErrorLog[];
}
