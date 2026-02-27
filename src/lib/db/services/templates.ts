import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { templateCache } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";

export async function getCachedTemplate(templateId: string, userId?: string | null) {
  assertDbConfigured();
  const now = new Date();
  const rows = userId
    ? await db
        .select()
        .from(templateCache)
        .where(
          and(
            eq(templateCache.template_id, templateId),
            eq(templateCache.user_id, userId),
            gt(templateCache.expires_at, now),
          ),
        )
        .orderBy(desc(templateCache.created_at))
        .limit(1)
    : await db
        .select()
        .from(templateCache)
        .where(
          and(
            eq(templateCache.template_id, templateId),
            isNull(templateCache.user_id),
            gt(templateCache.expires_at, now),
          ),
        )
        .orderBy(desc(templateCache.created_at))
        .limit(1);
  return rows[0] ?? null;
}

export async function cacheTemplateResult(
  templateId: string,
  payload: {
    chatId: string;
    demoUrl?: string | null;
    versionId?: string | null;
    files?: unknown[] | null;
    code?: string | null;
    model?: string | null;
  },
  userId?: string | null,
): Promise<void> {
  assertDbConfigured();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const filesJson = payload.files ? JSON.stringify(payload.files) : null;

  await db
    .insert(templateCache)
    .values({
      template_id: templateId,
      user_id: userId || null,
      chat_id: payload.chatId,
      demo_url: payload.demoUrl || null,
      version_id: payload.versionId || null,
      code: payload.code || null,
      files_json: filesJson,
      model: payload.model || null,
      created_at: now,
      expires_at: expiresAt,
    })
    .onConflictDoUpdate({
      target: [templateCache.template_id, templateCache.user_id],
      set: {
        chat_id: payload.chatId,
        demo_url: payload.demoUrl || null,
        version_id: payload.versionId || null,
        code: payload.code || null,
        files_json: filesJson,
        model: payload.model || null,
        created_at: now,
        expires_at: expiresAt,
      },
    });
}
