import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { versions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getChatByV0ChatIdForRequest, getEngineChatByIdForRequest } from "@/lib/tenant";
import {
  getLatestVersion,
  getPreferredVersion,
  maybeAutoAcceptTimedOutRepair,
} from "@/lib/db/chat-repository-pg";
import { getScaffoldById } from "@/lib/gen/scaffolds";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { createEngineVersionErrorLogs } from "@/lib/db/services/version-errors";

export async function GET(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await ctx.params;

    const chat = await getEngineChatByIdForRequest(req, chatId);
      if (chat) {
        const resolvedChatId = chat.id;
        let latest =
          (await getPreferredVersion(resolvedChatId)) ??
          (await getLatestVersion(resolvedChatId));
        if (latest) {
          const { version: normalizedLatestVersion, wasAutoAccepted } =
            await maybeAutoAcceptTimedOutRepair(latest);
          latest = normalizedLatestVersion;
          if (wasAutoAccepted) {
            await createEngineVersionErrorLogs([
              {
                chatId: resolvedChatId,
                versionId: normalizedLatestVersion.id,
                level: "info",
                category: "server-repair:auto-accepted",
                message: "Pending server repair auto-accepted after timeout.",
                meta: {
                  acceptedAt: new Date().toISOString(),
                  serverOwned: true,
                },
              },
            ]).catch(() => null);
          }
        }
        const resolvedScaffold = chat.scaffold_id ? getScaffoldById(chat.scaffold_id) : null;

        return NextResponse.json({
          id: chat.id,
          chatId: chat.id,
          projectId: chat.project_id,
          title: chat.title,
          model: chat.model,
          scaffoldId: chat.scaffold_id,
          scaffoldLabel: resolvedScaffold?.label ?? null,
          ...previewUrlField(null),
          legacyShimPreviewUrl: null,
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
                ...previewUrlField(latest.preview_url),
                legacyShimPreviewUrl: null,
                createdAt: latest.created_at,
                versionNumber: latest.version_number,
                messageId: latest.message_id,
                previewPending: false,
                releaseState: latest.release_state,
                verificationState: latest.verification_state,
                verificationSummary: latest.verification_summary,
                hasPendingRepair:
                  typeof latest.repaired_files_json === "string" &&
                  latest.repaired_files_json.trim().length > 0,
                repairAvailableAt: latest.repair_available_at,
                promotedAt: latest.promoted_at,
                canPin: false,
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
          const v0Preview = latestMappedVersion[0].demoUrl;
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
              ...previewUrlField(v0Preview),
              createdAt: latestMappedVersion[0].createdAt,
              canPin: true,
            },
            ...previewUrlField(v0Preview),
          });
        }
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
