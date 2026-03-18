import { NextResponse } from "next/server";
import { assertV0Key, v0 } from "@/lib/v0";
import { createSSEHeaders, formatSSEEvent } from "@/lib/streaming";
import { db } from "@/lib/db/client";
import { chats, versions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { withRateLimit } from "@/lib/rateLimit";
import { getChatByV0ChatIdForRequest, getEngineChatByIdForRequest } from "@/lib/tenant";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { prepareCredits } from "@/lib/credits/server";
import { devLogAppend } from "@/lib/logging/devLog";
import { debugLog, errorLog } from "@/lib/utils/debug";
import { sanitizeV0Metadata } from "@/lib/v0/sanitize-metadata";
import { normalizeV0Error } from "@/lib/v0/errors";
import { sendMessageSchema } from "@/lib/validations/chatSchemas";
import { WARN_CHAT_MESSAGE_CHARS, WARN_CHAT_SYSTEM_CHARS } from "@/lib/builder/promptLimits";
import { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";
import { resolveModelSelection, resolveEngineModelId } from "@/lib/models/selection";
import { resolvePhaseModel } from "@/lib/models/phase-routing";
import {
  canonicalModelIdToOwnModelId,
  DEFAULT_MODEL_ID,
  MODEL_LABELS,
  getBuildProfileId,
} from "@/lib/models/catalog";
import { shouldUseExplicitBuilderFallback, shouldUseV0Fallback, createGenerationPipeline } from "@/lib/gen/fallback";
import {
  buildContractClarificationQuestion,
  buildStoredContractClarificationUiPart,
} from "@/lib/gen/contract-clarification";
import { collectConfirmedContractAnswers } from "@/lib/gen/contract-answer-context";
import { compressUrls } from "@/lib/gen/url-compress";
import { prepareGenerationContext } from "@/lib/gen/orchestrate";
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
import { createV0FallbackStream } from "@/lib/providers/v0-fallback";

export const runtime = "nodejs";
export const maxDuration = 800;
const STREAM_RESOLVE_MAX_ATTEMPTS = 6;
const STREAM_RESOLVE_DELAY_MS = 1200;

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
      let usingV0Fallback = shouldUseExplicitBuilderFallback(meta);
      const engineChat = usingV0Fallback
        ? null
        : await getEngineChatByIdForRequest(req, chatId, { sessionId });
      if (!usingV0Fallback && !engineChat) {
        const mappedV0Chat = await getChatByV0ChatIdForRequest(req, chatId, { sessionId });
        if (mappedV0Chat) {
          usingV0Fallback = true;
        } else {
          return attachSessionCookie(
            NextResponse.json({ error: "Chat not found" }, { status: 404 }),
          );
        }
      }

      // ── New Engine Path ───────────────────────────────────────────────
      if (!usingV0Fallback) {
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
          customInstructions: trimmedSystem || undefined,
        });
        const { resolvedScaffold, routePlan, preGenerationContracts, engineSystemPrompt } = orchestration;
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
        const promptLengths = getSystemPromptLengths(engineSystemPrompt);
        debugLog("prompt-cache", "System prompt lengths", promptLengths);

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
          fallbackConfigured: shouldUseV0Fallback(),
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
        const pipelineStream = createGenerationPipeline({
          prompt: enginePrompt,
          systemPrompt: engineSystemPrompt,
          model: engineModel,
          chatHistory,
          thinking: resolvedThinking,
          abortSignal: req.signal,
          tools: agentTools,
          maxSteps: 2,
          referenceAttachments: requestAttachments,
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
            capabilities: orchestration.capabilities,
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

      let existingChat = await getChatByV0ChatIdForRequest(req, chatId, { sessionId });

      // Fallback: if chat doesn't exist in our DB, create it on-the-fly
      // This handles cases where the initial chat creation failed to save
      if (!existingChat) {
        try {
          const { ensureProjectForRequest, resolveV0ProjectId } = await import("@/lib/tenant");
          const v0ProjectId = resolveV0ProjectId({ v0ChatId: chatId });
          const project = await ensureProjectForRequest({
            req,
            v0ProjectId,
            name: `Chat ${chatId}`,
            sessionId,
          });

          // Create the chat record with conflict handling for concurrent requests
          const newChatId = nanoid();
          const insertResult = await db
            .insert(chats)
            .values({
              id: newChatId,
              v0ChatId: chatId,
              v0ProjectId,
              projectId: project.id,
            })
            .onConflictDoNothing({ target: chats.v0ChatId })
            .returning({ id: chats.id, v0ChatId: chats.v0ChatId, v0ProjectId: chats.v0ProjectId });

          if (insertResult.length > 0) {
            // Insert succeeded
            existingChat = {
              id: insertResult[0].id,
              v0ChatId: insertResult[0].v0ChatId,
              v0ProjectId: insertResult[0].v0ProjectId,
              projectId: project.id,
              webUrl: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            debugLog("v0", "Created missing chat record on-the-fly", { chatId, newChatId });
          } else {
            // Conflict - chat was created by another concurrent request, fetch it
            existingChat = await getChatByV0ChatIdForRequest(req, chatId, { sessionId });
            if (!existingChat) {
              // Still not found (shouldn't happen, but handle gracefully)
              console.error("Chat exists but not accessible after conflict", { chatId });
              return attachSessionCookie(
                NextResponse.json({ error: "Chat not found" }, { status: 404 }),
              );
            }
            debugLog("v0", "Used existing chat after concurrent creation", {
              chatId,
              existingId: existingChat.id,
            });
          }
        } catch (createErr) {
          console.error("Failed to create chat record:", createErr);
          return attachSessionCookie(
            NextResponse.json({ error: "Chat not found" }, { status: 404 }),
          );
        }
      }

      const internalChatId: string = existingChat.id;
      const requestStartedAt = Date.now();

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
      const metaPromptSourceKind =
        typeof (meta as { promptSourceKind?: unknown })?.promptSourceKind === "string"
          ? (meta as { promptSourceKind?: string }).promptSourceKind
          : null;
      const metaPromptSourceTechnical =
        (meta as { promptSourceTechnical?: unknown })?.promptSourceTechnical === true;
      const metaPromptSourcePreservePayload =
        (meta as { promptSourcePreservePayload?: unknown })?.promptSourcePreservePayload === true;
      const metaScaffoldMode = (() => {
        const raw = typeof (meta as { scaffoldMode?: unknown })?.scaffoldMode === "string"
          ? String((meta as { scaffoldMode?: string }).scaffoldMode)
          : "auto";
        return (raw === "auto" || raw === "manual" || raw === "off") ? raw : "auto" as const;
      })();
      const metaScaffoldId =
        typeof (meta as { scaffoldId?: unknown })?.scaffoldId === "string"
          ? String((meta as { scaffoldId?: string }).scaffoldId)
          : null;
      const metaBrief = (() => {
        const raw = (meta as Record<string, unknown>)?.brief;
        if (!raw || typeof raw !== "object") return null;
        return raw as Record<string, unknown>;
      })();
      const metaThemeColors = (() => {
        const raw = (meta as Record<string, unknown>)?.themeColors;
        if (!raw || typeof raw !== "object") return null;
        const tc = raw as Record<string, unknown>;
        if (typeof tc.primary === "string" && typeof tc.secondary === "string" && typeof tc.accent === "string") {
          return { primary: tc.primary, secondary: tc.secondary, accent: tc.accent };
        }
        return null;
      })();
      const v0FbPalette = extractPaletteStateFromMeta(meta);
      const v0FbDesignThemePreset = extractDesignThemePresetFromMeta(meta);
      const v0FbDesignReferences = summarizeDesignReferences(requestAttachments);
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

      const buildProfileId = getBuildProfileId(resolvedModelTier);
      debugLog("v0", "Follow-up message request (own engine unless fallback=true)", {
        chatId,
        messageLength: optimizedMessage.length,
        originalMessageLength: message.length,
        attachments: requestAttachments.length,
        modelId: resolvedModelId,
        buildProfileId,
        buildProfileLabel: MODEL_LABELS[resolvedModelTier],
        internalModelSelection: resolvedModelTier,
        fallbackConfigured: shouldUseV0Fallback(),
        thinking: resolvedThinking,
        imageGenerations: resolvedImageGenerations,
        promptStrategy: strategyMeta.strategy,
        promptType: strategyMeta.promptType,
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

      devLogAppend("latest", {
        type: "site.message.start",
        chatId,
        message:
          typeof optimizedMessage === "string"
            ? `${optimizedMessage.slice(0, 500)}${optimizedMessage.length > 500 ? "…" : ""}`
            : null,
        slug: metaBuildMethod || metaBuildIntent || undefined,
        originalMessageLength: message.length,
        optimizedMessageLength: optimizedMessage.length,
        promptStrategy: strategyMeta.strategy,
        promptType: strategyMeta.promptType,
        attachmentsCount: requestAttachments.length || null,
      });
      devLogAppend("latest", {
        type: "comm.request.send",
        chatId,
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
      });

      const v0Orchestration = await prepareGenerationContext({
        prompt: optimizedMessage,
        buildIntent: (metaBuildIntent === "template" || metaBuildIntent === "website" || metaBuildIntent === "app"
          ? metaBuildIntent as BuildIntent
          : "website"),
        scaffoldMode: metaScaffoldMode,
        scaffoldId: metaScaffoldId,
        brief: metaBrief,
        themeColors: metaThemeColors,
        imageGenerations: resolvedImageGenerations,
        componentPalette: v0FbPalette,
        designThemePreset: v0FbDesignThemePreset,
        designReferences: v0FbDesignReferences,
      });

      const v0SystemPrompt = [
        trimmedSystemPrompt,
        v0Orchestration.v0EnrichmentContext,
      ].filter(Boolean).join("\n\n---\n\n");

      let result: unknown;
      try {
        result = await (v0.chats as unknown as Record<string, (...args: unknown[]) => unknown>).sendMessage({
          chatId,
          message: optimizedMessage,
          attachments: requestAttachments,
          modelConfiguration: {
            modelId: fallbackModelId,
            thinking: resolvedThinking,
            imageGenerations: resolvedImageGenerations,
          },
          ...(v0SystemPrompt ? { system: v0SystemPrompt } : {}),
          responseMode: "experimental_stream",
        });
      } catch (streamErr) {
        console.warn(
          "sendMessage streaming not available, falling back to non-stream response:",
          streamErr,
        );
        result = await (v0.chats as unknown as Record<string, (...args: unknown[]) => unknown>).sendMessage({
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
      }

      if (result && typeof (result as Record<string, unknown>).getReader === "function") {
        const stream = createV0FallbackStream({
          v0Stream: result as ReadableStream<Uint8Array>,
          signal: req.signal,
          requestId,
          identity: {
            mode: "follow-up",
            chatId,
            internalChatId,
            internalProjectId: existingChat?.projectId ?? null,
            v0ProjectId: existingChat?.v0ProjectId ?? null,
          },
          generationStartedAt: requestStartedAt,
          commitCredits: commitCreditsOnce,
        });
        return attachSessionCookie(new Response(stream, { headers: createSSEHeaders() }));
      }

      const messageResult = result as Record<string, unknown>;
      const latestVersion = messageResult.latestVersion as Record<string, unknown> | undefined;
      const versionId =
        messageResult.versionId ||
        latestVersion?.id ||
        latestVersion?.versionId ||
        null;
      const demoUrl =
        messageResult.demoUrl ||
        latestVersion?.demoUrl ||
        latestVersion?.demo_url ||
        null;

      if (versionId) {
        const vid = String(versionId);
        const existing = await db
          .select()
          .from(versions)
          .where(and(eq(versions.chatId, internalChatId), eq(versions.v0VersionId, vid)))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(versions).values({
            id: nanoid(),
            chatId: internalChatId,
            v0VersionId: String(versionId),
            v0MessageId: typeof messageResult.messageId === "string" ? messageResult.messageId : null,
            demoUrl: typeof demoUrl === "string" ? demoUrl : null,
            metadata: JSON.stringify(sanitizeV0Metadata(messageResult)),
          });
        }
      }

      await commitCreditsOnce();
      devLogAppend("latest", {
        type: "comm.response.send",
        chatId,
        messageId: messageResult.messageId || null,
        versionId,
        demoUrl,
        assistantPreview:
          (typeof messageResult.text === "string" && messageResult.text) ||
          (typeof messageResult.message === "string" && messageResult.message) ||
          null,
      });
      const headers = new Headers(createSSEHeaders());
      return attachSessionCookie(
        new Response(
          formatSSEEvent("done", {
            chatId,
            messageId: messageResult.messageId || null,
            versionId,
            demoUrl,
          }),
          { headers },
        ),
      );
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
