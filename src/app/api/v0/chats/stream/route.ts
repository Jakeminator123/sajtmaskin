import { createSSEHeaders, formatSSEEvent } from "@/lib/streaming";
import { db } from "@/lib/db/client";
import { chats, versions } from "@/lib/db/schema";
import { assertV0Key, v0 } from "@/lib/v0";
import { createChatSchema } from "@/lib/validations/chatSchemas";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import { normalizeV0Error } from "@/lib/v0/errors";
import { prepareCredits } from "@/lib/credits/server";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { WARN_CHAT_MESSAGE_CHARS, WARN_CHAT_SYSTEM_CHARS } from "@/lib/builder/promptLimits";
import { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";
import {
  ensureProjectForRequest,
  resolveV0ProjectId,
  generateProjectName,
  resolveAppProjectIdForRequest,
} from "@/lib/tenant";
import { requireNotBot } from "@/lib/botProtection";
import { devLogAppend, devLogStartNewSite } from "@/lib/logging/devLog";
import { debugLog, errorLog } from "@/lib/utils/debug";
import { sanitizeV0Metadata } from "@/lib/v0/sanitize-metadata";
import { createPromptLog } from "@/lib/db/services";
import { resolveModelSelection, resolveEngineModelId } from "@/lib/models/selection";
import { resolvePhaseModel } from "@/lib/models/phase-routing";
import {
  canonicalModelIdToOwnModelId,
  DEFAULT_MODEL_ID,
  MODEL_LABELS,
  getBuildProfileId,
} from "@/lib/models/catalog";
import { AI } from "@/lib/config";
import { shouldUseExplicitBuilderFallback, shouldUseV0Fallback, createGenerationPipeline } from "@/lib/gen/fallback";
import {
  buildContractClarificationQuestion,
  buildStoredContractClarificationUiPart,
} from "@/lib/gen/contract-clarification";
import { prepareGenerationContext } from "@/lib/gen/orchestrate";
import { buildPlannerSystemPrompt } from "@/lib/gen/plan-prompt";
import { getAgentTools } from "@/lib/gen/agent-tools";
import { compressUrls } from "@/lib/gen/url-compress";
import {
  buildPlanSummaryMessage,
  buildPlanUiPart,
} from "@/lib/gen/plan-review";
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
import { createOwnEnginePlanModeResponse } from "@/lib/providers/own-engine/plan-mode-response";
import { createOwnEngineGenerationStream } from "@/lib/providers/own-engine/generation-stream";
import { createV0FallbackStream } from "@/lib/providers/v0-fallback";

export const runtime = "nodejs";
export const maxDuration = 800;
const STREAM_RESOLVE_MAX_ATTEMPTS = 6;
const STREAM_RESOLVE_DELAY_MS = 1200;

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
      const fallbackModelId = resolveEngineModelId(resolvedModelTier, true);
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

      const usingV0Fallback = shouldUseExplicitBuilderFallback(meta);
      const buildProfileId = getBuildProfileId(resolvedModelTier);
      debugLog("build", "Chat stream request", {
        buildProfileId,
        buildProfileLabel: MODEL_LABELS[resolvedModelTier],
        internalModelSelection: resolvedModelTier,
        fallbackConfigured: shouldUseV0Fallback(),
        enginePath: usingV0Fallback ? "v0-fallback" : "own-engine",
        engineModel: usingV0Fallback
          ? fallbackModelId
          : canonicalModelIdToOwnModelId(resolvedModelTier),
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
        const planModel = resolvePhaseModel(resolvedModelTier, "planner").modelId;
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

        const planPreamble = buildPlannerSystemPrompt();
        const planSystemPrompt = `${planPreamble}\n\n---\n\n${planOrchestration.v0EnrichmentContext}`;
        const planTools = getAgentTools();

        debugLog("plan", "Plan mode activated (unified orchestration)", {
          model: planModel,
          promptLength: optimizedMessage.length,
          thinking: resolvedThinking,
          scaffold: planOrchestration.resolvedScaffold?.id ?? null,
        });
        devLogAppend("in-progress", {
          type: "plan.generation.start",
          model: planModel,
          promptLength: optimizedMessage.length,
          scaffold: planOrchestration.resolvedScaffold?.id ?? null,
        });

        const pipelineStream = createGenerationPipeline({
          prompt: optimizedMessage,
          systemPrompt: planSystemPrompt,
          model: planModel,
          thinking: resolvedThinking,
          abortSignal: req.signal,
          tools: planTools,
          maxSteps: 2,
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
          modelId: planModel,
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

      // ── New Engine Path ───────────────────────────────────────────────
      if (!usingV0Fallback) {
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

        const orchestration = await prepareGenerationContext({
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
        });
        const {
          resolvedScaffold,
          routePlan,
          preGenerationContracts,
          capabilities: engineCapabilities,
          engineSystemPrompt,
        } =
          orchestration;
        const contractClarification = buildContractClarificationQuestion({
          buildIntent: engineIntent,
          context: preGenerationContracts,
        });

        const promptLengths = getSystemPromptLengths(engineSystemPrompt);
        debugLog("prompt-cache", "System prompt lengths", promptLengths);

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
        if (contractClarification) {
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
          const contractGateStream = new ReadableStream({
            start(controller) {
              const enc = new TextEncoder();
              controller.enqueue(enc.encode(formatSSEEvent("chatId", { id: engineChat.id })));
              controller.enqueue(
                enc.encode(
                  formatSSEEvent("meta", {
                    modelId: engineModel,
                    modelTier: resolvedModelTier,
                    buildProfileId,
                    buildProfileLabel: MODEL_LABELS[resolvedModelTier],
                    enginePath: "own-engine",
                    thinking: resolvedThinking,
                    imageGenerations: resolvedImageGenerations,
                    chatPrivacy: resolvedChatPrivacy,
                    scaffoldId: resolvedScaffold?.id ?? null,
                    scaffoldFamily: resolvedScaffold?.family ?? null,
                    scaffoldLabel: resolvedScaffold?.label ?? null,
                    capabilities: engineCapabilities,
                    contractDataMode: preGenerationContracts.contracts.dataMode,
                    contractDatabaseProvider: preGenerationContracts.contracts.databaseProvider ?? null,
                    contractAuthProvider: preGenerationContracts.contracts.authProvider ?? null,
                    contractPaymentProvider: preGenerationContracts.contracts.paymentProvider ?? null,
                    contractIntegrations: preGenerationContracts.contracts.integrations,
                    contractEnvVars: preGenerationContracts.contracts.envVars,
                    unresolvedContractDecisions: preGenerationContracts.unresolvedDecisions,
                    promptStrategy: strategyMeta.strategy,
                    promptType: strategyMeta.promptType,
                    promptBudgetTarget: strategyMeta.budgetTarget,
                    promptOriginalLength: strategyMeta.originalLength,
                    promptOptimizedLength: strategyMeta.optimizedLength,
                    promptReductionRatio: strategyMeta.reductionRatio,
                    promptStrategyReason: strategyMeta.reason,
                    promptComplexityScore: strategyMeta.complexityScore,
                    systemPromptLength: engineSystemPrompt.length,
                    briefApplied: Boolean(metaBrief),
                    customInstructionsLength: trimmedSystemPrompt?.length ?? 0,
                  }),
                ),
              );
              controller.enqueue(
                enc.encode(
                  formatSSEEvent("tool-call", {
                    toolName: "askClarifyingQuestion",
                    toolCallId: `contracts-${Date.now()}`,
                    args: contractClarification,
                  }),
                ),
              );
              controller.enqueue(enc.encode(formatSSEEvent("content", contractClarification.question)));
              controller.enqueue(
                enc.encode(
                  formatSSEEvent("done", {
                    chatId: engineChat.id,
                    versionId: null,
                    messageId: assistantQuestion?.id ?? null,
                    demoUrl: null,
                    awaitingInput: true,
                    reason: "pre_generation_contracts",
                  }),
                ),
              );
              controller.close();
            },
          });
          return attachSessionCookie(new Response(contractGateStream, {
            headers: createSSEHeaders(),
          }));
        }
        const { compressed: enginePrompt, urlMap } = compressUrls(optimizedMessage);
        const agentTools = getAgentTools();
        const pipelineStream = createGenerationPipeline({
          prompt: enginePrompt,
          systemPrompt: engineSystemPrompt,
          model: engineModel,
          thinking: resolvedThinking,
          abortSignal: req.signal,
          tools: agentTools,
          maxSteps: 2,
          referenceAttachments: requestAttachments,
        });

        const engineStream = createOwnEngineGenerationStream({
          chatId: engineChat.id,
          pipelineStream,
          abortSignal: req.signal,
          meta: {
            modelId: engineModel,
            modelTier: resolvedModelTier,
            buildProfileId,
            buildProfileLabel: MODEL_LABELS[resolvedModelTier],
            enginePath: "own-engine",
            thinking: resolvedThinking,
            imageGenerations: resolvedImageGenerations,
            chatPrivacy: resolvedChatPrivacy,
            scaffoldId: resolvedScaffold?.id ?? null,
            scaffoldFamily: resolvedScaffold?.family ?? null,
            scaffoldLabel: resolvedScaffold?.label ?? null,
            capabilities: engineCapabilities,
            contractDataMode: preGenerationContracts.contracts.dataMode,
            contractDatabaseProvider: preGenerationContracts.contracts.databaseProvider ?? null,
            contractAuthProvider: preGenerationContracts.contracts.authProvider ?? null,
            contractPaymentProvider: preGenerationContracts.contracts.paymentProvider ?? null,
            contractIntegrations: preGenerationContracts.contracts.integrations,
            contractEnvVars: preGenerationContracts.contracts.envVars,
            unresolvedContractDecisions: preGenerationContracts.unresolvedDecisions,
            promptStrategy: strategyMeta.strategy,
            promptType: strategyMeta.promptType,
            promptBudgetTarget: strategyMeta.budgetTarget,
            promptOriginalLength: strategyMeta.originalLength,
            promptOptimizedLength: strategyMeta.optimizedLength,
            promptReductionRatio: strategyMeta.reductionRatio,
            promptStrategyReason: strategyMeta.reason,
            promptComplexityScore: strategyMeta.complexityScore,
            systemPromptLength: engineSystemPrompt.length,
            briefApplied: Boolean(metaBrief),
            customInstructionsLength: trimmedSystemPrompt?.length ?? 0,
          },
          engineModel,
          optimizedMessage,
          engineIntent,
          routePlan: routePlan ?? null,
          resolvedScaffold: resolvedScaffold ?? null,
          urlMap,
          commitCredits: commitCreditsOnce,
        });

        const engineHeaders = new Headers(createSSEHeaders());
        return attachSessionCookie(new Response(engineStream, { headers: engineHeaders }));
      }

      // ── V0 Fallback Path ──────────────────────────────────────────────
      assertV0Key();

      const generationStartedAt = Date.now();

      const v0ScaffoldSettings = extractScaffoldSettingsFromMeta(meta);
      const v0Orchestration = await prepareGenerationContext({
        prompt: optimizedMessage,
        buildIntent: (metaBuildIntent === "template" || metaBuildIntent === "website" || metaBuildIntent === "app"
          ? metaBuildIntent as BuildIntent
          : "website"),
        scaffoldMode: v0ScaffoldSettings.scaffoldMode,
        scaffoldId: v0ScaffoldSettings.scaffoldId,
        brief: extractBriefFromMeta(meta),
        themeColors: extractThemeColorsFromMeta(meta),
        imageGenerations: resolvedImageGenerations,
        componentPalette: extractPaletteStateFromMeta(meta),
        designThemePreset: extractDesignThemePresetFromMeta(meta),
        designReferences: summarizeDesignReferences(requestAttachments),
      });

      const v0SystemPrompt = [
        trimmedSystemPrompt,
        v0Orchestration.v0EnrichmentContext,
      ].filter(Boolean).join("\n\n---\n\n");

      const result = await v0.chats.create({
        message: optimizedMessage,
        ...(v0SystemPrompt ? { system: v0SystemPrompt } : {}),
        projectId,
        chatPrivacy: resolvedChatPrivacy,
        modelConfiguration: {
          modelId: fallbackModelId,
          thinking: resolvedThinking,
          imageGenerations: resolvedImageGenerations,
        },
        responseMode: "experimental_stream",
        ...(requestAttachments.length > 0 ? { attachments: requestAttachments } : {}),
        ...(designSystemId ? { designSystemId } : {}),
      } as unknown as Parameters<typeof v0.chats.create>[0] & { responseMode?: string; designSystemId?: string });

      if (result && typeof (result as unknown as { getReader?: unknown }).getReader === "function") {
        const stream = createV0FallbackStream({
          v0Stream: result as unknown as ReadableStream<Uint8Array>,
          signal: req.signal,
          requestId,
          metaPayload: {
            modelId: resolvedModelId,
            modelTier: resolvedModelTier,
            buildProfileId,
            buildProfileLabel: MODEL_LABELS[resolvedModelTier],
            enginePath: "v0-fallback",
            thinking: resolvedThinking,
            imageGenerations: resolvedImageGenerations,
            chatPrivacy: resolvedChatPrivacy,
            promptStrategy: strategyMeta.strategy,
            promptType: strategyMeta.promptType,
            promptBudgetTarget: strategyMeta.budgetTarget,
            promptOriginalLength: strategyMeta.originalLength,
            promptOptimizedLength: strategyMeta.optimizedLength,
            promptReductionRatio: strategyMeta.reductionRatio,
            promptStrategyReason: strategyMeta.reason,
            promptComplexityScore: strategyMeta.complexityScore,
          },
          identity: {
            mode: "create",
            req,
            sessionId,
            clientProjectId: projectId,
          },
          generationStartedAt,
          commitCredits: commitCreditsOnce,
        });
        return attachSessionCookie(new Response(stream, { headers: createSSEHeaders() }));
      }

      const chatData = result as Record<string, unknown>;
      const chatDataLatest = (typeof chatData?.latestVersion === "object" && chatData.latestVersion
        ? chatData.latestVersion
        : {}) as Record<string, unknown>;

      try {
        const internalChatId = nanoid();
        const v0ChatId = chatData.id as string;
        const v0ProjectId = resolveV0ProjectId({
          v0ChatId,
          chatDataProjectId: chatData.projectId as string | undefined,
          clientProjectId: projectId,
        });
        const projectName = generateProjectName({
          v0ChatId: v0ChatId as string,
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
          v0ChatId: v0ChatId as string,
          v0ProjectId: v0ProjectId as string,
          projectId: internalProjectId,
          webUrl: (chatData.webUrl as string) || null,
        });

        if (chatDataLatest && Object.keys(chatDataLatest).length > 0) {
          await db.insert(versions).values({
            id: nanoid(),
            chatId: internalChatId,
            v0VersionId: (chatDataLatest.id || chatDataLatest.versionId) as string,
            v0MessageId: (chatDataLatest.messageId as string) || null,
            demoUrl: (chatDataLatest.demoUrl as string) || null,
            metadata: sanitizeV0Metadata(chatDataLatest),
          });
        }
      } catch (dbError) {
        console.error("Failed to save chat to database:", dbError);
      }

      await commitCreditsOnce();
      devLogAppend("latest", {
        type: "comm.response.create",
        chatId: chatData?.id || null,
        versionId: chatDataLatest?.id || chatDataLatest?.versionId || null,
        demoUrl: chatDataLatest?.demoUrl || null,
        assistantPreview:
          (typeof chatDataLatest?.content === "string" && chatDataLatest.content) ||
          (typeof chatDataLatest?.text === "string" && chatDataLatest.text) ||
          null,
      });
      return attachSessionCookie(
        NextResponse.json({
          ...chatData,
          meta: {
            modelId: resolvedModelId,
            modelTier: resolvedModelTier,
            thinking: resolvedThinking,
            imageGenerations: resolvedImageGenerations,
            chatPrivacy: resolvedChatPrivacy,
          },
        }),
      );
    } catch (err) {
      errorLog("v0", `Create chat error (requestId=${requestId})`, err);
      const normalized = normalizeV0Error(err);
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
