import { NextResponse } from "next/server";
import { createSSEHeaders, formatSSEEvent } from "@/lib/streaming";
import { withRateLimit } from "@/lib/rateLimit";
import { getEngineChatByIdForRequest } from "@/lib/tenant";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { prepareCredits } from "@/lib/credits/server";
import { devLogAppend } from "@/lib/logging/devLog";
import { debugLog, errorLog } from "@/lib/utils/debug";
import { normalizeV0Error } from "@/lib/v0/errors";
import { sendMessageSchema } from "@/lib/validations/chatSchemas";
import { WARN_CHAT_MESSAGE_CHARS, WARN_CHAT_SYSTEM_CHARS } from "@/lib/builder/promptLimits";
import { maybeExpandShortPromptWithBrief } from "@/lib/builder/promptBriefExpander";
import { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";
import { resolveModelSelection, resolveEngineModelId } from "@/lib/models/selection";
import { resolvePhaseModel } from "@/lib/models/phase-routing";
import {
  DEFAULT_MODEL_ID,
  MODEL_LABELS,
  getBuildProfileId,
} from "@/lib/models/catalog";
import { createGenerationPipeline } from "@/lib/gen/fallback";
import {
  buildContractClarificationQuestion,
  buildStoredContractClarificationUiPart,
} from "@/lib/gen/contract-clarification";
import { collectConfirmedContractAnswers } from "@/lib/gen/contract-answer-context";
import { compressUrls } from "@/lib/gen/url-compress";
import { prepareGenerationContext } from "@/lib/gen/orchestrate";
import {
  getClarificationCapOwnModelId,
  MAX_CONTRACT_CLARIFICATION_ROUNDS,
  resolveClarificationCapMaxOutputTokens,
  shouldOfferContractClarification,
  shouldUseClarificationCapBuild,
} from "@/lib/gen/contract-clarification-policy";
import { buildPlannerSystemPrompt } from "@/lib/gen/plan-prompt";
import {
  buildPlanSummaryMessage,
  buildPlanUiPart,
} from "@/lib/gen/plan-review";
import { getSystemPromptLengths } from "@/lib/gen/system-prompt";
import { getAgentTools } from "@/lib/gen/agent-tools";
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
import { buildFileContext } from "@/lib/gen/context";
import type { CodeFile } from "@/lib/gen/parser";
import { createOwnEnginePlanModeResponse } from "@/lib/providers/own-engine/plan-mode-response";
import { createOwnEngineGenerationStream } from "@/lib/providers/own-engine/generation-stream";
import {
  buildAwaitingClarificationStream,
  classifyFollowUpIntent,
  persistFollowUpClarification,
  resolveFollowUpClarification,
} from "@/lib/providers/own-engine/follow-up-clarification";

export const runtime = "nodejs";
export const maxDuration = 800;
const STREAM_RESOLVE_MAX_ATTEMPTS = 6;
const STREAM_RESOLVE_DELAY_MS = 1200;

function extractBaseVersionIdFromMeta(meta: unknown): string | null {
  const value = (meta as { baseVersionId?: unknown })?.baseVersionId;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseCodeFilesFromJson(raw: string | null | undefined): CodeFile[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const path = typeof (entry as { path?: unknown }).path === "string"
        ? (entry as { path: string }).path
        : null;
      const content = typeof (entry as { content?: unknown }).content === "string"
        ? (entry as { content: string }).content
        : null;
      if (!path || content === null) return [];
      const language = typeof (entry as { language?: unknown }).language === "string"
        ? (entry as { language: string }).language
        : "tsx";
      return [{ path, content, language }];
    });
  } catch {
    return [];
  }
}

async function resolveFollowUpBaseFiles(
  chatId: string,
  requestedBaseVersionId: string | null,
): Promise<{
  previousFiles: CodeFile[];
  sourceVersionId: string | null;
  source: "requested" | "latest" | "fallback" | "none";
}> {
  if (requestedBaseVersionId) {
    const requestedVersion = await chatRepo.getVersionById(requestedBaseVersionId);
    if (requestedVersion?.chat_id === chatId) {
      const requestedFiles = parseCodeFilesFromJson(requestedVersion.files_json);
      if (requestedFiles.length > 0) {
        return {
          previousFiles: requestedFiles,
          sourceVersionId: requestedVersion.id,
          source: "requested",
        };
      }
    }
  }

  const latestVersion = await chatRepo.getLatestVersion(chatId);
  if (latestVersion) {
    const latestFiles = parseCodeFilesFromJson(latestVersion.files_json);
    if (latestFiles.length > 0) {
      return {
        previousFiles: latestFiles,
        sourceVersionId: latestVersion.id,
        source: "latest",
      };
    }
  }

  const versions = await chatRepo.getVersionsByChat(chatId);
  for (const version of versions) {
    if (requestedBaseVersionId && version.id === requestedBaseVersionId) continue;
    if (latestVersion && version.id === latestVersion.id) continue;
    const files = parseCodeFilesFromJson(version.files_json);
    if (files.length > 0) {
      return {
        previousFiles: files,
        sourceVersionId: version.id,
        source: "fallback",
      };
    }
  }

  return {
    previousFiles: [],
    sourceVersionId: null,
    source: "none",
  };
}

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
        designSystemId: _clientDesignSystemId,
        meta,
      } =
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
      const engineChat = await getEngineChatByIdForRequest(req, chatId, { sessionId });
      if (!engineChat) {
        return attachSessionCookie(
          NextResponse.json({ error: "Chat not found" }, { status: 404 }),
        );
      }

      const resolvedModelId = modelSelection.modelId;
        const resolvedModelTier = modelSelection.modelTier;
        const buildProfileId = getBuildProfileId(resolvedModelTier);
        const resolvedThinking = typeof thinking === "boolean" ? thinking : true;
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
        const { scaffoldMode: metaScaffoldMode, scaffoldId: metaScaffoldId } =
          extractScaffoldSettingsFromMeta(meta);
        const metaThemeColors = extractThemeColorsFromMeta(meta);
        const metaBrief = extractBriefFromMeta(meta);
        const metaDesignThemePreset = extractDesignThemePresetFromMeta(meta);
        const metaPalette = extractPaletteStateFromMeta(meta);
        const designReferences = summarizeDesignReferences(requestAttachments);
        const contractAnswerContext = collectConfirmedContractAnswers(engineChat.messages, message);
        const metaBaseVersionId = extractBaseVersionIdFromMeta(meta);

        if (metaAppProjectId && engineChat.project_id !== metaAppProjectId) {
          try {
            await chatRepo.updateChatProjectId(engineChat.id, metaAppProjectId);
            engineChat.project_id = metaAppProjectId;
          } catch (error) {
            console.warn("[API/v0/chats/:chatId/stream] Failed to repair chat project mapping", {
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
          promptSourceKind: metaPromptSourceKind,
          promptSourceTechnical: metaPromptSourceTechnical,
          promptSourcePreservePayload: metaPromptSourcePreservePayload,
        });
        let optimizedMessage = promptOrchestration.finalMessage;

        const followUpBase = await resolveFollowUpBaseFiles(chatId, metaBaseVersionId);
        const previousFiles = followUpBase.previousFiles;
        if (followUpBase.source !== "none") {
          devLogAppend("in-progress", {
            type: "followup.base-version",
            chatId,
            source: followUpBase.source,
            versionId: followUpBase.sourceVersionId,
            requestedVersionId: metaBaseVersionId,
            fileCount: previousFiles.length,
          });
        }

        const briefExpandResult = await maybeExpandShortPromptWithBrief({
          message: optimizedMessage,
          brief: metaBrief,
          strategy: promptOrchestration.strategyMeta.strategy,
          promptSourcePreservePayload: metaPromptSourcePreservePayload,
          initialBuildTurn: previousFiles.length === 0,
          buildIntent: metaBuildIntent,
          abortSignal: req.signal,
          meta: meta && typeof meta === "object" ? (meta as Record<string, unknown>) : null,
        });
        if (briefExpandResult.wasExpanded) {
          optimizedMessage = briefExpandResult.message;
          devLogAppend("in-progress", {
            type: "prompt.brief.expand",
            chatId,
            originalLength: promptOrchestration.finalMessage.length,
            expandedLength: optimizedMessage.length,
          });
        }

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
          const fileCtx = buildFileContext({
            files: previousFiles,
            maxChars: 140_000,
            includeContents: true,
            maxFilesWithContent: 8,
          });

          if (skipIntentClassification) {
            optimizedMessage = [
              "## Existing Project Files (reference)",
              "",
              "Apply the requested change precisely. Do not modify unrelated sections or files.",
              "Return only the files you need to create or modify. Files you omit will be kept as-is.",
              "",
              fileCtx.summary,
              "",
              "---",
              "",
              optimizedMessage,
            ].join("\n");
          } else {
            optimizedMessage = [
              "## Follow-up Editing Mode",
              "",
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
              "",
              fileCtx.summary,
              "",
              "---",
              "",
              "## Requested Changes",
              "",
              optimizedMessage,
            ].join("\n");
          }
        }

        if (contractAnswerContext.currentReplyWasConsumed) {
          const latestAnswer = contractAnswerContext.confirmedAnswers.at(-1);
          if (latestAnswer) {
            optimizedMessage = [
              "## Contract Clarification Answer",
              "",
              "The user is answering the previous contract clarification question. Use this answer to continue the existing generation safely.",
              `Question: ${latestAnswer.question}`,
              `Answer: ${latestAnswer.answer}`,
              "",
              "Continue the existing implementation using this confirmed decision. Do not ask the same question again unless the answer is still genuinely insufficient.",
              "",
              "## User Reply",
              "",
              optimizedMessage,
            ].join("\n");
          }
        }

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
        let didChargeCredits = false;
        const commitCreditsOnce = async () => {
          if (didChargeCredits) return;
          didChargeCredits = true;
          try {
            await creditCheck.commit();
          } catch (error) {
            console.error("[credits] Failed to charge refine:", error);
          }
        };

        if (metaPlanMode) {
          await chatRepo.addMessage(engineChat.id, "user", optimizedMessage);

          const planEngineIntent: BuildIntent =
            metaBuildIntent === "template" ||
            metaBuildIntent === "website" ||
            metaBuildIntent === "app"
              ? (metaBuildIntent as BuildIntent)
              : "website";
          const persistedScaffoldId = engineChat.scaffold_id;
          const planOrchestration = await prepareGenerationContext({
            prompt: optimizedMessage,
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
          });
          const planResolvedScaffold = planOrchestration.resolvedScaffold;
          if (planResolvedScaffold && !persistedScaffoldId) {
            try {
              await chatRepo.updateChatScaffoldId(chatId, planResolvedScaffold.id);
            } catch {
              /* best-effort persist */
            }
          }

          const planSystemPrompt = `${buildPlannerSystemPrompt()}\n\n---\n\n${planOrchestration.v0EnrichmentContext}`;
          const planChatHistory = engineChat.messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            }));
          const planModel = resolvePhaseModel(resolvedModelTier, "planner").modelId;
          const planPipelineStream = createGenerationPipeline({
            prompt: optimizedMessage,
            systemPrompt: planSystemPrompt,
            model: planModel,
            modelTier: resolvedModelTier,
            chatHistory: planChatHistory,
            thinking: resolvedThinking,
            abortSignal: req.signal,
            tools: getAgentTools(),
            maxSteps: 2,
            referenceAttachments: requestAttachments,
          });

          return attachSessionCookie(createOwnEnginePlanModeResponse({
            pipelineStream: planPipelineStream,
            chatId,
            modelId: planModel,
            modelTier: resolvedModelTier,
            buildProfileId,
            buildProfileLabel: MODEL_LABELS[resolvedModelTier],
            thinking: resolvedThinking,
            promptStrategyMeta: promptOrchestration.strategyMeta,
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
              demoUrl: null,
              awaitingInput: hasBlockers,
              planArtifact: planData,
              planMode: true,
            }),
            commitCredits: commitCreditsOnce,
            commitCreditsPosition: "before-done",
            normalizeQuestionToolCallIds: true,
          }));
        }

        await chatRepo.addMessage(engineChat.id, "user", optimizedMessage);

        const promptForLlm = optimizedMessage;

        const engineIntent: BuildIntent =
          metaBuildIntent === "template" ||
          metaBuildIntent === "website" ||
          metaBuildIntent === "app"
            ? (metaBuildIntent as BuildIntent)
            : "website";
        const persistedScaffoldId = engineChat.scaffold_id;
        const trimmedSystem = typeof system === "string" ? system.trim() : "";
        const clarificationConfirmedCount = contractAnswerContext.confirmedAnswers.length;
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
          persistedScaffoldId,
          contractAnswers: contractAnswerContext.confirmedAnswers,
          contractClarificationCapReached: shouldUseClarificationCapBuild(clarificationConfirmedCount),
          customInstructions: trimmedSystem || undefined,
        });
        const {
          resolvedScaffold,
          routePlan,
          preGenerationContracts,
          engineSystemPrompt,
          capabilities: engineCapabilitiesFromOrch,
        } = orchestration;
        const contractClarification = buildContractClarificationQuestion({
          buildIntent: engineIntent,
          context: preGenerationContracts,
        });
        if (
          contractClarification &&
          !shouldOfferContractClarification(true, clarificationConfirmedCount)
        ) {
          devLogAppend("in-progress", {
            type: "contracts.clarification-capped",
            chatId,
            clarificationConfirmedCount,
            unresolvedKinds: preGenerationContracts.unresolvedDecisions.map((e) => e.kind),
          });
        }
        if (resolvedScaffold && !persistedScaffoldId) {
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
        const promptLengths = getSystemPromptLengths(engineSystemPrompt);
        debugLog("prompt-cache", "System prompt lengths", promptLengths);

        const chatHistory = engineChat.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));

        const useClarificationCapBuild = shouldUseClarificationCapBuild(clarificationConfirmedCount);
        const engineModel = useClarificationCapBuild
          ? getClarificationCapOwnModelId()
          : resolveEngineModelId(resolvedModelTier);
        const clarificationCapMaxTokens = useClarificationCapBuild
          ? resolveClarificationCapMaxOutputTokens(resolvedModelTier)
          : undefined;
        debugLog("build", "Follow-up chat stream request", {
          chatId,
          buildProfileId,
          buildProfileLabel: MODEL_LABELS[resolvedModelTier],
          internalModelSelection: resolvedModelTier,
          enginePath: "own-engine",
          engineModel,
          clarificationCapBuild: useClarificationCapBuild,
          clarificationConfirmedCount,
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
        if (
          shouldOfferContractClarification(Boolean(contractClarification), clarificationConfirmedCount)
        ) {
          const nextRound = Math.min(
            clarificationConfirmedCount + 1,
            MAX_CONTRACT_CLARIFICATION_ROUNDS,
          );
          const assistantQuestion = await chatRepo.addMessage(
            chatId,
            "assistant",
            contractClarification!.question,
            undefined,
            [
              buildStoredContractClarificationUiPart(contractClarification!, {
                roundIndex: nextRound,
                maxRounds: MAX_CONTRACT_CLARIFICATION_ROUNDS,
              }),
            ],
          ).catch(() => null);
          devLogAppend("in-progress", {
            type: "contracts.clarification-requested",
            chatId,
            kind: contractClarification!.kind,
            reason: contractClarification!.reason,
          });
          const contractGateStream = new ReadableStream({
            start(controller) {
              const enc = new TextEncoder();
              controller.enqueue(enc.encode(formatSSEEvent("chatId", { id: chatId })));
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
                    scaffoldId: resolvedScaffold?.id ?? null,
                    scaffoldFamily: resolvedScaffold?.family ?? null,
                    contractDataMode: preGenerationContracts.contracts.dataMode,
                    contractDatabaseProvider: preGenerationContracts.contracts.databaseProvider ?? null,
                    contractAuthProvider: preGenerationContracts.contracts.authProvider ?? null,
                    contractPaymentProvider: preGenerationContracts.contracts.paymentProvider ?? null,
                    contractIntegrations: preGenerationContracts.contracts.integrations,
                    contractEnvVars: preGenerationContracts.contracts.envVars,
                    unresolvedContractDecisions: preGenerationContracts.unresolvedDecisions,
                    promptStrategy: promptOrchestration.strategyMeta.strategy,
                    promptType: promptOrchestration.strategyMeta.promptType,
                    promptBudgetTarget: promptOrchestration.strategyMeta.budgetTarget,
                    promptOriginalLength: promptOrchestration.strategyMeta.originalLength,
                    promptOptimizedLength: promptOrchestration.strategyMeta.optimizedLength,
                    promptReductionRatio: promptOrchestration.strategyMeta.reductionRatio,
                    promptStrategyReason: promptOrchestration.strategyMeta.reason,
                    promptComplexityScore: promptOrchestration.strategyMeta.complexityScore,
                    systemPromptLength: engineSystemPrompt.length,
                    briefApplied: Boolean(metaBrief),
                    customInstructionsLength: trimmedSystem?.length ?? 0,
                  }),
                ),
              );
              controller.enqueue(
                enc.encode(
                  formatSSEEvent("tool-call", {
                    toolName: "askClarifyingQuestion",
                    toolCallId: `contracts-${Date.now()}`,
                    args: contractClarification!,
                  }),
                ),
              );
              controller.enqueue(enc.encode(formatSSEEvent("content", contractClarification!.question)));
              controller.enqueue(
                enc.encode(
                  formatSSEEvent("done", {
                    chatId,
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
        const { compressed: enginePrompt, urlMap } = compressUrls(promptForLlm);
        const agentTools = getAgentTools();
        if (useClarificationCapBuild) {
          devLogAppend("in-progress", {
            type: "contracts.clarification-cap-build",
            chatId,
            clarificationConfirmedCount,
            model: engineModel,
            maxOutputTokens: clarificationCapMaxTokens ?? null,
          });
        }

        const pipelineStream = createGenerationPipeline({
          prompt: enginePrompt,
          systemPrompt: engineSystemPrompt,
          model: engineModel,
          modelTier: resolvedModelTier,
          chatHistory,
          thinking: resolvedThinking,
          abortSignal: req.signal,
          tools: agentTools,
          maxSteps: 2,
          maxTokens: clarificationCapMaxTokens,
          referenceAttachments: requestAttachments,
          streamMeta: { chatId },
        });

        const engineStream = createOwnEngineGenerationStream({
          chatId,
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
            scaffoldId: resolvedScaffold?.id ?? null,
            scaffoldFamily: resolvedScaffold?.family ?? null,
            capabilities: engineCapabilitiesFromOrch,
            contractClarificationCapBuild: useClarificationCapBuild,
            clarificationCapMaxOutputTokens: clarificationCapMaxTokens ?? null,
            contractDataMode: preGenerationContracts.contracts.dataMode,
            contractDatabaseProvider: preGenerationContracts.contracts.databaseProvider ?? null,
            contractAuthProvider: preGenerationContracts.contracts.authProvider ?? null,
            contractPaymentProvider: preGenerationContracts.contracts.paymentProvider ?? null,
            contractIntegrations: preGenerationContracts.contracts.integrations,
            contractEnvVars: preGenerationContracts.contracts.envVars,
            unresolvedContractDecisions: preGenerationContracts.unresolvedDecisions,
            promptStrategy: promptOrchestration.strategyMeta.strategy,
            promptType: promptOrchestration.strategyMeta.promptType,
            promptBudgetTarget: promptOrchestration.strategyMeta.budgetTarget,
            promptOriginalLength: promptOrchestration.strategyMeta.originalLength,
            promptOptimizedLength: promptOrchestration.strategyMeta.optimizedLength,
            promptReductionRatio: promptOrchestration.strategyMeta.reductionRatio,
            promptStrategyReason: promptOrchestration.strategyMeta.reason,
            promptComplexityScore: promptOrchestration.strategyMeta.complexityScore,
            systemPromptLength: engineSystemPrompt.length,
            briefApplied: Boolean(metaBrief),
            customInstructionsLength: trimmedSystem?.length ?? 0,
          },
          engineModel,
          optimizedMessage,
          engineIntent,
          routePlan: routePlan ?? null,
          resolvedScaffold: resolvedScaffold ?? null,
          urlMap,
          commitCredits: commitCreditsOnce,
          previousFiles: previousFiles.length > 0 ? previousFiles : undefined,
        });

        const engineHeaders = new Headers(createSSEHeaders());
        return attachSessionCookie(new Response(engineStream, { headers: engineHeaders }));
    } catch (err) {
      errorLog("v0", `Send message error (requestId=${requestId})`, err);
      const normalized = normalizeV0Error(err);
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
