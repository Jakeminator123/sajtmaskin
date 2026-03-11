import { NextResponse } from "next/server";
import { assertV0Key, v0 } from "@/lib/v0";
import { sendMessageSchema } from "@/lib/validations/chatSchemas";
import { db } from "@/lib/db/client";
import { versions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { withRateLimit } from "@/lib/rateLimit";
import { getChatByV0ChatIdForRequest } from "@/lib/tenant";
import { sanitizeV0Metadata } from "@/lib/v0/sanitize-metadata";
import { prepareCredits } from "@/lib/credits/server";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { devLogAppend } from "@/lib/logging/devLog";
import { WARN_CHAT_MESSAGE_CHARS, WARN_CHAT_SYSTEM_CHARS } from "@/lib/builder/promptLimits";
import { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";
import { resolveEngineModelId, resolveModelSelection } from "@/lib/v0/modelSelection";
import { DEFAULT_MODEL_ID } from "@/lib/v0/models";
import { normalizeRequestAttachments } from "@/lib/gen/request-metadata";

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
      const requestAttachments = normalizeRequestAttachments(attachments);
      const metaRequestedModelTier =
        typeof (meta as { modelTier?: unknown })?.modelTier === "string"
          ? String((meta as { modelTier?: string }).modelTier)
          : null;
      const modelSelection = resolveModelSelection({
        requestedModelId: modelId,
        requestedModelTier: metaRequestedModelTier,
        fallbackTier: DEFAULT_MODEL_ID,
      });

      const dbChat = await getChatByV0ChatIdForRequest(req, chatId);
      if (!dbChat) {
        return attachSessionCookie(NextResponse.json({ error: "Chat not found" }, { status: 404 }));
      }

      const resolvedModelId = modelSelection.modelId;
      const resolvedModelTier = modelSelection.modelTier;
      const resolvedThinking =
        typeof thinking === "boolean" ? thinking : true;
      const resolvedImageGenerations =
        typeof imageGenerations === "boolean" ? imageGenerations : true;
      const fallbackModelId = resolveEngineModelId(resolvedModelTier, true);
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
        attachmentsCount: requestAttachments.length,
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
        modelTier: resolvedModelTier,
        slug: metaBuildMethod || metaBuildIntent || undefined,
        promptType: strategyMeta.promptType,
        promptStrategy: strategyMeta.strategy,
        promptBudgetTarget: strategyMeta.budgetTarget,
        originalLength: strategyMeta.originalLength,
        optimizedLength: strategyMeta.optimizedLength,
        reductionRatio: strategyMeta.reductionRatio,
        strategyReason: strategyMeta.reason,
        attachmentsCount: requestAttachments.length,
      });

      const creditContext = {
        modelId: resolvedModelId,
        thinking: resolvedThinking,
        imageGenerations: resolvedImageGenerations,
        attachmentsCount: requestAttachments.length,
      };
      const creditCheck = await prepareCredits(req, "prompt.refine", creditContext, { sessionId });
      if (!creditCheck.ok) {
        return attachSessionCookie(creditCheck.response);
      }

      const result = await (v0.chats as any).sendMessage({
        chatId,
        message: optimizedMessage,
        attachments: requestAttachments,
        modelConfiguration: {
          modelId: fallbackModelId,
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
          const existing = await db
            .select({ id: versions.id })
            .from(versions)
            .where(and(eq(versions.chatId, dbChat.id), eq(versions.v0VersionId, String(versionId))))
            .limit(1);
          savedVersionId = existing[0]?.id ?? nanoid();
          await db
            .insert(versions)
            .values({
              id: savedVersionId,
              chatId: dbChat.id,
              v0VersionId: String(versionId),
              v0MessageId: actualMessageId,
              demoUrl: typeof demoUrl === "string" ? demoUrl : null,
              metadata: sanitizeV0Metadata(messageResult),
            })
            .onConflictDoUpdate({
              target: [versions.chatId, versions.v0VersionId],
              set: {
                v0MessageId: actualMessageId,
                demoUrl: typeof demoUrl === "string" ? demoUrl : null,
                metadata: sanitizeV0Metadata(messageResult),
              },
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
