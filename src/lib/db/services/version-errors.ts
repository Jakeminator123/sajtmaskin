import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { engineVersionErrorLogs, versionErrorLogs } from "@/lib/db/schema";
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
  const rows = await db
    .insert(engineVersionErrorLogs)
    .values(mapLogPayload(payload, now))
    .returning();
  return rows[0] as VersionErrorLog;
}

export async function createEngineVersionErrorLogs(
  payloads: VersionErrorLogPayload[],
): Promise<VersionErrorLog[]> {
  assertDbConfigured();
  if (payloads.length === 0) return [];
  const now = new Date();
  const rows = await db
    .insert(engineVersionErrorLogs)
    .values(payloads.map((payload) => mapLogPayload(payload, now)))
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
