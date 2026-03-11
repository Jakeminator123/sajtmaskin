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
import { resolveModelSelection, resolveEngineModelId } from "@/lib/v0/modelSelection";
import { DEFAULT_MODEL_ID, MODEL_LABELS, getBuildProfileId } from "@/lib/v0/models";
import { AI } from "@/lib/config";
import { shouldUseExplicitBuilderFallback, shouldUseV0Fallback } from "@/lib/gen/fallback";
import { ENGINE_MAX_OUTPUT_TOKENS } from "@/lib/gen/defaults";
import {
  createChat as createSqliteChat,
  addMessage,
  listChatsByProject,
} from "@/lib/db/chat-repository-pg";
import { createVersionFromContent } from "@/lib/gen/version-manager";
import { prepareGenerationContext } from "@/lib/gen/orchestrate";
import { streamText } from "ai";
import { getOpenAIModel } from "@/lib/gen/models";
import { DEFAULT_BUILD_INTENT } from "@/lib/builder/build-intent";
import {
  buildUserPromptContent,
  extractAppProjectIdFromMeta,
  extractBriefFromMeta,
  extractDesignThemePresetFromMeta,
  extractPaletteStateFromMeta,
  extractScaffoldSettingsFromMeta,
  extractThemeColorsFromMeta,
  normalizeRequestAttachments,
  summarizeDesignReferences,
} from "@/lib/gen/request-metadata";

export async function GET(req: Request) {
  if (shouldUseV0Fallback()) {
    try {
      assertV0Key();
      const { searchParams } = new URL(req.url);
      const projectId = searchParams.get("projectId");
      if (!projectId) {
        return NextResponse.json({ chats: [] });
      }
      const result = await v0.chats.find();
      return NextResponse.json({ chats: result ?? [] });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  }

  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ chats: [] });
    }
    const chatList = await listChatsByProject(projectId);
    return NextResponse.json({ chats: chatList });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

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
        modelId = DEFAULT_MODEL_ID,
        thinking,
        imageGenerations,
        chatPrivacy,
        designSystemId: clientDesignSystemId,
        meta,
      } = validationResult.data;
      const requestAttachments = normalizeRequestAttachments(attachments);
      const designSystemId = clientDesignSystemId || AI.designSystemId;
      const metaRequestedModelTier =
        typeof (meta as { modelTier?: unknown })?.modelTier === "string"
          ? String((meta as { modelTier?: string }).modelTier)
          : null;
      const modelSelection = resolveModelSelection({
        requestedModelId: modelId,
        requestedModelTier: metaRequestedModelTier,
        fallbackTier: DEFAULT_MODEL_ID,
      });
      const resolvedModelId = modelSelection.modelId;
      const resolvedModelTier = modelSelection.modelTier;
      const buildProfileId = getBuildProfileId(resolvedModelTier);
      const usingV0Fallback = shouldUseExplicitBuilderFallback(meta);

      const metaBuildMethod =
        typeof (meta as { buildMethod?: unknown })?.buildMethod === "string"
          ? (meta as { buildMethod?: string }).buildMethod
          : null;
      const metaBuildIntent =
        typeof (meta as { buildIntent?: unknown })?.buildIntent === "string"
          ? (meta as { buildIntent?: string }).buildIntent
          : null;
      const metaAppProjectId = extractAppProjectIdFromMeta(meta);
      const promptOrchestration = orchestratePromptMessage({
        message,
        buildMethod: metaBuildMethod,
        buildIntent: metaBuildIntent,
        isFirstPrompt: true,
        attachmentsCount: requestAttachments.length,
      });
      const strategyMeta = promptOrchestration.strategyMeta;
      const optimizedMessage = promptOrchestration.finalMessage;

      const trimmedSystemPrompt = typeof system === "string" ? system.trim() : "";
      const hasSystemPrompt = Boolean(trimmedSystemPrompt);
      const resolvedThinking =
        typeof thinking === "boolean" ? thinking : true;
      const resolvedImageGenerations =
        typeof imageGenerations === "boolean" ? imageGenerations : true;
      const resolvedChatPrivacy = chatPrivacy ?? "private";
      const fallbackModelId = resolveEngineModelId(resolvedModelTier, true);
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
        buildProfileId,
        buildProfileLabel: MODEL_LABELS[resolvedModelTier],
        internalModelSelection: resolvedModelTier,
        fallbackConfigured: shouldUseV0Fallback(),
        enginePath: usingV0Fallback ? "v0-fallback" : "own-engine",
        promptLength: optimizedMessage.length,
        originalPromptLength: message.length,
        attachments: requestAttachments.length,
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
        attachmentsCount: requestAttachments.length,
        chatPrivacy: resolvedChatPrivacy,
      });

      const creditContext = {
        modelId: resolvedModelId,
        thinking: resolvedThinking,
        imageGenerations: resolvedImageGenerations,
        attachmentsCount: requestAttachments.length,
      };
      const creditCheck = await prepareCredits(req, "prompt.create", creditContext, { sessionId });
      if (!creditCheck.ok) {
        return attachSessionCookie(creditCheck.response);
      }

      // ---------------------------------------------------------------
      // Non-fallback: generate via own engine, persist in Postgres
      // ---------------------------------------------------------------
      if (!usingV0Fallback) {
        const genStartedAt = Date.now();
        try {
          const intent =
            (metaBuildIntent as "template" | "website" | "app") || DEFAULT_BUILD_INTENT;
          const ownOrchestration = await prepareGenerationContext({
            prompt: optimizedMessage,
            buildIntent: intent,
            scaffoldMode: extractScaffoldSettingsFromMeta(meta).scaffoldMode,
            scaffoldId: extractScaffoldSettingsFromMeta(meta).scaffoldId,
            brief: extractBriefFromMeta(meta),
            themeColors: extractThemeColorsFromMeta(meta),
            imageGenerations: resolvedImageGenerations,
            componentPalette: extractPaletteStateFromMeta(meta),
            designThemePreset: extractDesignThemePresetFromMeta(meta),
            designReferences: summarizeDesignReferences(requestAttachments),
          });
          const ownSystemPrompt = ownOrchestration.engineSystemPrompt;

          const engineModel = resolveEngineModelId(resolvedModelTier, false);
          debugLog("engine", "Own engine model resolved", {
            resolvedModelTier,
            engineModel,
            fallback: false,
          });
          const model = getOpenAIModel(engineModel);
          const genResult = streamText({
            model,
            system: ownSystemPrompt,
            messages: [{ role: "user", content: buildUserPromptContent(optimizedMessage, requestAttachments) }],
            maxOutputTokens: ENGINE_MAX_OUTPUT_TOKENS,
          });

          const fullContent = await genResult.text;
          const usage = await genResult.usage;

          const resolvedProjectId = metaAppProjectId || projectId || "default";
          const chat = await createSqliteChat(
            resolvedProjectId,
            engineModel,
            ownSystemPrompt,
            ownOrchestration.resolvedScaffold?.id,
          );
          await addMessage(chat.id, "user", optimizedMessage);
          const assistantMsg = await addMessage(
            chat.id,
            "assistant",
            fullContent,
            usage?.outputTokens,
          );
          const version = await createVersionFromContent(chat.id, assistantMsg.id, fullContent);

          try {
            await creditCheck.commit();
          } catch (error) {
            console.error("[credits] Failed to charge prompt:", error);
          }

          devLogAppend("latest", {
            type: "comm.response.create.sync",
            chatId: chat.id,
            versionId: version.id,
            demoUrl: version.sandbox_url,
            durationMs: Date.now() - genStartedAt,
          });

          return attachSessionCookie(
            NextResponse.json({
              id: chat.id,
              internalChatId: chat.id,
              model: engineModel,
              latestVersion: {
                id: version.id,
                versionNumber: version.version_number,
                sandboxUrl: version.sandbox_url,
              },
              usage: {
                promptTokens: usage?.inputTokens ?? 0,
                completionTokens: usage?.outputTokens ?? 0,
              },
            }),
          );
        } catch (genErr) {
          devLogAppend("latest", {
            type: "comm.error.create.sync",
            message: genErr instanceof Error ? genErr.message : "Generation failed",
            engine: "own",
            durationMs: Date.now() - genStartedAt,
          });
          return attachSessionCookie(
            NextResponse.json(
              { error: genErr instanceof Error ? genErr.message : "Generation failed" },
              { status: 500 },
            ),
          );
        }
      }

      // ---------------------------------------------------------------
      // V0 fallback: existing v0 Platform API flow
      // ---------------------------------------------------------------
      assertV0Key();
      const result = await v0.chats.create({
        message: optimizedMessage,
        ...(hasSystemPrompt ? { system: trimmedSystemPrompt } : {}),
        projectId,
        chatPrivacy: resolvedChatPrivacy,
        modelConfiguration: {
          modelId: fallbackModelId,
          thinking: resolvedThinking,
          imageGenerations: resolvedImageGenerations,
        },
        ...(requestAttachments.length > 0 ? { attachments: requestAttachments } : {}),
        ...(designSystemId ? { designSystemId } : {}),
      } as unknown as Parameters<typeof v0.chats.create>[0] & { designSystemId?: string });

      let internalChatId: string | null = null;
      try {
        const chatResult =
          result && typeof result === "object" && "id" in result ? (result as Record<string, unknown>) : null;
        const v0ChatId: string | null = (chatResult?.id as string) || null;
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
        const v0ProjectId = resolveV0ProjectId({
          v0ChatId,
          chatDataProjectId: chatResult?.projectId as string | undefined,
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
          webUrl: (chatResult?.webUrl as string) || null,
        });

        const latestVersion = (chatResult?.latestVersion || null) as Record<string, unknown> | null;
        if (latestVersion) {
          const versionId = (latestVersion.id || latestVersion.versionId) as string | undefined;
          const demoUrl = (latestVersion.demoUrl || latestVersion.demo_url || null) as string | null;
          if (versionId) {
            await db.insert(versions).values({
              id: nanoid(),
              chatId: internalChatId,
              v0VersionId: versionId,
              v0MessageId: (latestVersion.messageId as string) || null,
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
