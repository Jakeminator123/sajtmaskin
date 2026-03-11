import { NextResponse } from "next/server";
import { assertV0Key, v0 } from "@/lib/v0";
import { db, dbConfigured } from "@/lib/db/client";
import { versions } from "@/lib/db/schema";
import { eq, desc, and, or } from "drizzle-orm";
import { getChatByV0ChatIdForRequest } from "@/lib/tenant";
import { shouldUseV0Fallback } from "@/lib/gen/fallback";
import { getVersionsByChat } from "@/lib/db/chat-repository-pg";
import { buildPreviewUrl } from "@/lib/gen/preview";

type V0LatestVersionLike = {
  id?: string | null;
  versionId?: string | null;
  demoUrl?: string | null;
  demo_url?: string | null;
  messageId?: string | null;
};

type V0ChatLike = {
  latestVersion?: V0LatestVersionLike | null;
  demoUrl?: string | null;
};

export async function GET(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await ctx.params;

    // ---------------------------------------------------------------
    // Non-fallback: fetch versions from Postgres-backed own engine data
    // ---------------------------------------------------------------
    if (!shouldUseV0Fallback()) {
      const engineVersions = await getVersionsByChat(chatId);
      if (engineVersions.length > 0) {
        const versionsList = engineVersions.map((v) => ({
          id: v.id,
          versionId: v.id,
          demoUrl: buildPreviewUrl(chatId, v.id),
          createdAt: v.created_at,
          versionNumber: v.version_number,
          messageId: v.message_id,
          sandboxUrl: v.sandbox_url,
        }));
        return NextResponse.json({ versions: versionsList });
      }

      const mappedV0Chat = await getChatByV0ChatIdForRequest(req, chatId);
      if (mappedV0Chat) {
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
          .where(eq(versions.chatId, mappedV0Chat.id))
          .orderBy(desc(versions.pinned), desc(versions.pinnedAt), desc(versions.createdAt));
        if (dbVersions.length > 0) {
          return NextResponse.json({
            versions: dbVersions.map((v) => ({
              versionId: v.v0VersionId,
              id: v.id,
              messageId: v.v0MessageId,
              demoUrl: v.demoUrl,
              pinned: v.pinned,
              pinnedAt: v.pinnedAt,
              createdAt: v.createdAt,
            })),
          });
        }
      }

      {
        // Template/category flows may provide a v0 chat id even in own-engine mode.
        // Surface at least the latest v0 version so the builder can recover.
        try {
          assertV0Key();
          const v0Chat = await v0.chats.getById({ chatId }) as V0ChatLike;
          const latest = v0Chat.latestVersion ?? null;
          const versionId = latest?.id || latest?.versionId || null;
          const demoUrl = latest?.demoUrl || latest?.demo_url || v0Chat.demoUrl || null;
          if (versionId || demoUrl) {
            return NextResponse.json({
              versions: [
                {
                  id: typeof versionId === "string" ? versionId : null,
                  versionId: typeof versionId === "string" ? versionId : null,
                  demoUrl: typeof demoUrl === "string" ? demoUrl : null,
                  createdAt: null,
                  versionNumber: null,
                  messageId: latest?.messageId ?? null,
                  sandboxUrl: null,
                },
              ],
            });
          }
        } catch (lookupError) {
          console.warn("[chat/versions] Non-fallback v0 lookup failed:", lookupError);
        }
      }
      return NextResponse.json({ versions: [] });
    }

    // ---------------------------------------------------------------
    // V0 fallback: existing Drizzle/Postgres flow
    // ---------------------------------------------------------------
    assertV0Key();

    if (!dbConfigured) {
      return NextResponse.json({ versions: [], warning: "Database not configured." });
    }

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
