import { NextResponse } from "next/server";
import { assertV0Key } from "@/lib/v0";
import { db, dbConfigured } from "@/lib/db/client";
import { versions } from "@/lib/db/schema";
import { eq, desc, and, or } from "drizzle-orm";
import { getChatByV0ChatIdForRequest } from "@/lib/tenant";

export async function GET(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    assertV0Key();

    if (!dbConfigured) {
      return NextResponse.json({ versions: [], warning: "Database not configured." });
    }

    const { chatId } = await ctx.params;

    const dbChat = await getChatByV0ChatIdForRequest(req, chatId);
    if (!dbChat) {
      return NextResponse.json({ versions: [] });
    }

    const dbVersions = await db
      .select({
        id: versions.id,
        v0VersionId: versions.v0VersionId,
        v0MessageId: versions.v0MessageId,
        demoUrl: versions.demoUrl,
        pinned: versions.pinned,
        pinnedAt: versions.pinnedAt,
        createdAt: versions.createdAt,
      })
      .from(versions)
      .where(eq(versions.chatId, dbChat.id))
      .orderBy(desc(versions.pinned), desc(versions.pinnedAt), desc(versions.createdAt));

    const versionsList = dbVersions.map((v) => ({
      versionId: v.v0VersionId,
      id: v.id,
      messageId: v.v0MessageId,
      demoUrl: v.demoUrl,
      pinned: v.pinned,
      pinnedAt: v.pinnedAt,
      createdAt: v.createdAt,
    }));

    return NextResponse.json({ versions: versionsList });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    assertV0Key();

    if (!dbConfigured) {
      return NextResponse.json({ error: "Database not configured." }, { status: 503 });
    }

    const { chatId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const { versionId, pinned } = body ?? {};

    if (!versionId || typeof pinned !== "boolean") {
      return NextResponse.json({ error: "versionId and pinned are required" }, { status: 400 });
    }

    const dbChat = await getChatByV0ChatIdForRequest(req, chatId);
    if (!dbChat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const existing = await db
      .select()
      .from(versions)
      .where(
        and(
          eq(versions.chatId, dbChat.id),
          or(eq(versions.id, versionId), eq(versions.v0VersionId, versionId)),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    const pinnedAt = pinned ? new Date() : null;
    await db.update(versions).set({ pinned, pinnedAt }).where(eq(versions.id, existing[0].id));

    return NextResponse.json({ success: true, pinned, pinnedAt });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
