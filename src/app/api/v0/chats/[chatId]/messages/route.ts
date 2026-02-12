import { NextResponse } from "next/server";
import { assertV0Key, v0 } from "@/lib/v0";
import { sendMessageSchema } from "@/lib/validations/chatSchemas";
import { db } from "@/lib/db/client";
import { versions } from "@/lib/db/schema";
import { nanoid } from "nanoid";
import { withRateLimit } from "@/lib/rateLimit";
import { getChatByV0ChatIdForRequest } from "@/lib/tenant";
import { sanitizeV0Metadata } from "@/lib/v0/sanitize-metadata";
import { prepareCredits } from "@/lib/credits/server";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { devLogAppend } from "@/lib/logging/devLog";
import { WARN_CHAT_MESSAGE_CHARS, WARN_CHAT_SYSTEM_CHARS } from "@/lib/builder/promptLimits";
import { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const session = ensureSessionIdFromRequest(req);
  const sessionId = session.sessionId;
  const attachSessionCookie = (response: Response) => {
    if (session.setCookie) {
      response.headers.set("Set-Cookie", session.setCookie);
    }
    return response;
  };
  return withRateLimit(req, "message:send", async () => {
    try {
      assertV0Key();

      const { chatId } = await ctx.params;
      const body = await req.json().catch(() => ({}));

      const validationResult = sendMessageSchema.safeParse(body);
      if (!validationResult.success) {
        return attachSessionCookie(
          NextResponse.json(
            { error: "Validation failed", details: validationResult.error.issues },
            { status: 400 },
          ),
        );
      }

      const { message, attachments, modelId, thinking, imageGenerations, system, meta } =
        validationResult.data;

      const dbChat = await getChatByV0ChatIdForRequest(req, chatId);
      if (!dbChat) {
        return attachSessionCookie(NextResponse.json({ error: "Chat not found" }, { status: 404 }));
      }

      const resolvedModelId = modelId || "v0-max";
      const resolvedThinking =
        typeof thinking === "boolean" ? thinking : resolvedModelId === "v0-max";
      const resolvedImageGenerations =
        typeof imageGenerations === "boolean" ? imageGenerations : true;
      const metaBuildMethod =
        typeof (meta as { buildMethod?: unknown })?.buildMethod === "string"
          ? (meta as { buildMethod?: string }).buildMethod
          : null;
      const metaBuildIntent =
        typeof (meta as { buildIntent?: unknown })?.buildIntent === "string"
          ? (meta as { buildIntent?: string }).buildIntent
          : null;
      const promptOrchestration = orchestratePromptMessage({
        message,
        buildMethod: metaBuildMethod,
        buildIntent: metaBuildIntent,
        isFirstPrompt: false,
        attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
      });
      const strategyMeta = promptOrchestration.strategyMeta;
      const optimizedMessage = promptOrchestration.finalMessage;
      const trimmedSystemPrompt = typeof system === "string" ? system.trim() : "";
      if (
        message.length > WARN_CHAT_MESSAGE_CHARS ||
        optimizedMessage.length > WARN_CHAT_MESSAGE_CHARS ||
        trimmedSystemPrompt.length > WARN_CHAT_SYSTEM_CHARS
      ) {
        devLogAppend("latest", {
          type: "prompt.size.warning",
          chatId,
          messageLength: optimizedMessage.length,
          originalMessageLength: message.length,
          systemLength: trimmedSystemPrompt.length,
          warnMessageChars: WARN_CHAT_MESSAGE_CHARS,
          warnSystemChars: WARN_CHAT_SYSTEM_CHARS,
        });
      }
      devLogAppend("latest", {
        type: "comm.request.send.sync",
        chatId,
        message: optimizedMessage,
        modelId: resolvedModelId,
        slug: metaBuildMethod || metaBuildIntent || undefined,
        promptType: strategyMeta.promptType,
        promptStrategy: strategyMeta.strategy,
        promptBudgetTarget: strategyMeta.budgetTarget,
        originalLength: strategyMeta.originalLength,
        optimizedLength: strategyMeta.optimizedLength,
        reductionRatio: strategyMeta.reductionRatio,
        strategyReason: strategyMeta.reason,
        attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
      });

      const creditContext = {
        modelId: resolvedModelId,
        thinking: resolvedThinking,
        imageGenerations: resolvedImageGenerations,
        attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
      };
      const creditCheck = await prepareCredits(req, "prompt.refine", creditContext, { sessionId });
      if (!creditCheck.ok) {
        return attachSessionCookie(creditCheck.response);
      }

      const result = await (v0.chats as any).sendMessage({
        chatId,
        message: optimizedMessage,
        attachments,
        modelConfiguration: {
          modelId: resolvedModelId,
          thinking: resolvedThinking,
          imageGenerations: resolvedImageGenerations,
        },
        ...(trimmedSystemPrompt ? { system: trimmedSystemPrompt } : {}),
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

      try {
        await creditCheck.commit();
      } catch (error) {
        console.error("[credits] Failed to charge refine:", error);
      }
      devLogAppend("latest", {
        type: "comm.response.send.sync",
        chatId,
        messageId: actualMessageId,
        versionId,
        demoUrl,
        assistantPreview:
          (typeof messageResult.text === "string" && messageResult.text) ||
          (typeof messageResult.message === "string" && messageResult.message) ||
          null,
      });

      return attachSessionCookie(
        NextResponse.json({
          ...result,
          savedVersionId,
          messageId: actualMessageId,
        }),
      );
    } catch (err) {
      devLogAppend("latest", {
        type: "comm.error.send.sync",
        message: err instanceof Error ? err.message : "Unknown error",
      });
      return attachSessionCookie(
        NextResponse.json(
          { error: err instanceof Error ? err.message : "Unknown error" },
          { status: 500 },
        ),
      );
    }
  });
}
