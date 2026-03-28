import { createSSEHeaders } from "@/lib/streaming";
import { createChatSchema } from "@/lib/validations/chatSchemas";
import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import { normalizeProviderError } from "@/lib/providers/errors/normalize-provider-error";
import { prepareCredits } from "@/lib/credits/server";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { WARN_CHAT_MESSAGE_CHARS, WARN_CHAT_SYSTEM_CHARS } from "@/lib/builder/promptLimits";
import { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";
import { resolveAppProjectIdForRequest } from "@/lib/tenant";
import { requireNotBot } from "@/lib/botProtection";
import { devLogAppend, devLogStartNewSite } from "@/lib/logging/devLog";
import { debugLog, errorLog } from "@/lib/utils/debug";
import { createPromptLog } from "@/lib/db/services";
import { resolveModelSelection, resolveEngineModelId } from "@/lib/models/selection";
import {
  canonicalModelIdToOwnModelId,
  DEFAULT_MODEL_ID,
  MODEL_LABELS,
  getBuildProfileId,
} from "@/lib/models/catalog";
import {
  buildContractClarificationQuestion,
  buildStoredContractClarificationUiPart,
} from "@/lib/gen/contract-clarification";
import {
  finalizeOrchestrationPrompts,
  prepareGenerationContext,
  resolveOrchestrationBase,
} from "@/lib/gen/orchestrate";
import { computeLineageHash } from "@/lib/gen/generation-input-package";
import { compressUrls } from "@/lib/gen/url-compress";
import {
  buildPlanSummaryMessage,
  buildPlanUiPart,
} from "@/lib/gen/plan-review";
import { dumpOwnEngineCodegenFromFullSystem } from "@/lib/gen/prompt-dump";
import { getSystemPromptLengths } from "@/lib/gen/system-prompt";
import {
  extractAppProjectIdFromMeta,
  extractBriefFromMeta,
  extractDesignThemePresetFromMeta,
  extractPaletteStateFromMeta,
  extractScaffoldSettingsFromMeta,
  extractThemeColorsFromMeta,
  normalizeRequestAttachments,
  summarizeDesignReferences,
} from "@/lib/gen/request-metadata";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import type { BuildIntent } from "@/lib/builder/build-intent";
import {
  buildOwnEngineGenerationStreamMeta,
  buildPreGenerationContractGateParams,
} from "@/lib/own-engine/session/own-engine-build-session";
import { createOwnEnginePipelineAndGenerationStream } from "@/lib/own-engine/session/own-engine-pipeline-generation";
import {
  computePlanModePlannerPrompts,
  createPlanModePipelineStream,
  dumpPlanModePlannerPrompts,
  logPlanModeGenerationStart,
  resolvePlanModePlannerModelId,
} from "@/lib/own-engine/session/own-engine-plan-mode";
import { createOwnEnginePlanModeResponse } from "@/lib/providers/own-engine/plan-mode-response";
import { createPreGenerationContractGateReadableStream } from "@/lib/providers/own-engine/pre-generation-contract-gate";

export const runtime = "nodejs";
/** Server stream ceiling (seconds). Client stream safety timeout is separate — see `[chatId]/stream` route comment. */
export const maxDuration = 800;

export async function POST(req: Request) {
  const requestId = req.headers.get("x-vercel-id") || "unknown";
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
        thinking = true,
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
      const metaPlanMode =
        (meta as { planMode?: unknown })?.planMode === true;
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
        devLogAppend("in-progress", {
          type: "prompt.size.warning",
          messageLength: optimizedMessage.length,
          originalMessageLength: message.length,
          systemLength: trimmedSystemPrompt.length,
          warnMessageChars: WARN_CHAT_MESSAGE_CHARS,
          warnSystemChars: WARN_CHAT_SYSTEM_CHARS,
        });
      }
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
      const creditUser = creditCheck.user;
      let didChargeCredits = false;
      const commitCreditsOnce = async () => {
        if (didChargeCredits) return;
        didChargeCredits = true;
        try {
          await creditCheck.commit();
        } catch (error) {
          console.error("[credits] Failed to charge prompt:", error);
        }
      };

      try {
        const metaPayload =
          meta && typeof meta === "object"
            ? (() => {
                const copy = { ...(meta as Record<string, unknown>) };
                delete copy.promptOriginal;
                delete copy.promptFormatted;
                copy.promptStrategy = strategyMeta.strategy;
                copy.promptType = strategyMeta.promptType;
                copy.promptBudgetTarget = strategyMeta.budgetTarget;
                copy.promptOptimizedLength = strategyMeta.optimizedLength;
                copy.promptReductionRatio = strategyMeta.reductionRatio;
                copy.promptStrategyReason = strategyMeta.reason;
                copy.promptComplexityScore = strategyMeta.complexityScore;
                return Object.keys(copy).length > 0 ? copy : null;
              })()
            : {
                promptStrategy: strategyMeta.strategy,
                promptType: strategyMeta.promptType,
                promptBudgetTarget: strategyMeta.budgetTarget,
                promptOptimizedLength: strategyMeta.optimizedLength,
                promptReductionRatio: strategyMeta.reductionRatio,
                promptStrategyReason: strategyMeta.reason,
                promptComplexityScore: strategyMeta.complexityScore,
              };
        const promptOriginal =
          typeof (meta as { promptOriginal?: unknown })?.promptOriginal === "string"
            ? String((meta as { promptOriginal?: string }).promptOriginal)
            : typeof message === "string"
              ? message
              : null;
        const promptFormatted =
          typeof (meta as { promptFormatted?: unknown })?.promptFormatted === "string"
            ? String((meta as { promptFormatted?: string }).promptFormatted)
            : typeof optimizedMessage === "string"
              ? optimizedMessage
              : null;
        await createPromptLog({
          event: "create_chat",
          userId: creditUser?.id || null,
          sessionId,
          appProjectId: metaAppProjectId || null,
          v0ProjectId: projectId ?? null,
          chatId: null,
          promptOriginal,
          promptFormatted,
          systemPrompt: trimmedSystemPrompt || null,
          promptAssistModel:
            typeof (meta as { promptAssistModel?: unknown })?.promptAssistModel === "string"
              ? String((meta as { promptAssistModel?: string }).promptAssistModel)
              : null,
          promptAssistDeep:
            typeof (meta as { promptAssistDeep?: unknown })?.promptAssistDeep === "boolean"
              ? Boolean((meta as { promptAssistDeep?: boolean }).promptAssistDeep)
              : null,
          promptAssistMode:
            typeof (meta as { promptAssistMode?: unknown })?.promptAssistMode === "string"
              ? String((meta as { promptAssistMode?: string }).promptAssistMode)
              : null,
          buildIntent: metaBuildIntent,
          buildMethod: metaBuildMethod,
          modelTier: resolvedModelTier,
          imageGenerations: resolvedImageGenerations,
          thinking: resolvedThinking,
          attachmentsCount: requestAttachments.length,
          meta: metaPayload,
        });
      } catch (error) {
        console.warn("[prompt-log] Failed to record prompt log:", error);
      }

      const buildProfileId = getBuildProfileId(resolvedModelTier);
      debugLog("build", "Chat stream request", {
        buildProfileId,
        buildProfileLabel: MODEL_LABELS[resolvedModelTier],
        internalModelSelection: resolvedModelTier,
        enginePath: "own-engine",
        engineModel: canonicalModelIdToOwnModelId(resolvedModelTier),
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
      devLogAppend("in-progress", {
        type: "comm.request.create",
        modelId: resolvedModelId,
        chatPrivacy: resolvedChatPrivacy,
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
      });

      devLogStartNewSite({
        message: optimizedMessage,
        modelId: resolvedModelId,
        thinking: resolvedThinking,
        imageGenerations: resolvedImageGenerations,
        projectId,
        slug: metaBuildMethod || metaBuildIntent || undefined,
      });

      // ── Plan Mode Path ────────────────────────────────────────────────
      if (metaPlanMode) {
        const planModel = resolvePlanModePlannerModelId(resolvedModelTier);
        const engineIntent: BuildIntent =
          metaBuildIntent === "template" || metaBuildIntent === "website" || metaBuildIntent === "app"
            ? (metaBuildIntent as BuildIntent)
            : "website";
        const planScaffoldMode =
          typeof (meta as Record<string, unknown>)?.scaffoldMode === "string"
            ? (String((meta as Record<string, string>).scaffoldMode) as "auto" | "manual" | "off")
            : "auto";

        const planOrchestration = await prepareGenerationContext({
          prompt: optimizedMessage,
          buildIntent: engineIntent,
          scaffoldMode: planScaffoldMode,
          scaffoldId: typeof (meta as Record<string, unknown>)?.scaffoldId === "string"
            ? String((meta as Record<string, string>).scaffoldId)
            : null,
          brief: (() => {
            const raw = (meta as Record<string, unknown>)?.brief;
            return raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
          })(),
          themeColors: (() => {
            const raw = (meta as Record<string, unknown>)?.themeColors;
            if (!raw || typeof raw !== "object") return null;
            const tc = raw as Record<string, unknown>;
            if (typeof tc.primary === "string" && typeof tc.secondary === "string" && typeof tc.accent === "string") {
              return { primary: tc.primary, secondary: tc.secondary, accent: tc.accent };
            }
            return null;
          })(),
        });

        const { planPreamble, planSystemPrompt } = computePlanModePlannerPrompts(planOrchestration);
        dumpPlanModePlannerPrompts(
          planPreamble,
          planOrchestration,
          planSystemPrompt,
          "POST /api/v0/chats/stream",
        );
        logPlanModeGenerationStart({
          planModel,
          promptLength: optimizedMessage.length,
          scaffoldId: planOrchestration.resolvedScaffold?.id ?? null,
          resolvedThinking,
        });

        const pipelineStream = createPlanModePipelineStream({
          optimizedMessage,
          planSystemPrompt,
          planModel,
          resolvedThinking,
          abortSignal: req.signal,
        });

        const projectIdForChat = await resolveAppProjectIdForRequest(
          req,
          { appProjectId: metaAppProjectId, projectId },
          { sessionId },
        );
        if (!projectIdForChat) {
          return attachSessionCookie(
            NextResponse.json(
              {
                error:
                  "Plan mode requires a valid app project id. Create or resolve a project before retrying.",
              },
              { status: 400 },
            ),
          );
        }
        const plannerChat = await chatRepo.createChat(
          projectIdForChat,
          planModel,
          planSystemPrompt,
          planOrchestration.resolvedScaffold?.id,
        );
        await chatRepo.addMessage(plannerChat.id, "user", optimizedMessage);

        return attachSessionCookie(createOwnEnginePlanModeResponse({
          pipelineStream,
          chatId: plannerChat.id,
          modelTier: resolvedModelTier,
          buildProfileId,
          buildProfileLabel: MODEL_LABELS[resolvedModelTier],
          thinking: resolvedThinking,
          promptStrategyMeta: strategyMeta,
          resolvedScaffold: planOrchestration.resolvedScaffold,
          scaffoldMode: planScaffoldMode,
          onResolved: (planData, hasBlockers, accumulatedContent) => {
            const blockerCount = Array.isArray(planData?.blockers)
              ? (planData.blockers as unknown[]).length
              : 0;
            const stepCount = Array.isArray(planData?.steps)
              ? (planData.steps as unknown[]).length
              : 0;
            const assumptionCount = Array.isArray(planData?.assumptions)
              ? (planData.assumptions as unknown[]).length
              : 0;

            devLogAppend("in-progress", {
              type: "plan.generation.done",
              parsed: planData !== null,
              steps: stepCount,
              blockers: blockerCount,
              assumptions: assumptionCount,
              awaitingInput: hasBlockers,
              contentLength: accumulatedContent.length,
            });
          },
          persistAssistantSummary: async (planData, hasBlockers) => {
            try {
              const storedPlanPart = buildPlanUiPart(planData);
              await chatRepo.addMessage(
                plannerChat.id,
                "assistant",
                buildPlanSummaryMessage(planData, hasBlockers),
                undefined,
                storedPlanPart ? [storedPlanPart] : undefined,
              );
            } catch (error) {
              console.warn("[plan] Failed to persist planner assistant summary:", error);
            }
          },
          buildDonePayload: (planData, hasBlockers) => ({
            chatId: plannerChat.id,
            planArtifact: planData,
            awaitingInput: hasBlockers,
            planMode: true,
          }),
          commitCredits: commitCreditsOnce,
          commitCreditsPosition: "before-done",
        }));
      }

      // ── Own Engine Path ───────────────────────────────────────────────
      {
        const engineIntent: BuildIntent =
          metaBuildIntent === "template" || metaBuildIntent === "website" || metaBuildIntent === "app"
            ? (metaBuildIntent as BuildIntent)
            : "website";
        const { scaffoldMode: metaScaffoldMode, scaffoldId: metaScaffoldId } =
          extractScaffoldSettingsFromMeta(meta);
        const metaThemeColors = extractThemeColorsFromMeta(meta);
        const metaBrief = extractBriefFromMeta(meta);
        const metaDesignThemePreset = extractDesignThemePresetFromMeta(meta);
        const metaPalette = extractPaletteStateFromMeta(meta);
        const designReferences = summarizeDesignReferences(requestAttachments);

        const orchestrationInput = {
          prompt: optimizedMessage,
          buildIntent: engineIntent,
          scaffoldMode: metaScaffoldMode,
          scaffoldId: metaScaffoldId,
          brief: metaBrief,
          themeColors: metaThemeColors,
          imageGenerations: resolvedImageGenerations,
          componentPalette: metaPalette,
          designThemePreset: metaDesignThemePreset,
          designReferences,
          customInstructions: trimmedSystemPrompt || undefined,
        };
        const orchestrationBase = await resolveOrchestrationBase(orchestrationInput);
        const {
          resolvedScaffold,
          routePlan,
          preGenerationContracts,
          capabilities: engineCapabilities,
        } = orchestrationBase;
        const contractClarification = buildContractClarificationQuestion({
          buildIntent: engineIntent,
          context: preGenerationContracts,
        });

        const engineModel = resolveEngineModelId(resolvedModelTier, false);
        debugLog("engine", "Own engine model resolved", {
          resolvedModelTier,
          engineModel,
          fallback: false,
        });

        const projectIdForChat = await resolveAppProjectIdForRequest(
          req,
          { appProjectId: metaAppProjectId, projectId },
          { sessionId },
        );
        if (!projectIdForChat) {
          return attachSessionCookie(
            NextResponse.json(
              {
                error:
                  "Own-engine generation requires a valid app project id. Create or resolve a project before retrying.",
              },
              { status: 400 },
            ),
          );
        }
        if (contractClarification) {
          const engineChat = await chatRepo.createChat(
            projectIdForChat,
            engineModel,
            undefined,
            resolvedScaffold?.id,
          );
          await chatRepo.addMessage(engineChat.id, "user", optimizedMessage);
          devLogAppend("in-progress", {
            type: "contracts.inferred",
            chatId: engineChat.id,
            dataMode: preGenerationContracts.contracts.dataMode,
            databaseProvider: preGenerationContracts.contracts.databaseProvider ?? null,
            authProvider: preGenerationContracts.contracts.authProvider ?? null,
            paymentProvider: preGenerationContracts.contracts.paymentProvider ?? null,
            integrations: preGenerationContracts.contracts.integrations.map((entry) => entry.provider),
            envVars: preGenerationContracts.contracts.envVars.map((entry) => entry.key),
            unresolvedDecisions: preGenerationContracts.unresolvedDecisions.map((entry) => entry.kind),
          });
          const assistantQuestion = await chatRepo.addMessage(
            engineChat.id,
            "assistant",
            contractClarification.question,
            undefined,
            [buildStoredContractClarificationUiPart(contractClarification)],
          ).catch(() => null);
          devLogAppend("in-progress", {
            type: "contracts.clarification-requested",
            chatId: engineChat.id,
            kind: contractClarification.kind,
            reason: contractClarification.reason,
          });
          const contractGateStream = createPreGenerationContractGateReadableStream(
            buildPreGenerationContractGateParams({
              routeVariant: "new-chat",
              sseChatId: engineChat.id,
              assistantMessageId: assistantQuestion?.id ?? null,
              contractClarification,
              preGenerationContracts,
              engineModel,
              resolvedModelTier,
              buildProfileId,
              buildProfileLabel: MODEL_LABELS[resolvedModelTier],
              resolvedThinking,
              resolvedImageGenerations,
              resolvedScaffold,
              strategyMeta,
              metaBriefApplied: Boolean(metaBrief),
              customInstructionsLength: trimmedSystemPrompt?.length ?? 0,
              chatPrivacy: resolvedChatPrivacy,
              scaffoldLabel: resolvedScaffold?.label ?? null,
              capabilities: engineCapabilities,
            }),
          );
          return attachSessionCookie(new Response(contractGateStream, {
            headers: createSSEHeaders(),
          }));
        }
        const { engineSystemPrompt } = await finalizeOrchestrationPrompts(
          orchestrationBase,
          orchestrationInput,
        );
        const lineageHash = computeLineageHash({
          userPrompt: optimizedMessage,
          brief: metaBrief,
          scaffoldMode: metaScaffoldMode ?? "auto",
          scaffoldContext: orchestrationBase.scaffoldContext,
          routePlan: orchestrationBase.routePlan,
          preGenerationContracts: orchestrationBase.preGenerationContracts,
          capabilityHints: orchestrationBase.scaffoldAndCapability,
        });
        dumpOwnEngineCodegenFromFullSystem(engineSystemPrompt, {
          route: "POST /api/v0/chats/stream",
          planMode: false,
        });
        const promptLengths = getSystemPromptLengths(engineSystemPrompt);
        debugLog("prompt-cache", "System prompt lengths", promptLengths);

        const engineChat = await chatRepo.createChat(
          projectIdForChat,
          engineModel,
          engineSystemPrompt,
          resolvedScaffold?.id,
        );
        await chatRepo.addMessage(engineChat.id, "user", optimizedMessage);
        devLogAppend("in-progress", {
          type: "contracts.inferred",
          chatId: engineChat.id,
          dataMode: preGenerationContracts.contracts.dataMode,
          databaseProvider: preGenerationContracts.contracts.databaseProvider ?? null,
          authProvider: preGenerationContracts.contracts.authProvider ?? null,
          paymentProvider: preGenerationContracts.contracts.paymentProvider ?? null,
          integrations: preGenerationContracts.contracts.integrations.map((entry) => entry.provider),
          envVars: preGenerationContracts.contracts.envVars.map((entry) => entry.key),
          unresolvedDecisions: preGenerationContracts.unresolvedDecisions.map((entry) => entry.kind),
        });
        const { compressed: enginePrompt, urlMap } = compressUrls(optimizedMessage);
        const engineStream = createOwnEnginePipelineAndGenerationStream({
          chatId: engineChat.id,
          pipeline: {
            prompt: enginePrompt,
            systemPrompt: engineSystemPrompt,
            model: engineModel,
            thinking: resolvedThinking,
            abortSignal: req.signal,
            maxSteps: 2,
            referenceAttachments: requestAttachments,
          },
          meta: buildOwnEngineGenerationStreamMeta({
            routeVariant: "new-chat",
            chatPrivacy: resolvedChatPrivacy,
            scaffoldLabel: resolvedScaffold?.label ?? null,
            engineModel,
            resolvedModelTier,
            buildProfileId,
            buildProfileLabel: MODEL_LABELS[resolvedModelTier],
            resolvedThinking,
            resolvedImageGenerations,
            strategyMeta,
            orchestrationBase,
            engineSystemPromptLength: engineSystemPrompt.length,
            metaBriefApplied: Boolean(metaBrief),
            customInstructionsLength: trimmedSystemPrompt?.length ?? 0,
            scaffoldId: resolvedScaffold?.id ?? null,
            scaffoldFamily: resolvedScaffold?.family ?? null,
          }),
          engineModel,
          optimizedMessage,
          engineIntent,
          routePlan: routePlan ?? null,
          resolvedScaffold: resolvedScaffold ?? null,
          lineageHash,
          urlMap,
          commitCredits: commitCreditsOnce,
        });

        const engineHeaders = new Headers(createSSEHeaders());
        return attachSessionCookie(new Response(engineStream, { headers: engineHeaders }));
      }
    } catch (err) {
      errorLog("v0", `Create chat error (requestId=${requestId})`, err);
      const normalized = normalizeProviderError(err);
      devLogAppend("latest", {
        type: "comm.error.create",
        message: normalized.message,
        code: normalized.code,
      });
      return attachSessionCookie(
        NextResponse.json(
          {
            error: normalized.message,
            code: normalized.code,
            retryAfter: normalized.retryAfter ?? null,
          },
          { status: normalized.status },
        ),
      );
    }
  });
}
