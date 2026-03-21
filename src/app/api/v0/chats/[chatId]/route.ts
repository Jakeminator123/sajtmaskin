import { NextResponse } from "next/server";
import { assertV0Key, v0 } from "@/lib/v0";
import { db } from "@/lib/db/client";
import { versions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  getChatByV0ChatIdForRequest,
  getEngineChatByIdForRequest,
  getProjectByIdForRequest,
} from "@/lib/tenant";
import { getLatestVersion, getPreferredVersion } from "@/lib/db/chat-repository-pg";
import { resolveEngineDemoUrl } from "@/lib/gen/demo-url";
import { getScaffoldById } from "@/lib/gen/scaffolds";

type V0ChatSummary = {
  latest: {
    id: string | null;
    versionId: string | null;
    demoUrl: string | null;
    messageId: string | null;
  } | null;
  projectId: string | null;
  versionId: string | null;
  demoUrl: string | null;
  webUrl: string | null;
  createdAt: unknown | null;
  updatedAt: unknown | null;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function getV0ChatSummary(value: unknown): V0ChatSummary {
  const chat = asObject(value);
  const latest = asObject(chat?.latestVersion);

  return {
    latest: latest
      ? {
          id: asString(latest.id),
          versionId: asString(latest.versionId),
          demoUrl: asString(latest.demoUrl) ?? asString(latest.demo_url),
          messageId: asString(latest.messageId),
        }
      : null,
    projectId: asString(chat?.projectId),
    versionId: asString(chat?.versionId),
    demoUrl: asString(chat?.demoUrl),
    webUrl: asString(chat?.webUrl),
    createdAt: chat?.createdAt ?? null,
    updatedAt: chat?.updatedAt ?? null,
  };
}

export async function GET(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await ctx.params;

    const chat = await getEngineChatByIdForRequest(req, chatId);
      if (chat) {
        const resolvedChatId = chat.id;
        const latest =
          (await getPreferredVersion(resolvedChatId)) ??
          (await getLatestVersion(resolvedChatId));
        const resolvedScaffold = chat.scaffold_id ? getScaffoldById(chat.scaffold_id) : null;
        const previewUrl = resolveEngineDemoUrl(resolvedChatId, latest);

        return NextResponse.json({
          id: chat.id,
          chatId: chat.id,
          projectId: chat.project_id,
          title: chat.title,
          model: chat.model,
          scaffoldId: chat.scaffold_id,
          scaffoldFamily: resolvedScaffold?.family ?? null,
          scaffoldLabel: resolvedScaffold?.label ?? null,
          demoUrl: previewUrl,
          createdAt: chat.created_at,
          updatedAt: chat.updated_at,
          messages: chat.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            uiParts: Array.isArray(m.ui_parts) ? m.ui_parts : undefined,
            tokenCount: m.token_count,
            createdAt: m.created_at,
          })),
          latestVersion: latest
            ? {
                id: latest.id,
                versionId: latest.id,
                demoUrl: previewUrl,
                createdAt: latest.created_at,
                versionNumber: latest.version_number,
                messageId: latest.message_id,
                sandboxUrl: latest.sandbox_url,
                releaseState: latest.release_state,
                verificationState: latest.verification_state,
                verificationSummary: latest.verification_summary,
                promotedAt: latest.promoted_at,
              }
            : null,
        });
      }

      const mappedV0Chat = await getChatByV0ChatIdForRequest(req, chatId);
      if (mappedV0Chat) {
        const latestMappedVersion = await db
          .select()
          .from(versions)
          .where(eq(versions.chatId, mappedV0Chat.id))
          .orderBy(desc(versions.createdAt))
          .limit(1);
        if (latestMappedVersion.length > 0) {
          return NextResponse.json({
            chatId,
            id: mappedV0Chat.id,
            v0ChatId: mappedV0Chat.v0ChatId,
            v0ProjectId: mappedV0Chat.v0ProjectId,
            webUrl: mappedV0Chat.webUrl,
            createdAt: mappedV0Chat.createdAt,
            updatedAt: mappedV0Chat.updatedAt,
            latestVersion: {
              versionId: latestMappedVersion[0].v0VersionId,
              messageId: latestMappedVersion[0].v0MessageId,
              demoUrl: latestMappedVersion[0].demoUrl,
              createdAt: latestMappedVersion[0].createdAt,
            },
            demoUrl: latestMappedVersion[0].demoUrl,
          });
        }
      }

      // Template/category builds can still return raw v0 chat IDs even when
      // the own engine path is active. If the DB mapping is missing or stale,
      // fall back to a direct v0 lookup instead of hard 404.
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chatId);
      if (isUuid) {
        return NextResponse.json(
          { error: "Chat not found" },
          { status: 404 },
        );
      }
      try {
        assertV0Key();
        const v0Chat = getV0ChatSummary(await v0.chats.getById({ chatId }));
        if (!v0Chat.projectId) {
          return NextResponse.json(
            { error: "Chat not found" },
            { status: 404 },
          );
        }
        const ownedProject = await getProjectByIdForRequest(req, v0Chat.projectId);
        if (!ownedProject) {
          return NextResponse.json(
            { error: "Chat not found" },
            { status: 404 },
          );
        }
        const latest = v0Chat.latest;
        const versionId = latest?.id || latest?.versionId || v0Chat.versionId || null;
        const demoUrl = latest?.demoUrl || v0Chat.demoUrl || null;
        const messageId = latest?.messageId || null;
        return NextResponse.json({
          chatId,
          id: chatId,
          v0ChatId: chatId,
          v0ProjectId: ownedProject.v0ProjectId ?? v0Chat.projectId,
          webUrl: v0Chat.webUrl,
          createdAt: v0Chat.createdAt,
          updatedAt: v0Chat.updatedAt,
          latestVersion:
            versionId || demoUrl
              ? {
                  versionId: typeof versionId === "string" ? versionId : null,
                  messageId: typeof messageId === "string" ? messageId : null,
                  demoUrl: typeof demoUrl === "string" ? demoUrl : null,
                  createdAt: null,
                }
              : null,
          demoUrl: typeof demoUrl === "string" ? demoUrl : null,
        });
      } catch (lookupError) {
        console.warn("[chat] Non-fallback chat lookup failed in v0 fallback path:", lookupError);
        return NextResponse.json(
          { error: "Chat not found" },
          { status: 404 },
        );
      }

    return NextResponse.json(
      { error: "Chat not found" },
      { status: 404 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
