import { NextResponse } from "next/server";
import { createChatSchema } from "@/lib/validations/chatSchemas";
import { withRateLimit } from "@/lib/rateLimit";
import {
  getAppProjectByIdForRequest,
  resolveAppProjectIdForRequest,
} from "@/lib/tenant";
import { requireNotBot } from "@/lib/botProtection";
import { debugLog } from "@/lib/utils/debug";
import { devLogAppend } from "@/lib/logging/devLog";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { prepareCredits } from "@/lib/credits/server";
import { WARN_CHAT_MESSAGE_CHARS, WARN_CHAT_SYSTEM_CHARS } from "@/lib/builder/promptLimits";
import { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";
import { resolveModelSelection, resolveEngineModelId } from "@/lib/models/selection";
import { DEFAULT_MODEL_ID, MODEL_LABELS, getBuildProfileId } from "@/lib/models/catalog";
import { ENGINE_MAX_OUTPUT_TOKENS } from "@/lib/gen/defaults";
import {
  createChat as createSqliteChat,
  addMessage,
  listChatsByProject,
} from "@/lib/db/chat-repository-pg";
import { prepareGenerationContext } from "@/lib/gen/orchestrate";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { dumpOwnEngineCodegenFromFullSystem } from "@/lib/gen/prompt-dump";
import { finalizeAndSaveVersion } from "@/lib/gen/stream/finalize-version";
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
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ chats: [] });
    }
    const ownedProject = await getAppProjectByIdForRequest(req, projectId);
    if (!ownedProject) {
      return NextResponse.json({ chats: [] });
    }
    const chatList = await listChatsByProject(ownedProject.id);
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
        meta,
      } = validationResult.data;
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
      const resolvedModelId = modelSelection.modelId;
      const resolvedModelTier = modelSelection.modelTier;
      const buildProfileId = getBuildProfileId(resolvedModelTier);

      const metaBuildMethod =
        typeof (meta as { buildMethod?: unknown })?.buildMethod === "string"
          ? (meta as { buildMethod?: string }).buildMethod
          : null;
      const metaBuildIntent =
        typeof (meta as { buildIntent?: unknown })?.buildIntent === "string"
          ? (meta as { buildIntent?: string }).buildIntent
          : null;
      const metaPromptSourceKind =
        typeof (meta as { promptSourceKind?: unknown })?.promptSourceKind === "string"
          ? (meta as { promptSourceKind?: string }).promptSourceKind
          : null;
      const metaPromptSourceTechnical =
        (meta as { promptSourceTechnical?: unknown })?.promptSourceTechnical === true;
      const metaPromptSourcePreservePayload =
        (meta as { promptSourcePreservePayload?: unknown })?.promptSourcePreservePayload === true;
      const metaAppProjectId = extractAppProjectIdFromMeta(meta);
      const promptOrchestration = orchestratePromptMessage({
        message,
        buildMethod: metaBuildMethod,
        buildIntent: metaBuildIntent,
        isFirstPrompt: true,
        attachmentsCount: requestAttachments.length,
        promptSourceKind: metaPromptSourceKind,
        promptSourceTechnical: metaPromptSourceTechnical,
        promptSourcePreservePayload: metaPromptSourcePreservePayload,
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
        enginePath: "own-engine",
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
      // Generate via own engine, persist in Postgres
      // ---------------------------------------------------------------
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
          dumpOwnEngineCodegenFromFullSystem(ownSystemPrompt, {
            route: "POST /api/v0/chats (sync create)",
            planMode: false,
          });

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

          const resolvedProjectId = await resolveAppProjectIdForRequest(req, {
            appProjectId: metaAppProjectId,
            projectId,
          });
          if (!resolvedProjectId) {
            throw new Error(
              "Own-engine chat creation requires a valid app project id. Create or resolve a project before retrying.",
            );
          }
          const chat = await createSqliteChat(
            resolvedProjectId,
            engineModel,
            ownSystemPrompt,
            ownOrchestration.resolvedScaffold?.id,
          );
          await addMessage(chat.id, "user", message);
          const finalized = await finalizeAndSaveVersion({
            accumulatedContent: fullContent,
            chatId: chat.id,
            model: engineModel,
            resolvedScaffold: ownOrchestration.resolvedScaffold,
            urlMap: {},
            startedAt: genStartedAt,
            tokenUsage: {
              prompt: usage?.inputTokens,
              completion: usage?.outputTokens,
            },
            logNote: "Done from sync create",
            lineageHash: ownOrchestration.lineageHash,
          });
          const latestVersion = finalized.version;
          const verificationState = finalized.preflight.verificationBlocked
            ? "failed"
            : latestVersion.verification_state;
          const verificationSummary = finalized.preflight.verificationBlocked
            ? finalized.preflight.previewBlockingReason ||
              "Automatic preflight found verification-blocking issues."
            : latestVersion.verification_summary;

          try {
            await creditCheck.commit();
          } catch (error) {
            console.error("[credits] Failed to charge prompt:", error);
          }

          devLogAppend("latest", {
            type: "comm.response.create.sync",
            chatId: chat.id,
            versionId: latestVersion.id,
            previewUrl: finalized.previewUrl,
            durationMs: Date.now() - genStartedAt,
          });

          return attachSessionCookie(
            NextResponse.json({
              id: chat.id,
              internalChatId: chat.id,
              model: engineModel,
              ...previewUrlField(finalized.previewUrl),
              preflight: finalized.preflight,
              previewBlocked: finalized.preflight.previewBlocked,
              verificationBlocked: finalized.preflight.verificationBlocked,
              previewBlockingReason: finalized.preflight.previewBlockingReason,
              latestVersion: {
                id: latestVersion.id,
                versionId: latestVersion.id,
                versionNumber: latestVersion.version_number,
                messageId: finalized.messageId,
                ...previewUrlField(finalized.previewUrl),
                sandboxUrl: latestVersion.sandbox_url,
                releaseState: latestVersion.release_state,
                verificationState,
                verificationSummary,
                promotedAt: latestVersion.promoted_at,
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
