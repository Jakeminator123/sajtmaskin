import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { versionErrorLogs } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";
import type { VersionErrorLog } from "./shared";

export async function createVersionErrorLog(payload: {
  chatId: string;
  versionId: string;
  v0VersionId?: string | null;
  level: "info" | "warning" | "error";
  category?: string | null;
  message: string;
  meta?: Record<string, unknown> | null;
}): Promise<VersionErrorLog> {
  assertDbConfigured();
  const now = new Date();
  const rows = await db
    .insert(versionErrorLogs)
    .values({
      id: nanoid(),
      chat_id: payload.chatId,
      version_id: payload.versionId,
      v0_version_id: payload.v0VersionId || null,
      level: payload.level,
      category: payload.category || null,
      message: payload.message,
      meta: payload.meta || null,
      created_at: now,
    })
    .returning();
  return rows[0];
}

export async function createVersionErrorLogs(
  payloads: Array<{
    chatId: string;
    versionId: string;
    v0VersionId?: string | null;
    level: "info" | "warning" | "error";
    category?: string | null;
    message: string;
    meta?: Record<string, unknown> | null;
  }>,
): Promise<VersionErrorLog[]> {
  assertDbConfigured();
  if (payloads.length === 0) return [];
  const now = new Date();
  const rows = await db
    .insert(versionErrorLogs)
    .values(
      payloads.map((payload) => ({
        id: nanoid(),
        chat_id: payload.chatId,
        version_id: payload.versionId,
        v0_version_id: payload.v0VersionId || null,
        level: payload.level,
        category: payload.category || null,
        message: payload.message,
        meta: payload.meta || null,
        created_at: now,
      })),
    )
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
