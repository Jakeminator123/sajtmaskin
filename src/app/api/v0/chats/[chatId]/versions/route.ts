import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { versions } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import {
  getChatByV0ChatIdForRequest,
  getEngineChatByIdForRequest,
  getEngineVersionForChatByIdForRequest,
} from "@/lib/tenant";
import {
  addMessage,
  createDraftVersion,
  getVersionsByChat,
  updateVersionSandboxUrl,
} from "@/lib/db/chat-repository-pg";
import { buildPreviewUrl } from "@/lib/gen/preview";
import { canExposeEnginePreview } from "@/lib/db/engine-version-lifecycle";

export async function GET(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await ctx.params;

    const engineChat = await getEngineChatByIdForRequest(req, chatId);
    const engineVersions = engineChat ? await getVersionsByChat(engineChat.id) : [];
    const engineChatId = engineChat?.id ?? chatId;
    if (engineVersions.length > 0) {
      const versionsList = engineVersions.map((v) => ({
          id: v.id,
          versionId: v.id,
          demoUrl: canExposeEnginePreview(v) ? buildPreviewUrl(engineChatId, v.id) : null,
          createdAt: v.created_at,
          versionNumber: v.version_number,
          messageId: v.message_id,
          sandboxUrl: v.sandbox_url,
          releaseState: v.release_state,
          verificationState: v.verification_state,
          verificationSummary: v.verification_summary,
          promotedAt: v.promoted_at,
          canPin: false,
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
            canPin: true,
          })),
        });
      }
    }

    return NextResponse.json({ versions: [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const { versionId, pinned, sandboxUrl } = body ?? {};
    const hasSandboxUrl = Object.prototype.hasOwnProperty.call(body ?? {}, "sandboxUrl");

    if (
      !versionId ||
      (typeof pinned !== "boolean" && !hasSandboxUrl)
    ) {
      return NextResponse.json(
        { error: "versionId plus either pinned or sandboxUrl is required" },
        { status: 400 },
      );
    }

    const engineChat = await getEngineChatByIdForRequest(req, chatId);
    if (engineChat) {
      if (hasSandboxUrl) {
        const normalizedSandboxUrl =
          typeof sandboxUrl === "string" && sandboxUrl.trim().length > 0
            ? sandboxUrl.trim()
            : null;
        if (sandboxUrl !== null && sandboxUrl !== undefined && normalizedSandboxUrl === null) {
          return NextResponse.json(
            { error: "sandboxUrl must be a non-empty string or null" },
            { status: 400 },
          );
        }
        if (normalizedSandboxUrl) {
          try {
            new URL(normalizedSandboxUrl);
          } catch {
            return NextResponse.json({ error: "sandboxUrl must be a valid URL" }, { status: 400 });
          }
        }

        const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
        if (!scopedVersion) {
          return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
        }

        const updated = await updateVersionSandboxUrl(
          scopedVersion.version.id,
          normalizedSandboxUrl,
        );
        if (!updated) {
          return NextResponse.json(
            { error: "Failed to update sandbox URL" },
            { status: 500 },
          );
        }

        return NextResponse.json({
          success: true,
          versionId: scopedVersion.version.id,
          sandboxUrl: normalizedSandboxUrl,
        });
      }

      return NextResponse.json(
        { error: "Pinning is not supported for own-engine versions." },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "";
    const versionId = typeof body?.versionId === "string" ? body.versionId : "";

    if ((action !== "restore" && action !== "rollback") || !versionId) {
      return NextResponse.json({ error: "action=restore|rollback and versionId are required" }, { status: 400 });
    }

    const engineChat = await getEngineChatByIdForRequest(req, chatId);
    if (!engineChat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    const existingVersions = await getVersionsByChat(engineChat.id);
    const versionToRestore = existingVersions.find((entry) => entry.id === versionId) ?? null;
    if (!versionToRestore) {
      return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
    }

    const assistantMessage = await addMessage(
      engineChat.id,
      "assistant",
      action === "rollback"
        ? `Rolled back to snapshot from version ${versionToRestore.version_number}.`
        : `Restored snapshot from version ${versionToRestore.version_number}.`,
    );
    const restoredVersion = await createDraftVersion(
      engineChat.id,
      assistantMessage.id,
      versionToRestore.files_json,
    );
    return NextResponse.json({
      success: true,
      versionId: restoredVersion.id,
      demoUrl: canExposeEnginePreview(restoredVersion)
        ? buildPreviewUrl(engineChat.id, restoredVersion.id)
        : null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
