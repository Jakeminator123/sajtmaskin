import { NextResponse } from "next/server";
import { previewUrlField } from "@/lib/api/preview-url-contract";
import { createSSEHeaders } from "@/lib/streaming";
import {
  withPromptToDoneMetricResponse,
  wrapStreamForPromptToDoneMetric,
} from "@/lib/observability/prompt-to-done-stream";
import { withRateLimit } from "@/lib/rateLimit";
import { getAppProjectByIdForRequest, getEngineChatByIdForRequest } from "@/lib/tenant";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { prepareCredits } from "@/lib/credits/server";
import { devLogAppend, devLogStartGeneration } from "@/lib/logging/devLog";
import { debugLog } from "@/lib/utils/debug";
import { sendMessageSchema } from "@/lib/validations/chatSchemas";
import { buildEngineStreamResponse, buildStreamErrorResponse } from "./stream-error-response";
import { MAX_PROMPT_HANDOFF_CHARS } from "@/lib/builder/promptLimits";
import { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";
import { FEATURES, FOLLOW_UP_TUNING } from "@/lib/config";
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
import { collectConfirmedContractAnswers } from "@/lib/gen/contract/answer-context";
import { hasHeavyCapabilities, inferCapabilities } from "@/lib/gen/capability-inference";
import { deriveFollowUpContextPolicy, isShellPageContent } from "@/lib/gen/build-spec";
import { compressUrls } from "@/lib/gen/url-compress";
import {
  buildGenerationInputPackage,
  finalizeOrchestrationPrompts,
  prepareGenerationContext,
  resolveOrchestrationBase,
  writeOrchestrationDynamicDump,
} from "@/lib/gen/orchestrate";
import { getDefaultThinkingEnabled } from "@/lib/gen/default-thinking";
import { classifyRequestKind } from "@/lib/gen/request-kind";
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
  resolvePlanModePlannerSettings,
} from "@/lib/own-engine/session/own-engine-plan-mode";
import { createOwnEnginePlanModeResponse } from "@/lib/providers/own-engine/plan-mode-response";
import { createPreGenerationContractGateReadableStream } from "@/lib/providers/own-engine/pre-generation-contract-gate";
import {
  buildAwaitingClarificationStream,
  classifyFollowUpIntent,
  hasDesignFollowUpSignal,
  persistFollowUpClarification,
  resolveFollowUpClarification,
  shouldIgnorePersistedScaffoldForMatch,
} from "@/lib/providers/own-engine/follow-up-clarification";
import {
  buildFollowUpBriefFromSnapshot,
  extractBriefSummaryFromSnapshot,
  formatPriorDesignContext,
  prependOrchestrationContinuityToFollowUp,
} from "@/lib/gen/orchestration-snapshot";
import { tryGenerateServerAutoBrief } from "@/lib/builder/site-brief-generation";
import { matchScaffold } from "@/lib/gen/scaffolds/matcher";
import { getScaffoldById } from "@/lib/gen/scaffolds/registry";
import { pickScaffoldVariant } from "@/lib/gen/scaffold-variants";
import {
  buildVariantHintsForBrief,
  formatVariantHintsForPrompt,
} from "@/lib/gen/scaffold-variants/variant-hints";
import { PROMPT_WRAPPER_HEADINGS, wrapWithSection } from "@/lib/gen/prompt-wrapper-contract";
import { appendHydratedTextAttachmentExcerpts } from "@/lib/gen/attachment-text-hydrate";
import { createPromptLog } from "@/lib/db/services/prompt-logs";
import { resolveOwnEngineMaxSteps } from "@/lib/own-engine/resolve-max-steps";

// ── Follow-up history management ──────────────────────────────────────────

type HistoryMessage = { role: "user" | "assistant"; content: string };

const CODE_BLOCK_HEAVY_THRESHOLD = 500;

/**
 * QW-4: bevara assistant-prosa innan första file-blocket. Designrationale
 * (typ "jag valde glassmorphism för att matcha ditt premium-tema", "lade
 * pricing överst för konvertering") skrivs typiskt FÖRE file-blocken.
 * Att kasta hela meddelandet gör att codegen-LLM:n förlorar sin egen
 * motivering på senare turns och kan välja motsatt riktning. Vi behåller
 * upp till ~800 tecken prosa-prefix + filsammanfattning.
 */
function compressOldAssistantContent(content: string): string {
  if (content.length < CODE_BLOCK_HEAVY_THRESHOLD) return content;
  const fileMatches = [...content.matchAll(/file="([^"]+)"/g)].map((m) => m[1]);
  const firstFileIdx = content.search(/file="/);
  // Ta prosa-prefixet om det finns (innan första file=) — annars första 800.
  const proseHead = (firstFileIdx > 0 ? content.slice(0, firstFileIdx) : content.slice(0, 800)).trim();
  if (fileMatches.length === 0) {
    const codeBlocks = (content.match(/```/g) || []).length / 2;
    if (codeBlocks < 1) return content;
    return proseHead + "\n\n[Earlier code blocks truncated — see current project files for latest version.]";
  }
  const fileSummary = `${fileMatches.slice(0, 8).join(", ")}${fileMatches.length > 8 ? ` (+${fileMatches.length - 8} more)` : ""}`;
  return `${proseHead}\n\n[Earlier code generation: ${fileSummary}. Current project files contain the latest version.]`;
}

function buildBoundedChatHistory(messages: Array<{ role: string; content: string }>): HistoryMessage[] {
  const filtered = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const recentCount = FOLLOW_UP_TUNING.maxRecentHistoryPairs * 2;
  if (filtered.length <= recentCount) return filtered;

  const older = filtered.slice(0, -recentCount).map((m) =>
    m.role === "assistant" ? { ...m, content: compressOldAssistantContent(m.content) } : m,
  );
  const recent = filtered.slice(-recentCount);
  return [...older, ...recent];
}

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
    const promptStartedAt = Date.now();
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
        // Follow-ups do not carry the init brief inline. For clear-redesign
        // follow-ups, a delta-brief is generated below. Otherwise `metaBrief`
        // stays null — but the original brief still lives in the chat's
        // orchestration_snapshot and is applied to the system prompt
        // downstream. The hasPersistedBrief flag below lets the model-info
        // panel ("Brief: applicerad / Systempromt: NK tecken" — SAJ-6/B5)
        // surface that the brief is still in effect for follow-ups, not just
        // for first prompts and clear-redesign deltas.
        let metaBrief: Record<string, unknown> | null = null;
        const hasPersistedBrief = Boolean(
          extractBriefSummaryFromSnapshot(
            engineChat.orchestration_snapshot as Record<string, unknown> | null,
          ),
        );
        const metaDesignThemePreset = parsedMeta.designThemePreset;
        const metaPalette = parsedMeta.palette;
        const metaPromptAssistModel = parsedMeta.promptAssistModel;
        const metaPromptAssistDeep = parsedMeta.promptAssistDeep;
        const metaPromptAssistMode = parsedMeta.promptAssistMode;
        const designReferences = summarizeDesignReferences(requestAttachments);
        const contractAnswerContext = collectConfirmedContractAnswers(engineChat.messages, message);

        if (metaAppProjectId && engineChat.project_id !== metaAppProjectId) {
          // IDOR guard: the caller can request a re-mapping to any
          // project id, so we must independently verify they actually
          // own the target project before re-pointing the chat row.
          const ownedTarget = await getAppProjectByIdForRequest(
            req,
            metaAppProjectId,
            { sessionId },
          );
          if (!ownedTarget) {
            return attachSessionCookie(
              NextResponse.json({ error: "forbidden" }, { status: 403 }),
            );
          }
          try {
            await chatRepo.updateChatProjectId(engineChat.id, ownedTarget.id);
            engineChat.project_id = ownedTarget.id;
          } catch (error) {
            console.warn("[API/engine/chats/:chatId/stream] Failed to repair chat project mapping", {
              chatId,
              currentProjectId: engineChat.project_id,
              targetProjectId: ownedTarget.id,
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

        const existingShellRoutePaths =
          previousFiles.length > 0
            ? extractAppRoutePathsFromFilePaths(
                previousFiles
                  .filter((file) => isShellPageContent(file.content ?? ""))
                  .map((file) => file.path),
              )
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
              wrapStreamForPromptToDoneMetric(
                buildAwaitingClarificationStream({
                  chatId,
                  clarification: followUpClarification,
                }),
                {
                  kind: "followup",
                  promptStartedAt,
                  signal: req.signal,
                },
              ),
              { headers: createSSEHeaders() },
            ),
          );
        }

        // Delta-brief: generate a fresh brief for clear-redesign follow-ups
        // so the Kod-LLM gets structured design context instead of raw text only.
        if (followUpIntent === "clear-redesign" && previousFiles.length > 0) {
          const persistedScaffoldIdForDelta = engineChat.scaffold_id;
          const deltaIgnoreScaffold = shouldIgnorePersistedScaffoldForMatch({
            hasPreviousFiles: true,
            followUpIntent,
            message,
            scaffoldMode: metaScaffoldMode,
            scaffoldId: metaScaffoldId,
          });
          const deltaPreMatchScaffold = persistedScaffoldIdForDelta && !deltaIgnoreScaffold
            ? getScaffoldById(persistedScaffoldIdForDelta)
            : matchScaffold(message, (metaBuildIntent as BuildIntent | null));
          // Keyword-only pre-match for delta hint (~1ms). Final embedding-driven
          // pick happens in resolveOrchestrationBase later. See create-chat-stream-post.ts.
          const deltaPreMatchVariant = deltaPreMatchScaffold
            ? pickScaffoldVariant({ prompt: message, scaffoldId: deltaPreMatchScaffold.id })
            : null;
          const deltaVariantHints = buildVariantHintsForBrief(deltaPreMatchScaffold, deltaPreMatchVariant);
          const deltaVariantHintsText = deltaVariantHints
            ? formatVariantHintsForPrompt(deltaVariantHints)
            : undefined;

          const snapshotBriefSummary = extractBriefSummaryFromSnapshot(
            engineChat.orchestration_snapshot as Record<string, unknown> | null,
          );
          const priorContext = snapshotBriefSummary
            ? formatPriorDesignContext(snapshotBriefSummary)
            : undefined;

          const deltaBriefStartedAt = Date.now();
          const deltaBriefResult = await tryGenerateServerAutoBrief({
            prompt: message,
            assistModelHint: metaPromptAssistModel,
            imageGenerations: resolvedImageGenerations,
            signal: req.signal,
            variantHints: deltaVariantHintsText,
            priorDesignContext: priorContext,
          });
          if (deltaBriefResult) {
            metaBrief = deltaBriefResult.brief;
            debugLog("orchestration", "Delta-brief generated for clear-redesign follow-up", {
              chatId,
              durationMs: Date.now() - deltaBriefStartedAt,
              modelUsed: deltaBriefResult.modelUsed,
              hasPriorContext: Boolean(priorContext),
            });
          } else {
            debugLog("orchestration", "Delta-brief skipped or failed for clear-redesign follow-up", {
              chatId,
              durationMs: Date.now() - deltaBriefStartedAt,
            });
          }
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
          const designPinnedFiles = hasDesignFollowUpSignal(message)
            ? ["app/globals.css", "app/layout.tsx"]
            : undefined;
          const fileCtx = buildFileContext({
            files: previousFiles,
            maxChars: useLightFollowUpContext ? FOLLOW_UP_TUNING.lightContextMaxChars : 140_000,
            includeContents: true,
            maxFilesWithContent: useLightFollowUpContext
              ? (manyFiles ? FOLLOW_UP_TUNING.lightContextMaxFilesManyFiles : FOLLOW_UP_TUNING.lightContextMaxFilesFewFiles)
              : 8,
            pinnedFiles: designPinnedFiles,
            includeStructuralInventory: true,
          });

          // Element Preservation Rule lives in the system prompt's
          // `## Generation Mode: Follow-Up` block (richer version with
          // examples). Previously also re-stated here as
          // `elementPreservationReminder` — removed to avoid double-emit
          // (Q11.1, see docs/plans/active/llm-flow-quickwins.md).

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
            existingShellRoutePaths,
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
          const planChatHistory = buildBoundedChatHistory(engineChat.messages);
          const plannerSettings = resolvePlanModePlannerSettings(
            resolvedModelTier,
            resolvedThinking,
          );
          const planModel = plannerSettings.modelId;
          logPlanModeGenerationStart({
            planModel,
            promptLength: optimizedMessage.length,
            scaffoldId: planResolvedScaffold?.id ?? null,
            resolvedThinking: plannerSettings.thinking,
          });
          const planPipelineStream = createPlanModePipelineStream({
            optimizedMessage,
            planSystemPrompt,
            planModel,
            plannerThinking: plannerSettings.thinking,
            plannerReasoningEffort: plannerSettings.reasoningEffort,
            abortSignal: req.signal,
            chatHistory: planChatHistory,
            referenceAttachments: requestAttachments,
          });

          return attachSessionCookie(withPromptToDoneMetricResponse(createOwnEnginePlanModeResponse({
            pipelineStream: planPipelineStream,
            chatId,
            modelTier: resolvedModelTier,
            buildProfileId,
            buildProfileLabel: MODEL_LABELS[resolvedModelTier],
            thinking: plannerSettings.thinking,
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
          }), {
            kind: "followup",
            promptStartedAt,
            signal: req.signal,
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
        const snapshotRecord =
          engineChat.orchestration_snapshot && typeof engineChat.orchestration_snapshot === "object"
            ? (engineChat.orchestration_snapshot as Record<string, unknown>)
            : null;
        const snapshotVariantId =
          snapshotRecord && typeof snapshotRecord.variantId === "string"
            ? (snapshotRecord.variantId as string)
            : null;
        // P22b: ärv qualityTarget från senaste accepterad versions buildSpec
        // (lagrad i orchestration_snapshot). `inheritQualityTargetFromPriorVersion`
        // i orchestrate.ts är no-op om värdet saknas eller redan matchar baseSpec.
        const snapshotBuildSpec =
          snapshotRecord && snapshotRecord.buildSpec && typeof snapshotRecord.buildSpec === "object"
            ? (snapshotRecord.buildSpec as Record<string, unknown>)
            : null;
        const PRIOR_QUALITY_TARGETS = ["standard", "premium", "release-candidate"] as const;
        const rawPriorQualityTarget =
          snapshotBuildSpec && typeof snapshotBuildSpec.qualityTarget === "string"
            ? snapshotBuildSpec.qualityTarget
            : null;
        const priorQualityTarget =
          rawPriorQualityTarget &&
          (PRIOR_QUALITY_TARGETS as readonly string[]).includes(rawPriorQualityTarget)
            ? (rawPriorQualityTarget as (typeof PRIOR_QUALITY_TARGETS)[number])
            : null;
        const requestKindResult =
          previousFiles.length > 0 ? classifyRequestKind(message) : null;
        const orchestrationInput = {
          prompt: optimizedMessage,
          routePlanPrompt: message,
          buildSpecPrompt: message,
          // QW-1: contract-inferens + capability-inferens får rå message så
          // file-context-wrappingen i optimizedMessage inte förgiftar deras
          // semantiska beslut (t.ex. att en LoginForm-fil i context skulle
          // pinna `needsAuth`). Dossier-urvalet är capability-driven från
          // brief, så det behöver ingen rå-prompt.
          contractsPrompt: message,
          capabilitiesPrompt: message,
          // P26: scaffold-matchern (embedding + keyword) får också rå message
          // så embedding-API:t inte rejectas på `400 max 8192 tokens` när
          // optimizedMessage är ~30k tecken med inbäddad filkontext, och så
          // att keyword-fallback inte triggar APP_KEYWORDS via filcontextens
          // text. Tidigare flippade en bildbyte landing-page → app-shell och
          // promotade build_intent från website till app.
          scaffoldMatchPrompt: message,
          buildIntent: engineIntent,
          scaffoldMode: metaScaffoldMode,
          scaffoldId: metaScaffoldId,
          // A1+A2 fix (2026-04-21): on follow-up, hydrate a minimal brief
          // from the orchestration_snapshot when the client did not send
          // one inline (delta-brief flows still set `metaBrief`). This
          // restores capability-driven dossier selection on follow-ups —
          // without it, `selectDossiersForRequest` got `brief: null` and
          // dropped every capability the user originally asked for.
          brief:
            metaBrief ??
            buildFollowUpBriefFromSnapshot(
              engineChat.orchestration_snapshot as Record<string, unknown> | null,
            ),
          themeColors: metaThemeColors,
          imageGenerations: resolvedImageGenerations,
          componentPalette: metaPalette,
          designThemePreset: metaDesignThemePreset,
          designReferences,
          persistedScaffoldId,
          persistedVariantId: snapshotVariantId,
          contractAnswers: contractAnswerContext.confirmedAnswers,
          customInstructions: trimmedSystem || undefined,
          promptStrategyMeta: promptOrchestration.strategyMeta,
          generationMode: previousFiles.length > 0 ? ("followUp" as const) : undefined,
          isFirstCodeGeneration: previousFiles.length === 0 && Boolean(persistedScaffoldId),
          ignorePersistedScaffoldForMatch,
          existingRoutePaths,
          existingShellRoutePaths,
          capabilities: previousFiles.length > 0 ? inferCapabilities(message) : undefined,
          lifecycleStage: parsedMeta.lifecycleStage,
          // P22b: chatId + followUpIntent + priorQualityTarget aktiverar P22:s
          // helpers runtime (`inheritQualityTargetFromPriorVersion` i deriveBuildSpec
          // och `lockedVariantForFollowUp` i resolveScaffoldVariant). Utan dessa
          // är helpers dead code: tester gröna, produktion oförändrad.
          chatId,
          followUpIntent: previousFiles.length > 0 ? followUpIntent : undefined,
          priorQualityTarget,
          // Q5a: pass resolved engine model id so deriveBuildSpec scales
          // tokenBudgets to the model's actual context window.
          engineModelId: resolveEngineModelId(resolvedModelTier),
          requestKind: requestKindResult?.kind ?? null,
        };
        const orchestrationStartedAt = Date.now();
        const orchestrationBase = await resolveOrchestrationBase(orchestrationInput);
        if (requestKindResult) {
          devLogAppend("in-progress", {
            type: "request.kind.classified",
            chatId,
            kind: requestKindResult.kind,
            source: requestKindResult.source,
          });
        }
        debugLog("orchestration", "Follow-up orchestration base resolved", {
          chatId,
          durationMs: Date.now() - orchestrationStartedAt,
          qualityTarget: orchestrationBase.buildSpec.qualityTarget,
          contextPolicy: orchestrationBase.buildSpec.contextPolicy,
          scaffoldId: orchestrationBase.resolvedScaffold?.id ?? null,
          serializeMode: orchestrationBase.serializeMode,
          routeCount: orchestrationBase.routePlan.routes.length,
          requestKind: requestKindResult?.kind ?? null,
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

        const chatHistory = buildBoundedChatHistory(engineChat.messages);

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
          // P26: also surface the raw user message (truncated to 500 chars)
          // so devs can see exactly what the user typed without scrolling
          // through the wrapped optimizedMessage. Bekräftar samtidigt att
          // LLM:en faktiskt får råa intentet — det ligger sist i
          // optimizedMessage under rubriken "Begärda ändringar".
          rawMessage:
            message.length > 500 ? `${message.slice(0, 500)}…` : message,
          rawMessageLength: message.length,
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
              metaBriefApplied: Boolean(metaBrief) || hasPersistedBrief,
              customInstructionsLength: trimmedSystem?.length ?? 0,
            }),
          );
          return attachSessionCookie(new Response(
            wrapStreamForPromptToDoneMetric(contractGateStream, {
              kind: "followup",
              promptStartedAt,
              signal: req.signal,
            }),
            { headers: createSSEHeaders() },
          ));
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
          scaffoldVariant: finalized.variantId,
        });
        if (finalized.variantId) {
          devLogAppend("in-progress", {
            type: "orchestration.styleDirection",
            chatId,
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
          route: "POST /api/engine/chats/[chatId]/stream",
          planMode: false,
        });
        const promptLengths = getSystemPromptLengths(engineSystemPrompt);
        debugLog("prompt-cache", "System prompt lengths", promptLengths);

        const { compressed: enginePrompt, urlMap } = compressUrls(promptForLlm);
        const generatorThinking = resolvePhaseThinking(resolvedModelTier, "generator");
        const effectiveGeneratorThinking =
          resolvedThinking && generatorThinking.thinking;
        const engineStream = createOwnEnginePipelineAndGenerationStream({
          chatId,
          resolvedTier: resolvedModelTier,
          // Integration tools (`requestEnvVar`, `suggestIntegration`) are
          // only useful in F3 ("bygg integrationer") where the user is
          // wiring real keys. Stays off in F2 follow-ups so design-iteration
          // chats never surface env-var prompts.
          includeIntegrationSignals: parsedMeta.lifecycleStage === "integrations",
          pipeline: {
            prompt: enginePrompt,
            systemPrompt: engineSystemPrompt,
            model: engineModel,
            chatHistory,
            thinking: effectiveGeneratorThinking,
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
            resolvedThinking: effectiveGeneratorThinking,
            resolvedImageGenerations,
            strategyMeta: promptOrchestration.strategyMeta,
            orchestrationBase,
            buildSpec: orchestrationBase.buildSpec,
            engineSystemPromptLength: engineSystemPrompt.length,
            metaBriefApplied: Boolean(metaBrief) || hasPersistedBrief,
            customInstructionsLength: trimmedSystem?.length ?? 0,
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
          urlMap,
          commitCredits: commitCreditsOnce,
          previousFiles: previousFiles.length > 0 ? previousFiles : undefined,
          lineageHash,
          targetVersionId:
            metaPromptSourceKind === "autofix" && metaEngineBaseVersionId
              ? metaEngineBaseVersionId
              : undefined,
          lifecycleParentVersionId:
            parsedMeta.lifecycleStage === "integrations"
              ? parsedMeta.parentVersionId
              : null,
        });

        return buildEngineStreamResponse({
          engineStream,
          req,
          promptStartedAt,
          kind: "followup",
          attachSessionCookie,
        });
    } catch (err) {
      return buildStreamErrorResponse({
        err,
        req,
        requestId,
        promptStartedAt,
        kind: "followup",
        logLabel: "Send message error",
        devLogType: "comm.error.send",
        devLogExtras: { chatId: null },
        attachSessionCookie,
      });
    }
  };

  return options.skipRateLimit ? runHandler() : withRateLimit(req, "message:send", runHandler);
}

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return handleMessageStreamRequest(req, ctx);
}
