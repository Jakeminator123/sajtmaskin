import { NextResponse } from "next/server";
import { createSSEHeaders } from "@/lib/streaming";
import { withRateLimit } from "@/lib/rateLimit";
import { getEngineChatByIdForRequest } from "@/lib/tenant";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { prepareCredits } from "@/lib/credits/server";
import { devLogAppend } from "@/lib/logging/devLog";
import { debugLog, errorLog } from "@/lib/utils/debug";
import { normalizeProviderError } from "@/lib/providers/errors/normalize-provider-error";
import { sendMessageSchema } from "@/lib/validations/chatSchemas";
import { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";
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
import { collectConfirmedContractAnswers } from "@/lib/gen/contract-answer-context";
import { compressUrls } from "@/lib/gen/url-compress";
import {
  finalizeOrchestrationPrompts,
  prepareGenerationContext,
  resolveOrchestrationBase,
} from "@/lib/gen/orchestrate";
import { computeLineageHash } from "@/lib/gen/generation-input-package";
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
import { buildFileContext } from "@/lib/gen/context";
import type { CodeFile } from "@/lib/gen/parser";
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
} from "@/lib/providers/own-engine/follow-up-clarification";
import { prependOrchestrationContinuityToFollowUp } from "@/lib/gen/orchestration-snapshot";

export const runtime = "nodejs";
/** Server stream ceiling (seconds). Client-side stream safety timeout (`streamSafetyTimeoutMs` in manifest) is separate; if it fires first, the UI may abort before `done` while the server could still run. */
export const maxDuration = 800;

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
        optimizedMessage = prependOrchestrationContinuityToFollowUp(
          optimizedMessage,
          engineChat.orchestration_snapshot ?? null,
        );

        const latestEngineVersion = await chatRepo.getLatestVersion(chatId);
        let previousFiles: CodeFile[] = [];
        if (latestEngineVersion?.files_json) {
          try {
            previousFiles = JSON.parse(latestEngineVersion.files_json) as CodeFile[];
          } catch { /* ignore malformed JSON */ }
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
          await chatRepo.addMessage(engineChat.id, "user", message);

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

          const { planPreamble, planSystemPrompt } = computePlanModePlannerPrompts(planOrchestration);
          dumpPlanModePlannerPrompts(
            planPreamble,
            planOrchestration,
            planSystemPrompt,
            "POST /api/v0/chats/[chatId]/stream",
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

        await chatRepo.addMessage(engineChat.id, "user", message);

        const promptForLlm = optimizedMessage;

        const engineIntent: BuildIntent =
          metaBuildIntent === "template" ||
          metaBuildIntent === "website" ||
          metaBuildIntent === "app"
            ? (metaBuildIntent as BuildIntent)
            : "website";
        const persistedScaffoldId = engineChat.scaffold_id;
        const trimmedSystem = typeof system === "string" ? system.trim() : "";
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
          persistedScaffoldId,
          contractAnswers: contractAnswerContext.confirmedAnswers,
          customInstructions: trimmedSystem || undefined,
        };
        const orchestrationBase = await resolveOrchestrationBase(orchestrationInput);
        const { resolvedScaffold, routePlan, preGenerationContracts } = orchestrationBase;
        const contractClarification = buildContractClarificationQuestion({
          buildIntent: engineIntent,
          context: preGenerationContracts,
        });
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

        const chatHistory = engineChat.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }));

        const engineModel = resolveEngineModelId(resolvedModelTier, false);
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
              metaBriefApplied: Boolean(metaBrief),
              customInstructionsLength: trimmedSystem?.length ?? 0,
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
          route: "POST /api/v0/chats/[chatId]/stream",
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
            maxSteps: 2,
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
            engineSystemPromptLength: engineSystemPrompt.length,
            metaBriefApplied: Boolean(metaBrief),
            customInstructionsLength: trimmedSystem?.length ?? 0,
            scaffoldId: resolvedScaffold?.id ?? null,
            scaffoldFamily: resolvedScaffold?.family ?? null,
          }),
          engineModel,
          optimizedMessage,
          engineIntent,
          routePlan: routePlan ?? null,
          resolvedScaffold: resolvedScaffold ?? null,
          urlMap,
          commitCredits: commitCreditsOnce,
          previousFiles: previousFiles.length > 0 ? previousFiles : undefined,
          lineageHash,
        });

        const engineHeaders = new Headers(createSSEHeaders());
        return attachSessionCookie(new Response(engineStream, { headers: engineHeaders }));
    } catch (err) {
      errorLog("v0", `Send message error (requestId=${requestId})`, err);
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
