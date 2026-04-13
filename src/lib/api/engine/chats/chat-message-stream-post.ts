import { NextResponse } from "next/server";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { createSSEHeaders } from "@/lib/streaming";
import { withRateLimit } from "@/lib/rateLimit";
import { getEngineChatByIdForRequest } from "@/lib/tenant";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { prepareCredits } from "@/lib/credits/server";
import { devLogAppend, devLogStartGeneration } from "@/lib/logging/devLog";
import { debugLog, errorLog } from "@/lib/utils/debug";
import { normalizeProviderError } from "@/lib/providers/errors/normalize-provider-error";
import { sendMessageSchema } from "@/lib/validations/chatSchemas";
import { MAX_PROMPT_HANDOFF_CHARS } from "@/lib/builder/promptLimits";
import { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";
import { FEATURES } from "@/lib/config";
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
} from "@/lib/gen/contract/clarification";
import { collectConfirmedContractAnswers } from "@/lib/gen/contract/answer-context";
import { hasHeavyCapabilities, inferCapabilities } from "@/lib/gen/capability-inference";
import { deriveFollowUpContextPolicy } from "@/lib/gen/build-spec";
import { compressUrls } from "@/lib/gen/url-compress";
import {
  buildGenerationInputPackage,
  finalizeOrchestrationPrompts,
  prepareGenerationContext,
  resolveOrchestrationBase,
  writeOrchestrationDynamicDump,
} from "@/lib/gen/orchestrate";
import { getDefaultThinkingEnabled } from "@/lib/gen/default-thinking";
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
import * as chatRepo from "@/lib/db/chat-repository-pg";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { isAppScaffold } from "@/lib/builder/build-intent";
import { buildFileContext } from "@/lib/gen/context/file-context-builder";
import { resolveFollowUpPreviousFiles } from "@/lib/gen/version-manager";
import { extractAppRoutePathsFromFilePaths } from "@/lib/gen/route-plan";
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
import {
  buildAwaitingClarificationStream,
  classifyFollowUpIntent,
  persistFollowUpClarification,
  resolveFollowUpClarification,
  shouldIgnorePersistedScaffoldForMatch,
} from "@/lib/providers/own-engine/follow-up-clarification";
import { prependOrchestrationContinuityToFollowUp } from "@/lib/gen/orchestration-snapshot";
import { PROMPT_WRAPPER_HEADINGS, wrapWithSection } from "@/lib/gen/prompt-wrapper-contract";
import { appendHydratedTextAttachmentExcerpts } from "@/lib/gen/attachment-text-hydrate";
import { createPromptLog } from "@/lib/db/services/prompt-logs";
import { looksDesignHeavyMessage } from "@/lib/builder/promptOrchestration";
import { resolveOwnEngineMaxSteps } from "@/lib/own-engine/resolve-max-steps";

/** Follow-up chat stream (own-engine). Route files set `runtime` / `maxDuration`. */

export async function handleMessageStreamRequest(
  req: Request,
  ctx: { params: Promise<{ chatId: string }> },
  options: { skipRateLimit?: boolean } = {},
) {
  const requestId = req.headers.get("x-vercel-id") || "unknown";
  const session = ensureSessionIdFromRequest(req);
  const sessionId = session.sessionId;
  const attachSessionCookie = (response: Response) => {
    if (session.setCookie) {
      response.headers.set("Set-Cookie", session.setCookie);
    }
    return response;
  };
  const runHandler = async () => {
    try {
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

      const {
        message,
        attachments,
        modelId,
        thinking,
        imageGenerations,
        system,
        meta,
      } =
        validationResult.data;
      const requestAttachments = normalizeRequestAttachments(attachments);
      const parsedMeta = parseChatRequestMeta(meta);
      const modelSelection = resolveModelSelection({
        requestedModelId: modelId,
        requestedModelTier: parsedMeta.modelTier,
        fallbackTier: DEFAULT_MODEL_ID,
      });
      const engineChat = await getEngineChatByIdForRequest(req, chatId, { sessionId });
      if (!engineChat) {
        return attachSessionCookie(
          NextResponse.json({ error: "Chat not found" }, { status: 404 }),
        );
      }

      const resolvedModelId = modelSelection.modelId;
        const resolvedModelTier = modelSelection.modelTier;
        const buildProfileId = getBuildProfileId(resolvedModelTier);
        const resolvedThinking =
          typeof thinking === "boolean"
            ? thinking
            : getDefaultThinkingEnabled();
        const resolvedImageGenerations =
          typeof imageGenerations === "boolean" ? imageGenerations : true;
        const metaBuildMethod = parsedMeta.buildMethod;
        const metaBuildIntent = parsedMeta.buildIntent;
        const metaPromptSourceKind = parsedMeta.promptSourceKind;
        const metaPromptSourceTechnical = parsedMeta.promptSourceTechnical;
        const metaPromptSourcePreservePayload = parsedMeta.promptSourcePreservePayload;
        const metaPlanMode = parsedMeta.planMode;
        const metaEngineBaseVersionId = parsedMeta.engineBaseVersionId;
        const metaAppProjectId = parsedMeta.appProjectId;
        const metaScaffoldMode = parsedMeta.scaffoldMode;
        const metaScaffoldId = parsedMeta.scaffoldId;
        const metaThemeColors = parsedMeta.themeColors;
        // Follow-ups should not carry the init brief — the server relies on
        // persisted scaffold, orchestration snapshot, and previous files instead.
        // Ignore any stale client brief on this path.
        const metaBrief: Record<string, unknown> | null = null;
        const metaDesignThemePreset = parsedMeta.designThemePreset;
        const metaPalette = parsedMeta.palette;
        const metaPromptAssistModel = parsedMeta.promptAssistModel;
        const metaPromptAssistDeep = parsedMeta.promptAssistDeep;
        const metaPromptAssistMode = parsedMeta.promptAssistMode;
        const designReferences = summarizeDesignReferences(requestAttachments);
        const contractAnswerContext = collectConfirmedContractAnswers(engineChat.messages, message);

        if (metaAppProjectId && engineChat.project_id !== metaAppProjectId) {
          try {
            await chatRepo.updateChatProjectId(engineChat.id, metaAppProjectId);
            engineChat.project_id = metaAppProjectId;
          } catch (error) {
            console.warn("[API/engine/chats/:chatId/stream] Failed to repair chat project mapping", {
              chatId,
              currentProjectId: engineChat.project_id,
              targetProjectId: metaAppProjectId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        const promptOrchestration = orchestratePromptMessage({
          message,
          buildMethod: metaBuildMethod,
          buildIntent: metaBuildIntent,
          isFirstPrompt: false,
          attachmentsCount: requestAttachments.length,
          hardCap: MAX_PROMPT_HANDOFF_CHARS,
          promptSourceKind: metaPromptSourceKind,
          promptSourceTechnical: metaPromptSourceTechnical,
          promptSourcePreservePayload: metaPromptSourcePreservePayload,
        });
        debugLog("orchestration", "Follow-up prompt assist + strategy (request meta)", {
          chatId,
          promptAssistModel: metaPromptAssistModel,
          promptAssistDeep: metaPromptAssistDeep,
          promptAssistMode: metaPromptAssistMode,
          promptStrategy: promptOrchestration.strategyMeta.strategy,
          promptType: promptOrchestration.strategyMeta.promptType,
        });
        let optimizedMessage = promptOrchestration.finalMessage;
        optimizedMessage = prependOrchestrationContinuityToFollowUp(
          optimizedMessage,
          engineChat.orchestration_snapshot ?? null,
        );

        const previousFiles = await resolveFollowUpPreviousFiles(
          chatId,
          metaEngineBaseVersionId,
        );
        const existingRoutePaths =
          previousFiles.length > 0
            ? extractAppRoutePathsFromFilePaths(previousFiles.map((file) => file.path))
            : [];

        const skipIntentClassification =
          metaPromptSourcePreservePayload ||
          metaPromptSourceTechnical ||
          contractAnswerContext.currentReplyWasConsumed;
        const followUpIntent = previousFiles.length > 0 && !skipIntentClassification
          ? classifyFollowUpIntent(message)
          : "neutral";
        const followUpClarification = previousFiles.length > 0 && !skipIntentClassification
          ? resolveFollowUpClarification(message)
          : null;
        if (followUpClarification) {
          devLogAppend("latest", {
            type: "site.message.awaiting_input",
            chatId,
            reason: followUpClarification.reason,
            promptPreview: message.slice(0, 160),
          });
          await persistFollowUpClarification({
            chatId,
            message,
            clarification: followUpClarification,
            addMessage: (targetChatId, role, content, _parentMessageId, uiParts) =>
              chatRepo.addMessage(targetChatId, role, content, undefined, uiParts),
          });
          return attachSessionCookie(
            new Response(
              buildAwaitingClarificationStream({
                chatId,
                clarification: followUpClarification,
              }),
              { headers: createSSEHeaders() },
            ),
          );
        }

        if (previousFiles.length > 0) {
          const inferredCapabilities = inferCapabilities(message);
          const capabilityHeavy = hasHeavyCapabilities(inferredCapabilities);
          const followUpContextPolicy = deriveFollowUpContextPolicy({
            prompt: message,
            skipIntentClassification,
            followUpIntent,
            capabilityHeavy,
          });
          const useLightFollowUpContext =
            FEATURES.useFollowUpLightContext &&
            followUpContextPolicy === "light";
          const manyFiles = previousFiles.length > 14;
          const fileCtx = buildFileContext({
            files: previousFiles,
            maxChars: useLightFollowUpContext ? 24_000 : 140_000,
            includeContents: true,
            maxFilesWithContent: useLightFollowUpContext ? (manyFiles ? 2 : 4) : 8,
          });

          if (skipIntentClassification) {
            optimizedMessage = wrapWithSection({
              heading: PROMPT_WRAPPER_HEADINGS.existingProjectFilesReference,
              introLines: [
                "Apply the requested change precisely. Do not modify unrelated sections or files.",
                "Return only the files you need to create or modify. Files you omit will be kept as-is.",
              ],
              body: fileCtx.summary,
              divider: true,
              trailingBody: optimizedMessage,
            });
          } else {
            optimizedMessage = [
              wrapWithSection({
                heading: PROMPT_WRAPPER_HEADINGS.followUpEditingMode,
                introLines: [
                  followUpIntent === "clear-redesign"
                    ? "The user wants a genuine redesign of the existing site, not a small refinement."
                    : "You are editing an existing project, not starting over.",
                  followUpIntent === "clear-redesign"
                    ? "Replace the visual identity, background treatment, layout rhythm, and dominant UI patterns where needed."
                    : "Apply the user's requested changes directly to the current files below.",
                  followUpIntent === "clear-redesign"
                    ? "Rewrite the main experience aggressively enough that the result feels new. You may replace globals.css, app/page.tsx, and other dominant UI files."
                    : "Make visible changes in the dominant UI files when the request affects design, layout, color, animation, or interaction.",
                  followUpIntent === "clear-redesign"
                    ? "Do not preserve the previous design language unless the user explicitly asked to keep parts of it."
                    : "Return only the files you need to create or modify. Files you omit will be kept as-is.",
                  followUpIntent === "clear-redesign"
                    ? "You may still reuse useful content or information architecture from the current project when relevant."
                    : "",
                ],
                body: fileCtx.summary,
              }),
              "",
              PROMPT_WRAPPER_HEADINGS.requestedChanges,
              "",
              optimizedMessage,
            ].join("\n");
          }
        }

        if (contractAnswerContext.currentReplyWasConsumed) {
          const latestAnswer = contractAnswerContext.confirmedAnswers.at(-1);
          if (latestAnswer) {
            optimizedMessage = [
              wrapWithSection({
                heading: PROMPT_WRAPPER_HEADINGS.contractClarificationAnswer,
                introLines: [
                  "The user is answering the previous contract clarification question. Use this answer to continue the existing generation safely.",
                  `Question: ${latestAnswer.question}`,
                  `Answer: ${latestAnswer.answer}`,
                  "",
                  "Continue the existing implementation using this confirmed decision. Do not ask the same question again unless the answer is still genuinely insufficient.",
                ],
              }),
              "",
              PROMPT_WRAPPER_HEADINGS.userReply,
              "",
              optimizedMessage,
            ].join("\n");
          }
        }

        optimizedMessage = await appendHydratedTextAttachmentExcerpts(
          optimizedMessage,
          requestAttachments,
          { signal: req.signal },
        );

        const creditContext = {
          modelId: resolvedModelId,
          thinking: resolvedThinking,
          imageGenerations: resolvedImageGenerations,
          attachmentsCount: requestAttachments.length,
        };
        const creditCheck = await prepareCredits(req, "prompt.refine", creditContext, {
          sessionId,
        });
        if (!creditCheck.ok) {
          return attachSessionCookie(creditCheck.response);
        }
        try {
          const metaPayload =
            meta && typeof meta === "object"
              ? (() => {
                  const copy = { ...(meta as Record<string, unknown>) };
                  delete copy.promptOriginal;
                  delete copy.promptFormatted;
                  copy.promptStrategy = promptOrchestration.strategyMeta.strategy;
                  copy.promptType = promptOrchestration.strategyMeta.promptType;
                  copy.promptBudgetTarget = promptOrchestration.strategyMeta.budgetTarget;
                  copy.promptOptimizedLength = promptOrchestration.strategyMeta.optimizedLength;
                  copy.promptReductionRatio = promptOrchestration.strategyMeta.reductionRatio;
                  copy.promptStrategyReason = promptOrchestration.strategyMeta.reason;
                  copy.promptComplexityScore = promptOrchestration.strategyMeta.complexityScore;
                  return Object.keys(copy).length > 0 ? copy : null;
                })()
              : {
                  promptStrategy: promptOrchestration.strategyMeta.strategy,
                  promptType: promptOrchestration.strategyMeta.promptType,
                  promptBudgetTarget: promptOrchestration.strategyMeta.budgetTarget,
                  promptOptimizedLength: promptOrchestration.strategyMeta.optimizedLength,
                  promptReductionRatio: promptOrchestration.strategyMeta.reductionRatio,
                  promptStrategyReason: promptOrchestration.strategyMeta.reason,
                  promptComplexityScore: promptOrchestration.strategyMeta.complexityScore,
                };
          await createPromptLog({
            event: "follow_up",
            userId: creditCheck.user?.id ?? null,
            sessionId,
            appProjectId: metaAppProjectId || null,
            v0ProjectId: engineChat.project_id ?? null,
            chatId,
            promptOriginal: message,
            promptFormatted: optimizedMessage,
            systemPrompt: typeof system === "string" ? system.trim() || null : null,
            promptAssistModel: metaPromptAssistModel,
            promptAssistDeep: metaPromptAssistDeep,
            promptAssistMode: metaPromptAssistMode,
            buildIntent: metaBuildIntent,
            buildMethod: metaBuildMethod,
            modelTier: resolvedModelTier,
            imageGenerations: resolvedImageGenerations,
            thinking: resolvedThinking,
            attachmentsCount: requestAttachments.length,
            meta: metaPayload,
          });
        } catch (error) {
          console.warn("[prompt-log] Failed to record follow-up prompt log:", error);
        }
        const commitCreditsOnce = createCommitCreditsOnce(creditCheck);

        const persistedScaffoldId = engineChat.scaffold_id;
        const ignorePersistedScaffoldForMatch = shouldIgnorePersistedScaffoldForMatch({
          hasPreviousFiles: previousFiles.length > 0,
          followUpIntent,
          message,
          scaffoldMode: metaScaffoldMode,
          scaffoldId: metaScaffoldId,
        });

        if (metaPlanMode) {
          await chatRepo.addMessage(engineChat.id, "user", message);

          let planEngineIntent: BuildIntent =
            metaBuildIntent === "template" ||
            metaBuildIntent === "website" ||
            metaBuildIntent === "app"
              ? (metaBuildIntent as BuildIntent)
              : "website";
          if (planEngineIntent === "website" && parsedMeta.scaffoldMode === "manual" && isAppScaffold(parsedMeta.scaffoldId)) {
            planEngineIntent = "app";
          }
          const planOrchestrationStartedAt = Date.now();
          const planOrchestration = await prepareGenerationContext({
            prompt: optimizedMessage,
            routePlanPrompt: message,
            buildSpecPrompt: message,
            buildIntent: planEngineIntent,
            scaffoldMode: metaScaffoldMode,
            scaffoldId: metaScaffoldId,
            brief: metaBrief,
            themeColors: metaThemeColors,
            imageGenerations: resolvedImageGenerations,
            componentPalette: metaPalette,
            designThemePreset: metaDesignThemePreset,
            designReferences,
            persistedScaffoldId,
            generationMode: previousFiles.length > 0 ? ("followUp" as const) : undefined,
            isFirstCodeGeneration: previousFiles.length === 0 && Boolean(persistedScaffoldId),
            ignorePersistedScaffoldForMatch,
            promptStrategyMeta: promptOrchestration.strategyMeta,
            existingRoutePaths,
            capabilities: previousFiles.length > 0 ? inferCapabilities(message) : undefined,
          });
          debugLog("orchestration", "Follow-up plan orchestration prepared", {
            chatId,
            durationMs: Date.now() - planOrchestrationStartedAt,
            qualityTarget: planOrchestration.buildSpec.qualityTarget,
            contextPolicy: planOrchestration.buildSpec.contextPolicy,
            scaffoldId: planOrchestration.resolvedScaffold?.id ?? null,
          });
          const planResolvedScaffold = planOrchestration.resolvedScaffold;
          if (
            planResolvedScaffold &&
            (!persistedScaffoldId || ignorePersistedScaffoldForMatch)
          ) {
            try {
              await chatRepo.updateChatScaffoldId(chatId, planResolvedScaffold.id);
            } catch {
              /* best-effort persist */
            }
          }

          const { planPreamble, planSystemPrompt } = computePlanModePlannerPrompts(planOrchestration);
          dumpPlanModePlannerPrompts(
            planPreamble,
            planOrchestration,
            planSystemPrompt,
            "POST /api/engine/chats/[chatId]/stream",
          );
          const planChatHistory = engineChat.messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            }));
          const planModel = resolvePlanModePlannerModelId(resolvedModelTier);
          logPlanModeGenerationStart({
            planModel,
            promptLength: optimizedMessage.length,
            scaffoldId: planResolvedScaffold?.id ?? null,
            resolvedThinking,
          });
          const planPipelineStream = createPlanModePipelineStream({
            optimizedMessage,
            planSystemPrompt,
            planModel,
            resolvedThinking,
            abortSignal: req.signal,
            chatHistory: planChatHistory,
            referenceAttachments: requestAttachments,
          });

          return attachSessionCookie(createOwnEnginePlanModeResponse({
            pipelineStream: planPipelineStream,
            chatId,
            modelTier: resolvedModelTier,
            buildProfileId,
            buildProfileLabel: MODEL_LABELS[resolvedModelTier],
            thinking: resolvedThinking,
            promptStrategyMeta: promptOrchestration.strategyMeta,
            buildSpec: planOrchestration.buildSpec,
            resolvedScaffold: planResolvedScaffold,
            scaffoldMode: metaScaffoldMode,
            persistAssistantSummary: async (planData, hasBlockers) => {
              try {
                const storedPlanPart = buildPlanUiPart(planData);
                await chatRepo.addMessage(
                  chatId,
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
              chatId,
              versionId: null,
              messageId: null,
              ...previewUrlField(null),
              awaitingInput: hasBlockers,
              planArtifact: planData,
              planMode: true,
            }),
            commitCredits: commitCreditsOnce,
            commitCreditsPosition: "before-done",
            normalizeQuestionToolCallIds: true,
          }));
        }

        await chatRepo.addMessage(engineChat.id, "user", message);

        const promptForLlm = optimizedMessage;

        let engineIntent: BuildIntent =
          metaBuildIntent === "template" ||
          metaBuildIntent === "website" ||
          metaBuildIntent === "app"
            ? (metaBuildIntent as BuildIntent)
            : "website";
        if (engineIntent === "website" && parsedMeta.scaffoldMode === "manual" && isAppScaffold(parsedMeta.scaffoldId)) {
          engineIntent = "app";
        }
        const trimmedSystem = typeof system === "string" ? system.trim() : "";
        const orchestrationInput = {
          prompt: optimizedMessage,
          routePlanPrompt: message,
          buildSpecPrompt: message,
          buildIntent: engineIntent,
          scaffoldMode: metaScaffoldMode,
          scaffoldId: metaScaffoldId,
          brief: metaBrief,
          themeColors: metaThemeColors,
          imageGenerations: resolvedImageGenerations,
          componentPalette: metaPalette,
          designThemePreset: metaDesignThemePreset,
          designReferences,
          persistedScaffoldId,
          contractAnswers: contractAnswerContext.confirmedAnswers,
          customInstructions: trimmedSystem || undefined,
          promptStrategyMeta: promptOrchestration.strategyMeta,
          generationMode: previousFiles.length > 0 ? ("followUp" as const) : undefined,
          isFirstCodeGeneration: previousFiles.length === 0 && Boolean(persistedScaffoldId),
          ignorePersistedScaffoldForMatch,
          existingRoutePaths,
          capabilities: previousFiles.length > 0 ? inferCapabilities(message) : undefined,
        };
        const orchestrationStartedAt = Date.now();
        const orchestrationBase = await resolveOrchestrationBase(orchestrationInput);
        debugLog("orchestration", "Follow-up orchestration base resolved", {
          chatId,
          durationMs: Date.now() - orchestrationStartedAt,
          qualityTarget: orchestrationBase.buildSpec.qualityTarget,
          contextPolicy: orchestrationBase.buildSpec.contextPolicy,
          scaffoldId: orchestrationBase.resolvedScaffold?.id ?? null,
          serializeMode: orchestrationBase.serializeMode,
          routeCount: orchestrationBase.routePlan.routes.length,
        });
        devLogAppend("in-progress", {
          type: "orchestration.resolved",
          chatId,
          scaffoldId: orchestrationBase.resolvedScaffold?.id ?? null,
          serializeMode: orchestrationBase.serializeMode,
          qualityTarget: orchestrationBase.buildSpec.qualityTarget,
          contextPolicy: orchestrationBase.buildSpec.contextPolicy,
        });
        const { resolvedScaffold, routePlan, preGenerationContracts } = orchestrationBase;
        const contractClarification = buildContractClarificationQuestion({
          buildIntent: engineIntent,
          context: preGenerationContracts,
        });
        if (
          resolvedScaffold &&
          (!persistedScaffoldId || ignorePersistedScaffoldForMatch)
        ) {
          try {
            await chatRepo.updateChatScaffoldId(chatId, resolvedScaffold.id);
          } catch { /* best-effort persist */ }
        }
        devLogAppend("in-progress", {
          type: "contracts.inferred",
          chatId,
          dataMode: preGenerationContracts.contracts.dataMode,
          databaseProvider: preGenerationContracts.contracts.databaseProvider ?? null,
          authProvider: preGenerationContracts.contracts.authProvider ?? null,
          paymentProvider: preGenerationContracts.contracts.paymentProvider ?? null,
          integrations: preGenerationContracts.contracts.integrations.map((entry) => entry.provider),
          envVars: preGenerationContracts.contracts.envVars.map((entry) => entry.key),
          unresolvedDecisions: preGenerationContracts.unresolvedDecisions.map((entry) => entry.kind),
        });

        const chatHistory = engineChat.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));

        const engineModel = resolveEngineModelId(resolvedModelTier);
        debugLog("build", "Follow-up chat stream request", {
          chatId,
          buildProfileId,
          buildProfileLabel: MODEL_LABELS[resolvedModelTier],
          internalModelSelection: resolvedModelTier,
          enginePath: "own-engine",
          engineModel: canonicalModelIdToOwnModelId(resolvedModelTier),
          promptLength: optimizedMessage.length,
          originalPromptLength: message.length,
          attachments: requestAttachments.length,
          thinking: resolvedThinking,
          imageGenerations: resolvedImageGenerations,
          promptStrategy: promptOrchestration.strategyMeta.strategy,
          promptType: promptOrchestration.strategyMeta.promptType,
        });
        debugLog("engine", "Own engine model resolved", {
          resolvedModelTier,
          engineModel,
          fallback: false,
        });
        devLogStartGeneration({
          message: optimizedMessage,
          modelId: resolvedModelId,
          thinking: resolvedThinking,
          imageGenerations: resolvedImageGenerations,
          projectId: engineChat.project_id ?? undefined,
          slug: metaBuildMethod || metaBuildIntent || undefined,
          chatId,
          generationKind: "followup",
        });
        devLogAppend("in-progress", {
          type: "comm.request.followup",
          chatId,
          modelId: resolvedModelId,
          modelTier: resolvedModelTier,
          buildProfileId,
          buildProfileLabel: MODEL_LABELS[resolvedModelTier],
          buildIntent: metaBuildIntent,
          buildMethod: metaBuildMethod,
          message: optimizedMessage,
          slug: metaBuildMethod || metaBuildIntent || undefined,
          promptType: promptOrchestration.strategyMeta.promptType,
          promptStrategy: promptOrchestration.strategyMeta.strategy,
          promptBudgetTarget: promptOrchestration.strategyMeta.budgetTarget,
          originalLength: promptOrchestration.strategyMeta.originalLength,
          optimizedLength: promptOrchestration.strategyMeta.optimizedLength,
          reductionRatio: promptOrchestration.strategyMeta.reductionRatio,
          strategyReason: promptOrchestration.strategyMeta.reason,
          attachmentsCount: requestAttachments.length,
          thinking: resolvedThinking,
          imageGenerations: resolvedImageGenerations,
          followUpIntent,
          baseVersionId: metaEngineBaseVersionId,
        });
        if (contractClarification) {
          const assistantQuestion = await chatRepo.addMessage(
            chatId,
            "assistant",
            contractClarification.question,
            undefined,
            [buildStoredContractClarificationUiPart(contractClarification)],
          ).catch(() => null);
          devLogAppend("in-progress", {
            type: "contracts.clarification-requested",
            chatId,
            kind: contractClarification.kind,
            reason: contractClarification.reason,
          });
          const contractGateStream = createPreGenerationContractGateReadableStream(
            buildPreGenerationContractGateParams({
              routeVariant: "follow-up",
              sseChatId: chatId,
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
              strategyMeta: promptOrchestration.strategyMeta,
              buildSpec: orchestrationBase.buildSpec,
              metaBriefApplied: Boolean(metaBrief),
              customInstructionsLength: trimmedSystem?.length ?? 0,
            }),
          );
          return attachSessionCookie(new Response(contractGateStream, {
            headers: createSSEHeaders(),
          }));
        }
        const finalizePromptStartedAt = Date.now();
        const finalized = await finalizeOrchestrationPrompts(orchestrationBase, orchestrationInput);
        const { engineSystemPrompt } = finalized;
        debugLog("orchestration", "Follow-up system prompt finalized", {
          chatId,
          durationMs: Date.now() - finalizePromptStartedAt,
          routeCount: orchestrationBase.routePlan.routes.length,
          qualityTarget: orchestrationBase.buildSpec.qualityTarget,
          contextPolicy: orchestrationBase.buildSpec.contextPolicy,
          styleDirection: finalized.styleDirectionId,
        });
        if (finalized.styleDirectionId) {
          devLogAppend("in-progress", {
            type: "orchestration.styleDirection",
            chatId,
            styleDirection: finalized.styleDirectionId,
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
          route: "POST /api/engine/chats/[chatId]/stream",
          planMode: false,
        });
        const promptLengths = getSystemPromptLengths(engineSystemPrompt);
        debugLog("prompt-cache", "System prompt lengths", promptLengths);

        const { compressed: enginePrompt, urlMap } = compressUrls(promptForLlm);
        const engineStream = createOwnEnginePipelineAndGenerationStream({
          chatId,
          pipeline: {
            prompt: enginePrompt,
            systemPrompt: engineSystemPrompt,
            model: engineModel,
            chatHistory,
            thinking: resolvedThinking,
            abortSignal: req.signal,
            maxSteps: resolveOwnEngineMaxSteps({
              buildSpec: orchestrationBase.buildSpec,
              userMessage: message,
              isFollowUp: previousFiles.length > 0,
            }),
            referenceAttachments: requestAttachments,
          },
          meta: buildOwnEngineGenerationStreamMeta({
            routeVariant: "follow-up",
            engineModel,
            resolvedModelTier,
            buildProfileId,
            buildProfileLabel: MODEL_LABELS[resolvedModelTier],
            resolvedThinking,
            resolvedImageGenerations,
            strategyMeta: promptOrchestration.strategyMeta,
            orchestrationBase,
            buildSpec: orchestrationBase.buildSpec,
            engineSystemPromptLength: engineSystemPrompt.length,
            metaBriefApplied: Boolean(metaBrief),
            customInstructionsLength: trimmedSystem?.length ?? 0,
            scaffoldId: resolvedScaffold?.id ?? null,
          }),
          engineModel,
          optimizedMessage,
          engineIntent,
          buildSpec: orchestrationBase.buildSpec,
          routePlan: routePlan ?? null,
          orchestrationContract: orchestrationBase.orchestrationContract,
          resolvedScaffold: resolvedScaffold ?? null,
          urlMap,
          commitCredits: commitCreditsOnce,
          previousFiles: previousFiles.length > 0 ? previousFiles : undefined,
          lineageHash,
          targetVersionId:
            metaPromptSourceKind === "autofix" && metaEngineBaseVersionId
              ? metaEngineBaseVersionId
              : undefined,
        });

        const engineHeaders = new Headers(createSSEHeaders());
        return attachSessionCookie(new Response(engineStream, { headers: engineHeaders }));
    } catch (err) {
      errorLog("engine", `Send message error (requestId=${requestId})`, err);
      const normalized = normalizeProviderError(err);
      devLogAppend("latest", {
        type: "comm.error.send",
        chatId: null,
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
  };

  return options.skipRateLimit ? runHandler() : withRateLimit(req, "message:send", runHandler);
}

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return handleMessageStreamRequest(req, ctx);
}
