import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { versions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getChatByV0ChatIdForRequest } from "@/lib/tenant";
import { createVersionErrorLog, createVersionErrorLogs, getVersionErrorLogs } from "@/lib/db/services";

type RouteParams = { params: Promise<{ chatId: string; versionId: string }> };

type ErrorLogPayload = {
  level: "info" | "warning" | "error";
  category?: string | null;
  message: string;
  meta?: Record<string, unknown> | null;
};

async function resolveVersionId(chatId: string, versionId: string) {
  const byInternal = await db
    .select()
    .from(versions)
    .where(and(eq(versions.chatId, chatId), eq(versions.id, versionId)))
    .limit(1);
  if (byInternal.length > 0) return byInternal[0];
  const byV0 = await db
    .select()
    .from(versions)
    .where(and(eq(versions.chatId, chatId), eq(versions.v0VersionId, versionId)))
    .limit(1);
  return byV0[0] ?? null;
}

export async function POST(request: Request, ctx: RouteParams) {
  try {
    const { chatId, versionId } = await ctx.params;
    const chat = await getChatByV0ChatIdForRequest(request, chatId);
    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const version = await resolveVersionId(chat.id, versionId);
    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as
      | { logs?: ErrorLogPayload[] }
      | ErrorLogPayload
      | null;
    if (!body) {
      return NextResponse.json({ error: "Missing payload" }, { status: 400 });
    }

    if ("logs" in body && Array.isArray(body.logs)) {
      const rows = await createVersionErrorLogs(
        body.logs.map((log) => ({
          chatId: chat.id,
          versionId: version.id,
          v0VersionId: version.v0VersionId,
          level: log.level,
          category: log.category || null,
          message: log.message,
          meta: log.meta || null,
        })),
      );
      return NextResponse.json({ success: true, logs: rows });
    }

    const payload = body as ErrorLogPayload;
    const row = await createVersionErrorLog({
      chatId: chat.id,
      versionId: version.id,
      v0VersionId: version.v0VersionId,
      level: payload.level,
      category: payload.category || null,
      message: payload.message,
      meta: payload.meta || null,
    });
    return NextResponse.json({ success: true, log: row });
  } catch (error) {
    console.error("[API] Failed to store version error log:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request, ctx: RouteParams) {
  try {
    const { chatId, versionId } = await ctx.params;
    const chat = await getChatByV0ChatIdForRequest(request, chatId);
    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const version = await resolveVersionId(chat.id, versionId);
    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    const logs = await getVersionErrorLogs(version.id);
    return NextResponse.json({ success: true, logs });
  } catch (error) {
    console.error("[API] Failed to load version error logs:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
