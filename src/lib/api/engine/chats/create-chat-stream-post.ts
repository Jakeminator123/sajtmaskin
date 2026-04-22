import { createSSEHeaders } from "@/lib/streaming";
import {
  withPromptToDoneMetricResponse,
  wrapStreamForPromptToDoneMetric,
} from "@/lib/observability/prompt-to-done-stream";
import { createChatSchema } from "@/lib/validations/chatSchemas";
import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import { prepareCredits } from "@/lib/credits/server";
import { buildEngineStreamResponse, buildStreamErrorResponse } from "./stream-error-response";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import {
  MAX_PROMPT_HANDOFF_CHARS,
  WARN_CHAT_MESSAGE_CHARS,
  WARN_CHAT_SYSTEM_CHARS,
} from "@/lib/builder/promptLimits";
import { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";
import { shouldRunServerAutoBrief } from "@/lib/builder/server-auto-brief-policy";
import { tryGenerateServerAutoBrief } from "@/lib/builder/site-brief-generation";
import { resolveAppProjectIdForRequest } from "@/lib/tenant";
import { requireNotBot } from "@/lib/botProtection";
import { devLogAppend, devLogStartNewSite } from "@/lib/logging/devLog";
import { debugLog } from "@/lib/utils/debug";
import { createPromptLog } from "@/lib/db/services/prompt-logs";
import { resolveModelSelection, resolveEngineModelId } from "@/lib/models/selection";
import {
  canonicalModelIdToOwnModelId,
  DEFAULT_MODEL_ID,
  MODEL_LABELS,
  getBuildProfileId,
} from "@/lib/models/catalog";
import { resolvePhaseThinking } from "@/lib/models/phase-routing";
import {
  buildContractClarificationQuestion,
  buildStoredContractClarificationUiPart,
} from "@/lib/gen/contract/clarification";
import {
  buildGenerationInputPackage,
  finalizeOrchestrationPrompts,
  prepareGenerationContext,
  resolveOrchestrationBase,
  writeOrchestrationDynamicDump,
} from "@/lib/gen/orchestrate";
import { getDefaultThinkingEnabled } from "@/lib/gen/default-thinking";
import { compressUrls } from "@/lib/gen/url-compress";
import {
  buildPlanSummaryMessage,
  buildPlanUiPart,
} from "@/lib/gen/plan/review";
import { dumpOwnEngineCodegenFromFullSystem } from "@/lib/gen/prompt-dump";
import { getSystemPromptLengths } from "@/lib/gen/system-prompt";
import {
  normalizeRequestAttachments,
  summarizeDesignReferences,
} from "@/lib/gen/request-metadata";
import { parseChatRequestMeta } from "./parse-chat-request-meta";
import { createCommitCreditsOnce } from "./credits-handler";
import { appendHydratedTextAttachmentExcerpts } from "@/lib/gen/attachment-text-hydrate";
import { resolveOwnEngineMaxSteps } from "@/lib/own-engine/resolve-max-steps";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { isAppScaffold } from "@/lib/builder/build-intent";
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
  resolvePlanModePlannerSettings,
} from "@/lib/own-engine/session/own-engine-plan-mode";
import { createOwnEnginePlanModeResponse } from "@/lib/providers/own-engine/plan-mode-response";
import { createPreGenerationContractGateReadableStream } from "@/lib/providers/own-engine/pre-generation-contract-gate";
import { matchScaffold } from "@/lib/gen/scaffolds/matcher";
import { getScaffoldById } from "@/lib/gen/scaffolds/registry";
import { pickScaffoldVariant } from "@/lib/gen/scaffold-variants";
import {
  buildVariantHintsForBrief,
  formatVariantHintsForPrompt,
} from "@/lib/gen/scaffold-variants/variant-hints";

/** Shared create handler (SSE). Used by `POST` and by sync `POST /chats` JSON adapter. */
export async function handleCreateChatStreamPost(req: Request): Promise<Response> {
  return withRateLimit(req, "chat:create", async () => {
    const requestStartedAt = Date.now();
    const requestId = req.headers.get("x-vercel-id") || "unknown";
    const session = ensureSessionIdFromRequest(req);
    const sessionId = session.sessionId;
    const attachSessionCookie = (response: Response) => {
      if (session.setCookie) {
        response.headers.set("Set-Cookie", session.setCookie);
      }
      return response;
    };
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
      const parsedMeta = parseChatRequestMeta(meta);
      const modelSelection = resolveModelSelection({
        requestedModelId: modelId,
        requestedModelTier: parsedMeta.modelTier,
        fallbackTier: DEFAULT_MODEL_ID,
      });
      const resolvedModelId = modelSelection.modelId;
      const resolvedModelTier = modelSelection.modelTier;
      const metaBuildMethod = parsedMeta.buildMethod;
      const metaBuildIntent = parsedMeta.buildIntent;
      const metaPromptSourceKind = parsedMeta.promptSourceKind;
      const metaPromptSourceTechnical = parsedMeta.promptSourceTechnical;
      const metaPromptSourcePreservePayload = parsedMeta.promptSourcePreservePayload;
      const metaPlanMode = parsedMeta.planMode;
      const metaAppProjectId = parsedMeta.appProjectId;
      const promptOrchestration = orchestratePromptMessage({
        message,
        buildMethod: metaBuildMethod,
        buildIntent: metaBuildIntent,
        isFirstPrompt: true,
        attachmentsCount: requestAttachments.length,
        hardCap: MAX_PROMPT_HANDOFF_CHARS,
        promptSourceKind: metaPromptSourceKind,
        promptSourceTechnical: metaPromptSourceTechnical,
        promptSourcePreservePayload: metaPromptSourcePreservePayload,
      });
      const strategyMeta = promptOrchestration.strategyMeta;
      let optimizedMessage = promptOrchestration.finalMessage;
      const trimmedSystemPrompt = typeof system === "string" ? system.trim() : "";
      const hasSystemPrompt = Boolean(trimmedSystemPrompt);
      const resolvedThinking =
        typeof thinking === "boolean"
          ? thinking
          : getDefaultThinkingEnabled();
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
      optimizedMessage = await appendHydratedTextAttachmentExcerpts(
        optimizedMessage,
        requestAttachments,
        { signal: req.signal },
      );

      const clientBriefFromMeta = parsedMeta.brief;
      const assistModelHint = parsedMeta.promptAssistModel;

      // Fast pre-match: keyword-only scaffold + variant (~1ms) to give Brief-LLM design hints.
      // Intentionally NOT pickScaffoldVariantAsync — that would add a +500ms OpenAI embedding
      // round-trip just for hint generation.
      // The picked preMatchVariant.id is later passed as orchestrationInput.persistedVariantId
      // so the same variant is reused by finalizeOrchestrationPrompts (no async re-pick), keeping
      // brief-LLM hints and codegen aligned.
      // Only runs when scaffoldMode is not "off" — if off, resolveOrchestrationBase will
      // also skip scaffold selection, so we should not inject stale variant hints.
      const scaffoldModeIsOff = parsedMeta.scaffoldMode === "off";
      const preMatchScaffold = scaffoldModeIsOff
        ? null
        : parsedMeta.scaffoldId
          ? getScaffoldById(parsedMeta.scaffoldId)
          : matchScaffold(message, metaBuildIntent as BuildIntent | null);
      const preMatchVariant = preMatchScaffold
        ? pickScaffoldVariant({ prompt: message, scaffoldId: preMatchScaffold.id })
        : null;
      const variantHints = buildVariantHintsForBrief(preMatchScaffold, preMatchVariant);
      const variantHintsText = variantHints
        ? formatVariantHintsForPrompt(variantHints)
        : undefined;

      let serverAutoBrief: Record<string, unknown> | null = null;
      let serverAutoBriefModel: string | null = null;
      if (
        shouldRunServerAutoBrief({
          hasClientBrief: Boolean(clientBriefFromMeta),
          promptSourceTechnical: metaPromptSourceTechnical,
          promptSourcePreservePayload: metaPromptSourcePreservePayload,
          promptType: strategyMeta.promptType,
          orchestrationReason: strategyMeta.reason,
          prompt: message,
          buildIntent: metaBuildIntent,
        })
      ) {
        const autoBriefStartedAt = Date.now();
        const generated = await tryGenerateServerAutoBrief({
          prompt: message,
          assistModelHint,
          imageGenerations: resolvedImageGenerations,
          signal: req.signal,
          variantHints: variantHintsText,
        });
        if (generated) {
          serverAutoBrief = generated.brief;
          serverAutoBriefModel = generated.modelUsed;
          debugLog("orchestration", "Server auto brief applied", {
            durationMs: Date.now() - autoBriefStartedAt,
            modelUsed: serverAutoBriefModel,
            pages: Array.isArray(serverAutoBrief?.pages) ? serverAutoBrief.pages.length : 0,
          });
        } else {
          debugLog("orchestration", "Server auto brief skipped or returned empty", {
            durationMs: Date.now() - autoBriefStartedAt,
          });
        }
      }
      const effectiveBrief = clientBriefFromMeta ?? serverAutoBrief;
      const briefQuality: "full" | "server-auto" | "none" = (() => {
        const clientQuality = clientBriefFromMeta?.briefQuality;
        if (clientQuality === "full" || clientQuality === "server-auto") return clientQuality;
        if (serverAutoBrief) return "server-auto";
        return "none";
      })();

      const creditUser = creditCheck.user;
      const commitCreditsOnce = createCommitCreditsOnce(creditCheck);

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
                copy.serverAutoBriefGenerated = Boolean(serverAutoBrief);
                copy.briefQuality = briefQuality;
                if (serverAutoBriefModel) copy.serverAutoBriefModel = serverAutoBriefModel;
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
                serverAutoBriefGenerated: Boolean(serverAutoBrief),
                briefQuality,
                ...(serverAutoBriefModel ? { serverAutoBriefModel } : {}),
              };
        const metaObj = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : null;
        const promptOriginal =
          typeof metaObj?.promptOriginal === "string"
            ? String(metaObj.promptOriginal)
            : message ?? null;
        const promptFormatted =
          typeof metaObj?.promptFormatted === "string"
            ? String(metaObj.promptFormatted)
            : optimizedMessage ?? null;
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
          promptAssistModel: parsedMeta.promptAssistModel,
          promptAssistDeep: parsedMeta.promptAssistDeep,
          promptAssistMode: parsedMeta.promptAssistMode,
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
      devLogStartNewSite({
        message: optimizedMessage,
        modelId: resolvedModelId,
        thinking: resolvedThinking,
        imageGenerations: resolvedImageGenerations,
        projectId,
        slug: metaBuildMethod || metaBuildIntent || undefined,
      });
      devLogAppend("in-progress", {
        type: "comm.request.create",
        modelId: resolvedModelId,
        modelTier: resolvedModelTier,
        buildProfileId,
        buildProfileLabel: MODEL_LABELS[resolvedModelTier],
        chatPrivacy: resolvedChatPrivacy,
        buildIntent: metaBuildIntent,
        buildMethod: metaBuildMethod,
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
        thinking: resolvedThinking,
        imageGenerations: resolvedImageGenerations,
      });
      debugLog("orchestration", "Create chat prompt assist + strategy (request meta)", {
        promptAssistModel: parsedMeta.promptAssistModel,
        promptAssistDeep: parsedMeta.promptAssistDeep,
        promptAssistMode: parsedMeta.promptAssistMode,
        promptStrategy: strategyMeta.strategy,
        promptType: strategyMeta.promptType,
      });

      // ── Plan Mode Path ────────────────────────────────────────────────
      if (metaPlanMode) {
        const plannerSettings = resolvePlanModePlannerSettings(
          resolvedModelTier,
          resolvedThinking,
        );
        const planModel = plannerSettings.modelId;
        let engineIntent: BuildIntent =
          metaBuildIntent === "template" || metaBuildIntent === "website" || metaBuildIntent === "app"
            ? (metaBuildIntent as BuildIntent)
            : "website";
        if (engineIntent === "website" && parsedMeta.scaffoldMode === "manual" && isAppScaffold(parsedMeta.scaffoldId)) {
          engineIntent = "app";
        }
        const planOrchestrationStartedAt = Date.now();
        const planOrchestration = await prepareGenerationContext({
          prompt: optimizedMessage,
          buildIntent: engineIntent,
          scaffoldMode: parsedMeta.scaffoldMode,
          scaffoldId: parsedMeta.scaffoldId,
          brief: effectiveBrief,
          themeColors: parsedMeta.themeColors,
          promptStrategyMeta: strategyMeta,
          // Bug 04#3 (2026-04-22 audit): plan mode skickade tidigare inte
          // engineModelId/lifecycleStage. Det gav divergent BuildSpec mellan
          // planerings-LLM (200k-baseline, default livscykel) och faktisk
          // codegen (1M-fönster + F2/F3). Spegla samma fält som huvudflödet.
          engineModelId: resolveEngineModelId(resolvedModelTier),
          lifecycleStage: parsedMeta.lifecycleStage,
        });
        debugLog("orchestration", "Plan mode orchestration prepared", {
          durationMs: Date.now() - planOrchestrationStartedAt,
          qualityTarget: planOrchestration.buildSpec.qualityTarget,
          contextPolicy: planOrchestration.buildSpec.contextPolicy,
          scaffoldId: planOrchestration.resolvedScaffold?.id ?? null,
        });

        const { planPreamble, planSystemPrompt } = computePlanModePlannerPrompts(planOrchestration);
        dumpPlanModePlannerPrompts(
          planPreamble,
          planOrchestration,
          planSystemPrompt,
          "POST /api/engine/chats/stream",
        );
        logPlanModeGenerationStart({
          planModel,
          promptLength: optimizedMessage.length,
          scaffoldId: planOrchestration.resolvedScaffold?.id ?? null,
          resolvedThinking: plannerSettings.thinking,
        });

        const pipelineStream = createPlanModePipelineStream({
          optimizedMessage,
          planSystemPrompt,
          planModel,
          plannerThinking: plannerSettings.thinking,
          plannerReasoningEffort: plannerSettings.reasoningEffort,
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
        const plannerChatDbStartedAt = Date.now();
        const plannerChat = await chatRepo.createChat(
          projectIdForChat,
          planModel,
          planSystemPrompt,
          planOrchestration.resolvedScaffold?.id,
        );
        await chatRepo.addMessage(plannerChat.id, "user", message);
        debugLog("engine", "Chat DB bootstrap complete", {
          durationMs: Date.now() - plannerChatDbStartedAt,
          mode: "plan",
          chatId: plannerChat.id,
        });
        devLogAppend("in-progress", {
          type: "site.chatId",
          chatId: plannerChat.id,
        });

        const planModeResponse = createOwnEnginePlanModeResponse({
          pipelineStream,
          chatId: plannerChat.id,
          modelTier: resolvedModelTier,
          buildProfileId,
          buildProfileLabel: MODEL_LABELS[resolvedModelTier],
          thinking: plannerSettings.thinking,
          promptStrategyMeta: strategyMeta,
          buildSpec: planOrchestration.buildSpec,
          resolvedScaffold: planOrchestration.resolvedScaffold,
          scaffoldMode: parsedMeta.scaffoldMode,
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
        });
        debugLog("engine", "Create chat pre-stream complete", {
          durationMs: Date.now() - requestStartedAt,
          mode: "plan",
          chatId: plannerChat.id,
        });
        return attachSessionCookie(
          withPromptToDoneMetricResponse(planModeResponse, {
            kind: "init",
            promptStartedAt: requestStartedAt,
            signal: req.signal,
          }),
        );
      }

      // ── Own Engine Path ───────────────────────────────────────────────
      {
        let engineIntent: BuildIntent =
          metaBuildIntent === "template" || metaBuildIntent === "website" || metaBuildIntent === "app"
            ? (metaBuildIntent as BuildIntent)
            : "website";
        if (engineIntent === "website" && parsedMeta.scaffoldMode === "manual" && isAppScaffold(parsedMeta.scaffoldId)) {
          engineIntent = "app";
        }
        const metaScaffoldMode = parsedMeta.scaffoldMode;
        const metaScaffoldId = parsedMeta.scaffoldId;
        const metaThemeColors = parsedMeta.themeColors;
        const metaBrief = effectiveBrief;
        const metaDesignThemePreset = parsedMeta.designThemePreset;
        const metaPalette = parsedMeta.palette;
        const designReferences = summarizeDesignReferences(requestAttachments);

        const orchestrationInput = {
          prompt: optimizedMessage,
          // Bug 07#1 (2026-04-22 audit): init tappade tidigare alla rå-prompt-
          // fält som follow-up skickar explicit. Det innebar att route-plan,
          // build-spec och contract-inferens i init gick på `optimizedMessage`
          // (wrappat med filkontext, guidance, templates) medan follow-up gick
          // på rå `message`. Samma användaravsikt kunde därför få olika
          // BuildSpec/route/contract-beslut beroende på mode. Spegla follow-
          // upens rå-källor så signalerna blir konsekventa.
          routePlanPrompt: message,
          buildSpecPrompt: message,
          contractsPrompt: message,
          scaffoldMatchPrompt: message,
          // QW-1: capability inference (needsAuth/needsEcommerce/needsCharts…)
          // är keyword-baserad. Använd rå user-message så bifogade text-utdrag
          // (PDFs/.docx) inte triggar capabilities som skuggar prompt-intent.
          capabilitiesPrompt: message,
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
          promptStrategyMeta: strategyMeta,
          // Lock variant to the pre-match pick so brief-LLM hints (variantHints
          // built above) and the final codegen variant agree. Without this the
          // async embedding-driven picker in finalizeOrchestrationPrompts can
          // land on a different variant after brief is ready, causing
          // brief→codegen drift. If preMatchVariant is null, async picker runs.
          // getVariantById fallback in orchestrate.ts re-picks if id is stale.
          persistedVariantId: preMatchVariant?.id ?? null,
          // Q5a: pass resolved engine model id so deriveBuildSpec scales
          // tokenBudgets to the model's actual context window.
          engineModelId: resolveEngineModelId(resolvedModelTier),
        };
        const orchestrationStartedAt = Date.now();
        const orchestrationBase = await resolveOrchestrationBase(orchestrationInput);
        debugLog("orchestration", "Orchestration base resolved", {
          durationMs: Date.now() - orchestrationStartedAt,
          qualityTarget: orchestrationBase.buildSpec.qualityTarget,
          contextPolicy: orchestrationBase.buildSpec.contextPolicy,
          scaffoldId: orchestrationBase.resolvedScaffold?.id ?? null,
          serializeMode: orchestrationBase.serializeMode,
          routeCount: orchestrationBase.routePlan.routes.length,
        });
        devLogAppend("in-progress", {
          type: "orchestration.resolved",
          scaffoldId: orchestrationBase.resolvedScaffold?.id ?? null,
          serializeMode: orchestrationBase.serializeMode,
          qualityTarget: orchestrationBase.buildSpec.qualityTarget,
          contextPolicy: orchestrationBase.buildSpec.contextPolicy,
        });
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

        const engineModel = resolveEngineModelId(resolvedModelTier);
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
          const contractGateDbStartedAt = Date.now();
          const engineChat = await chatRepo.createChat(
            projectIdForChat,
            engineModel,
            undefined,
            resolvedScaffold?.id,
          );
          await chatRepo.addMessage(engineChat.id, "user", message);
          debugLog("engine", "Chat DB bootstrap complete", {
            durationMs: Date.now() - contractGateDbStartedAt,
            mode: "pre-generation-contract-gate",
            chatId: engineChat.id,
          });
          devLogAppend("in-progress", {
            type: "site.chatId",
            chatId: engineChat.id,
          });
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
              buildSpec: orchestrationBase.buildSpec,
              metaBriefApplied: Boolean(metaBrief),
              customInstructionsLength: trimmedSystemPrompt?.length ?? 0,
              chatPrivacy: resolvedChatPrivacy,
              scaffoldLabel: resolvedScaffold?.label ?? null,
              capabilities: engineCapabilities,
            }),
          );
          debugLog("engine", "Create chat pre-stream complete", {
            durationMs: Date.now() - requestStartedAt,
            mode: "pre-generation-contract-gate",
            chatId: engineChat.id,
          });
          return attachSessionCookie(new Response(
            wrapStreamForPromptToDoneMetric(contractGateStream, {
              kind: "init",
              promptStartedAt: requestStartedAt,
              signal: req.signal,
            }),
            { headers: createSSEHeaders() },
          ));
        }
        const finalizePromptStartedAt = Date.now();
        const finalized = await finalizeOrchestrationPrompts(orchestrationBase, orchestrationInput);
        const { engineSystemPrompt } = finalized;
        debugLog("orchestration", "System prompt finalized", {
          durationMs: Date.now() - finalizePromptStartedAt,
          routeCount: orchestrationBase.routePlan.routes.length,
          qualityTarget: orchestrationBase.buildSpec.qualityTarget,
          contextPolicy: orchestrationBase.buildSpec.contextPolicy,
          scaffoldVariant: finalized.variantId,
        });
        if (finalized.variantId) {
          devLogAppend("in-progress", {
            type: "orchestration.styleDirection",
            styleDirection: finalized.variantId,
          });
        }
        const generationInputPackage = buildGenerationInputPackage(
          orchestrationBase,
          orchestrationInput,
          finalized,
        );
        const lineageHash = generationInputPackage.lineageHash;
        writeOrchestrationDynamicDump(generationInputPackage);
        dumpOwnEngineCodegenFromFullSystem(engineSystemPrompt, {
          route: "POST /api/engine/chats/stream",
          planMode: false,
        });
        const promptLengths = getSystemPromptLengths(engineSystemPrompt);
        debugLog("prompt-cache", "System prompt lengths", promptLengths);

        const engineChatDbStartedAt = Date.now();
        const engineChat = await chatRepo.createChat(
          projectIdForChat,
          engineModel,
          engineSystemPrompt,
          resolvedScaffold?.id,
        );
        await chatRepo.addMessage(engineChat.id, "user", message);
        debugLog("engine", "Chat DB bootstrap complete", {
          durationMs: Date.now() - engineChatDbStartedAt,
          mode: "own-engine",
          chatId: engineChat.id,
        });
        devLogAppend("in-progress", {
          type: "site.chatId",
          chatId: engineChat.id,
        });
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
        const compressUrlsStartedAt = Date.now();
        const { compressed: enginePrompt, urlMap } = compressUrls(optimizedMessage);
        debugLog("engine", "Prompt URL compression complete", {
          durationMs: Date.now() - compressUrlsStartedAt,
          originalPromptLength: optimizedMessage.length,
          compressedPromptLength: enginePrompt.length,
          compressedUrlCount: Object.keys(urlMap).length,
          chatId: engineChat.id,
        });
        const generatorThinking = resolvePhaseThinking(resolvedModelTier, "generator");
        const effectiveGeneratorThinking =
          resolvedThinking && generatorThinking.thinking;
        const engineStream = createOwnEnginePipelineAndGenerationStream({
          chatId: engineChat.id,
          resolvedTier: resolvedModelTier,
          // F2-init must NEVER surface env-var prompts in chat. Tier-3 env
          // input belongs in the F3 ("Bygg integrationer") flow, which goes
          // through `chat-message-stream-post.ts` with
          // `meta.lifecycleStage: "integrations"` and gates the tools there.
          includeIntegrationSignals: false,
          pipeline: {
            prompt: enginePrompt,
            systemPrompt: engineSystemPrompt,
            model: engineModel,
            thinking: effectiveGeneratorThinking,
            abortSignal: req.signal,
            maxSteps: resolveOwnEngineMaxSteps({
              buildSpec: orchestrationBase.buildSpec,
              userMessage: message,
              isFollowUp: false,
            }),
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
            resolvedThinking: effectiveGeneratorThinking,
            resolvedImageGenerations,
            strategyMeta,
            orchestrationBase,
            buildSpec: orchestrationBase.buildSpec,
            engineSystemPromptLength: engineSystemPrompt.length,
            metaBriefApplied: Boolean(metaBrief),
            customInstructionsLength: trimmedSystemPrompt?.length ?? 0,
            scaffoldId: resolvedScaffold?.id ?? null,
            variantId: finalized.variantId,
          }),
          engineModel,
          optimizedMessage,
          engineIntent,
          buildSpec: orchestrationBase.buildSpec,
          routePlan: routePlan ?? null,
          orchestrationContract: orchestrationBase.orchestrationContract,
          resolvedScaffold: resolvedScaffold ?? null,
          lineageHash,
          urlMap,
          commitCredits: commitCreditsOnce,
        });

        debugLog("engine", "Create chat pre-stream complete", {
          durationMs: Date.now() - requestStartedAt,
          mode: "own-engine",
          chatId: engineChat.id,
        });
        return buildEngineStreamResponse({
          engineStream,
          req,
          promptStartedAt: requestStartedAt,
          kind: "init",
          attachSessionCookie,
        });
      }
    } catch (err) {
      return buildStreamErrorResponse({
        err,
        req,
        requestId,
        promptStartedAt: requestStartedAt,
        kind: "init",
        logLabel: "Create chat error",
        devLogType: "comm.error.create",
        attachSessionCookie,
      });
    }
  });
}

