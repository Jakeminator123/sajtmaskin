import { NextResponse } from "next/server";
import { assertV0Key, v0 } from "@/lib/v0";
import { sendMessageSchema } from "@/lib/validations/chatSchemas";
import { db } from "@/lib/db/client";
import { versions } from "@/lib/db/schema";
import { nanoid } from "nanoid";
import { withRateLimit } from "@/lib/rateLimit";
import { getChatByV0ChatIdForRequest } from "@/lib/tenant";
import { sanitizeV0Metadata } from "@/lib/v0/sanitize-metadata";

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(req, "message:send", async () => {
    try {
      assertV0Key();

      const { chatId } = await ctx.params;
      const body = await req.json().catch(() => ({}));

      const validationResult = sendMessageSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { error: "Validation failed", details: validationResult.error.issues },
          { status: 400 },
        );
      }

      const { message, attachments, modelId, thinking, imageGenerations, system } =
        validationResult.data;

      const dbChat = await getChatByV0ChatIdForRequest(req, chatId);
      if (!dbChat) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
      }

      const resolvedModelId = modelId || "v0-max";
      const resolvedThinking =
        typeof thinking === "boolean" ? thinking : resolvedModelId === "v0-max";
      const resolvedImageGenerations =
        typeof imageGenerations === "boolean" ? imageGenerations : true;

      const result = await v0.chats.sendMessage({
        chatId,
        message,
        attachments,
        modelConfiguration: {
          modelId: resolvedModelId,
          thinking: resolvedThinking,
          imageGenerations: resolvedImageGenerations,
        },
        ...(typeof system === "string" && system.trim() ? { system: system.trim() } : {}),
      });

      const messageResult = result as any;
      const actualMessageId =
        messageResult.messageId ||
        messageResult.message?.id ||
        messageResult.latestVersion?.messageId ||
        null;
      const versionId = messageResult.versionId || messageResult.latestVersion?.id || null;
      const demoUrl =
        messageResult.demoUrl ||
        messageResult.demo_url ||
        messageResult.latestVersion?.demoUrl ||
        null;

      let savedVersionId: string | null = null;
      try {
        if (versionId) {
          savedVersionId = nanoid();
          await db.insert(versions).values({
            id: savedVersionId,
            chatId: dbChat.id,
            v0VersionId: versionId,
            v0MessageId: actualMessageId,
            demoUrl,
            metadata: sanitizeV0Metadata(messageResult),
          });
        }
      } catch (dbError) {
        console.error(
          "Failed to save version to database:",
          { chatId: dbChat.id, versionId },
          dbError,
        );
      }

      return NextResponse.json({
        ...result,
        savedVersionId,
        messageId: actualMessageId,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
