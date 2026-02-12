import { NextResponse } from "next/server";
import { assertV0Key, v0 } from "@/lib/v0";
import { createChatSchema } from "@/lib/validations/chatSchemas";
import { db } from "@/lib/db/client";
import { chats, versions } from "@/lib/db/schema";
import { nanoid } from "nanoid";
import { withRateLimit } from "@/lib/rateLimit";
import { ensureProjectForRequest, resolveV0ProjectId, generateProjectName } from "@/lib/tenant";
import { requireNotBot } from "@/lib/botProtection";
import { debugLog } from "@/lib/utils/debug";
import { devLogAppend } from "@/lib/logging/devLog";
import { sanitizeV0Metadata } from "@/lib/v0/sanitize-metadata";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { prepareCredits } from "@/lib/credits/server";
import { WARN_CHAT_MESSAGE_CHARS, WARN_CHAT_SYSTEM_CHARS } from "@/lib/builder/promptLimits";
import { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";
import { resolveModelSelection } from "@/lib/v0/modelSelection";

export async function POST(req: Request) {
  const session = ensureSessionIdFromRequest(req);
  const sessionId = session.sessionId;
  const attachSessionCookie = (response: Response) => {
    if (session.setCookie) {
      response.headers.set("Set-Cookie", session.setCookie);
    }
    return response;
  };
  return withRateLimit(req, "chat:create", async () => {
    try {
      const botError = requireNotBot(req);
      if (botError) return attachSessionCookie(botError);

      assertV0Key();

      const body = await req.json().catch(() => ({}));
      const validationResult = createChatSchema.safeParse(body);
      if (!validationResult.success) {
        return attachSessionCookie(
          NextResponse.json(
            { error: "Validation failed", details: validationResult.error.issues },
            { status: 400 },
          ),
        );
      }

      const {
        message,
        attachments,
        projectId,
        system,
        modelId = "v0-max",
        thinking,
        imageGenerations,
        chatPrivacy,
        meta,
      } = validationResult.data;
      const metaRequestedModelTier =
        typeof (meta as { modelTier?: unknown })?.modelTier === "string"
          ? String((meta as { modelTier?: string }).modelTier)
          : null;
      const modelSelection = resolveModelSelection({
        requestedModelId: modelId,
        requestedModelTier: metaRequestedModelTier,
        fallbackTier: "v0-max",
      });
      const resolvedModelId = modelSelection.modelId;
      const resolvedModelTier = modelSelection.modelTier;

      const metaBuildMethod =
        typeof (meta as { buildMethod?: unknown })?.buildMethod === "string"
          ? (meta as { buildMethod?: string }).buildMethod
          : null;
      const metaBuildIntent =
        typeof (meta as { buildIntent?: unknown })?.buildIntent === "string"
          ? (meta as { buildIntent?: string }).buildIntent
          : null;
      const metaPlanModeFirstPrompt =
        typeof (meta as { planModeFirstPrompt?: unknown })?.planModeFirstPrompt === "boolean"
          ? Boolean((meta as { planModeFirstPrompt?: boolean }).planModeFirstPrompt)
          : false;
      const promptOrchestration = orchestratePromptMessage({
        message,
        buildMethod: metaBuildMethod,
        buildIntent: metaBuildIntent,
        isFirstPrompt: true,
        planModeFirstPromptEnabled: metaPlanModeFirstPrompt,
        attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
      });
      const strategyMeta = promptOrchestration.strategyMeta;
      const optimizedMessage = promptOrchestration.finalMessage;

      const trimmedSystemPrompt = typeof system === "string" ? system.trim() : "";
      const hasSystemPrompt = Boolean(trimmedSystemPrompt);
      const resolvedThinking =
        typeof thinking === "boolean" ? thinking : resolvedModelTier === "v0-max";
      const resolvedImageGenerations =
        typeof imageGenerations === "boolean" ? imageGenerations : true;
      const resolvedChatPrivacy = chatPrivacy ?? "private";
      if (
        message.length > WARN_CHAT_MESSAGE_CHARS ||
        optimizedMessage.length > WARN_CHAT_MESSAGE_CHARS ||
        trimmedSystemPrompt.length > WARN_CHAT_SYSTEM_CHARS
      ) {
        devLogAppend("latest", {
          type: "prompt.size.warning",
          messageLength: optimizedMessage.length,
          originalMessageLength: message.length,
          systemLength: trimmedSystemPrompt.length,
          warnMessageChars: WARN_CHAT_MESSAGE_CHARS,
          warnSystemChars: WARN_CHAT_SYSTEM_CHARS,
        });
      }

      debugLog("v0", "v0 chat request (sync)", {
        modelId: resolvedModelId,
        modelTier: resolvedModelTier,
        customModelIdIgnored: modelSelection.customModelIdIgnored,
        usingCustomModelId: modelSelection.usingCustomModelId,
        promptLength: optimizedMessage.length,
        originalPromptLength: message.length,
        attachments: Array.isArray(attachments) ? attachments.length : 0,
        systemProvided: hasSystemPrompt,
        systemApplied: hasSystemPrompt,
        systemIgnored: false,
        thinking: resolvedThinking,
        imageGenerations: resolvedImageGenerations,
        chatPrivacy: resolvedChatPrivacy,
        promptStrategy: strategyMeta.strategy,
        promptType: strategyMeta.promptType,
      });
      devLogAppend("latest", {
        type: "comm.request.create.sync",
        modelId: resolvedModelId,
        message: optimizedMessage,
        slug: metaBuildMethod || metaBuildIntent || undefined,
        promptType: strategyMeta.promptType,
        promptStrategy: strategyMeta.strategy,
        promptBudgetTarget: strategyMeta.budgetTarget,
        originalLength: strategyMeta.originalLength,
        optimizedLength: strategyMeta.optimizedLength,
        reductionRatio: strategyMeta.reductionRatio,
        strategyReason: strategyMeta.reason,
        attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
        chatPrivacy: resolvedChatPrivacy,
      });

      const creditContext = {
        modelId: resolvedModelId,
        thinking: resolvedThinking,
        imageGenerations: resolvedImageGenerations,
        attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
      };
      const creditCheck = await prepareCredits(req, "prompt.create", creditContext, { sessionId });
      if (!creditCheck.ok) {
        return attachSessionCookie(creditCheck.response);
      }

      const result = await v0.chats.create({
        message: optimizedMessage,
        ...(hasSystemPrompt ? { system: trimmedSystemPrompt } : {}),
        projectId,
        chatPrivacy: resolvedChatPrivacy,
        modelConfiguration: {
          modelId: resolvedModelId,
          thinking: resolvedThinking,
          imageGenerations: resolvedImageGenerations,
        },
        ...(attachments ? { attachments } : {}),
      } as Parameters<typeof v0.chats.create>[0]);

      // Save chat and initial version to database (best-effort).
      let internalChatId: string | null = null;
      try {
        const chatResult =
          result && typeof result === "object" && "id" in result ? (result as any) : null;
        const v0ChatId: string | null = chatResult?.id || null;
        if (!v0ChatId) {
          devLogAppend("latest", {
            type: "comm.response.create.sync",
            chatId: null,
            versionId: null,
            demoUrl: null,
          });
          return attachSessionCookie(NextResponse.json(result));
        }

        internalChatId = nanoid();
        // Use standardized v0ProjectId resolution
        const v0ProjectId = resolveV0ProjectId({
          v0ChatId,
          chatDataProjectId: chatResult?.projectId,
          clientProjectId: projectId,
        });
        const projectName = generateProjectName({
          v0ChatId,
          clientProjectId: projectId,
        });

        let internalProjectId: string | null = null;
        try {
          const project = await ensureProjectForRequest({
            req,
            v0ProjectId,
            name: projectName,
            sessionId,
          });
          internalProjectId = project.id;
        } catch {
          // ignore project save errors
        }

        await db.insert(chats).values({
          id: internalChatId,
          v0ChatId,
          v0ProjectId,
          projectId: internalProjectId,
          webUrl: chatResult?.webUrl || null,
        });

        const latestVersion = chatResult?.latestVersion || null;
        if (latestVersion) {
          const versionId = latestVersion.id || latestVersion.versionId;
          const demoUrl = latestVersion.demoUrl || latestVersion.demo_url || null;
          if (versionId) {
            await db.insert(versions).values({
              id: nanoid(),
              chatId: internalChatId,
              v0VersionId: versionId,
              v0MessageId: latestVersion.messageId || null,
              demoUrl,
              metadata: sanitizeV0Metadata(latestVersion),
            });
          }
        }
      } catch (dbError) {
        console.error("Failed to save chat to database:", dbError);
      }

      try {
        await creditCheck.commit();
      } catch (error) {
        console.error("[credits] Failed to charge prompt:", error);
      }
      const resultData = result as Record<string, unknown>;
      const latestVersion =
        resultData && typeof resultData.latestVersion === "object" && resultData.latestVersion
          ? (resultData.latestVersion as Record<string, unknown>)
          : null;
      devLogAppend("latest", {
        type: "comm.response.create.sync",
        chatId: (typeof resultData.id === "string" && resultData.id) || null,
        versionId:
          (latestVersion && typeof latestVersion.id === "string" && latestVersion.id) ||
          (latestVersion && typeof latestVersion.versionId === "string" && latestVersion.versionId) ||
          null,
        demoUrl:
          (latestVersion && typeof latestVersion.demoUrl === "string" && latestVersion.demoUrl) ||
          null,
      });

      return attachSessionCookie(
        NextResponse.json({
          ...result,
          internalChatId,
        }),
      );
    } catch (err) {
      devLogAppend("latest", {
        type: "comm.error.create.sync",
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
