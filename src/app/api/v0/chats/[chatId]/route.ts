import { NextResponse } from "next/server";
import { assertV0Key, v0 } from "@/lib/v0";
import { db } from "@/lib/db/client";
import { versions } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { getChatByV0ChatIdForRequest } from "@/lib/tenant";
import { nanoid } from "nanoid";

export async function GET(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    assertV0Key();

    const { chatId } = await ctx.params;

    const dbChat = await getChatByV0ChatIdForRequest(req, chatId);

    if (dbChat) {
      const latestVersion = await db
        .select()
        .from(versions)
        .where(eq(versions.chatId, dbChat.id))
        .orderBy(desc(versions.createdAt))
        .limit(1);

      const latestDemoUrl = latestVersion.length > 0 ? latestVersion[0].demoUrl : null;
      const latestDbVersionId =
        latestVersion.length > 0 ? latestVersion[0].v0VersionId || null : null;

      let latestFromV0:
        | { versionId: string | null; demoUrl: string | null; messageId?: string | null }
        | null = null;
      try {
        const v0Chat = await v0.chats.getById({ chatId });
        const latest = (v0Chat as any)?.latestVersion || null;
        const versionId =
          (latest && (latest.id || latest.versionId)) ||
          (v0Chat as any)?.versionId ||
          null;
        const demoUrl =
          (latest && (latest.demoUrl || latest.demo_url)) || (v0Chat as any)?.demoUrl || null;
        const messageId = latest?.messageId || null;
        if (versionId || demoUrl) {
          latestFromV0 = {
            versionId: typeof versionId === "string" ? versionId : null,
            demoUrl: typeof demoUrl === "string" ? demoUrl : null,
            messageId,
          };
        }
      } catch (error) {
        console.warn("[chat] Failed to fetch latest version from v0:", error);
      }

      if (latestFromV0?.versionId && latestFromV0.versionId !== latestDbVersionId) {
        try {
          await db
            .insert(versions)
            .values({
              id: nanoid(),
              chatId: dbChat.id,
              v0VersionId: latestFromV0.versionId,
              v0MessageId: latestFromV0.messageId ?? null,
              demoUrl: latestFromV0.demoUrl ?? null,
            })
            .onConflictDoUpdate({
              target: [versions.chatId, versions.v0VersionId],
              set: { demoUrl: latestFromV0.demoUrl ?? null },
            });
        } catch (dbErr) {
          console.warn("[chat] Failed to upsert latest version from v0:", dbErr);
        }
      }

      const latestCreatedAt = latestVersion.length > 0 ? latestVersion[0].createdAt : null;
      let latestFromV0CreatedAt: Date | string | null = null;
      if (latestFromV0?.versionId) {
        if (latestFromV0.versionId === latestDbVersionId) {
          latestFromV0CreatedAt = latestVersion[0]?.createdAt ?? null;
        } else {
          const matchingVersion = await db
            .select({ createdAt: versions.createdAt })
            .from(versions)
            .where(
              and(
                eq(versions.chatId, dbChat.id),
                eq(versions.v0VersionId, latestFromV0.versionId),
              ),
            )
            .limit(1);
          latestFromV0CreatedAt = matchingVersion[0]?.createdAt ?? null;
        }
      }

      return NextResponse.json({
        chatId,
        id: dbChat.id,
        v0ChatId: dbChat.v0ChatId,
        v0ProjectId: dbChat.v0ProjectId,
        webUrl: dbChat.webUrl,
        createdAt: dbChat.createdAt,
        updatedAt: dbChat.updatedAt,
        latestVersion:
          latestFromV0?.versionId || latestFromV0?.demoUrl
            ? {
                versionId: latestFromV0?.versionId ?? null,
                messageId: latestFromV0?.messageId ?? null,
                demoUrl: latestFromV0?.demoUrl ?? null,
                createdAt: latestFromV0?.versionId ? latestFromV0CreatedAt : null,
              }
            : latestVersion.length > 0
              ? {
                  versionId: latestVersion[0].v0VersionId,
                  messageId: latestVersion[0].v0MessageId,
                  demoUrl: latestVersion[0].demoUrl,
                  createdAt: latestCreatedAt,
                }
              : null,
        demoUrl: latestFromV0?.demoUrl ?? latestDemoUrl,
      });
    }

    return NextResponse.json({
      chatId,
      message: "Chat not found in database. It may need to be created first.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
