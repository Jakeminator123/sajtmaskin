import { createSSEHeaders, formatSSEEvent } from "@/lib/streaming";
import { db } from "@/lib/db/client";
import { chats, versions } from "@/lib/db/schema";
import { assertV0Key, v0 } from "@/lib/v0";
import { createChatSchema } from "@/lib/validations/chatSchemas";
import {
  extractChatId,
  extractContentText,
  extractDemoUrl,
  extractIntegrationSignals,
  extractMessageId,
  extractThinkingText,
  extractUiParts,
  extractVersionId,
  isDoneLikeEvent,
  shouldSuppressContentForEvent,
  safeJsonParse,
} from "@/lib/v0Stream";
import { resolveLatestVersion } from "@/lib/v0/resolve-latest-version";
// drizzle-orm imports available if needed: and, eq
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
  getChatByV0ChatIdForRequest,
  resolveAppProjectIdForRequest,
} from "@/lib/tenant";
import { requireNotBot } from "@/lib/botProtection";
import { devLogAppend, devLogFinalizeSite, devLogStartNewSite } from "@/lib/logging/devLog";
import { debugLog, errorLog, warnLog } from "@/lib/utils/debug";
import { sanitizeV0Metadata } from "@/lib/v0/sanitize-metadata";
import { createPromptLog } from "@/lib/db/services";
import { resolveModelSelection, resolveEngineModelId } from "@/lib/v0/modelSelection";
import { DEFAULT_MODEL_ID, MODEL_LABELS, getBuildProfileId, v0TierToOpenAIModel } from "@/lib/v0/models";
import { AI } from "@/lib/config";
import { shouldUseExplicitBuilderFallback, shouldUseV0Fallback, createGenerationPipeline } from "@/lib/gen/fallback";
import { prepareGenerationContext } from "@/lib/gen/orchestrate";
import { buildPlannerSystemPrompt, parsePlanResponse } from "@/lib/gen/plan-prompt";
import { detectIntegrations } from "@/lib/gen/detect-integrations";
import { getAgentTools } from "@/lib/gen/agent-tools";
import { compressUrls } from "@/lib/gen/url-compress";
import {
  buildPlanSummaryMessage,
  buildPlanUiPart,
  enrichPlanArtifactForReview,
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
import { SuspenseLineProcessor, parseSSEBuffer } from "@/lib/gen/route-helpers";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { EmptyGenerationError, finalizeAndSaveVersion } from "@/lib/gen/stream/finalize-version";

export const runtime = "nodejs";
export const maxDuration = 800;
const STREAM_RESOLVE_MAX_ATTEMPTS = 6;
const STREAM_RESOLVE_DELAY_MS = 1200;

function appendPreview(current: string, incoming: string, max = 320): string {
  if (!incoming) return current;
  const next = `${current}${incoming}`;
  return next.length > max ? next.slice(-max) : next;
}

function looksLikeIncompleteJson(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  if (!(text.startsWith("{") || text.startsWith("[") || text.startsWith('"'))) return false;
  const openCurly = (text.match(/\{/g) || []).length;
  const closeCurly = (text.match(/\}/g) || []).length;
  const openSquare = (text.match(/\[/g) || []).length;
  const closeSquare = (text.match(/\]/g) || []).length;
  if (openCurly > closeCurly) return true;
  if (openSquare > closeSquare) return true;
  if (/\\$/.test(text)) return true;
  return false;
}

function extractToolNames(parts: Array<Record<string, unknown>>): string[] {
  const names: string[] = [];
  for (const part of parts) {
    const type = typeof part.type === "string" ? part.type : "";
    if (!type.startsWith("tool")) continue;
    const name =
      (typeof part.toolName === "string" && part.toolName) ||
      (typeof part.name === "string" && part.name) ||
      (typeof part.type === "string" && part.type) ||
      "tool-call";
    names.push(name);
  }
  return Array.from(new Set(names));
}

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
          : v0TierToOpenAIModel(resolvedModelTier),
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
        const engineModel = resolveEngineModelId(resolvedModelTier, false);
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
          model: engineModel,
          promptLength: optimizedMessage.length,
          thinking: resolvedThinking,
          scaffold: planOrchestration.resolvedScaffold?.id ?? null,
        });
        devLogAppend("in-progress", {
          type: "plan.generation.start",
          model: engineModel,
          promptLength: optimizedMessage.length,
          scaffold: planOrchestration.resolvedScaffold?.id ?? null,
        });

        const pipelineStream = createGenerationPipeline({
          prompt: optimizedMessage,
          systemPrompt: planSystemPrompt,
          model: engineModel,
          thinking: resolvedThinking,
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
          engineModel,
          planSystemPrompt,
          planOrchestration.resolvedScaffold?.id,
        );
        await chatRepo.addMessage(plannerChat.id, "user", optimizedMessage);

        const planStream = new ReadableStream({
          async start(controller) {
            const enc = new TextEncoder();
            const reader = pipelineStream.getReader();
            const decoder = new TextDecoder();
            let sseBuffer = "";
            let accumulatedContent = "";
            let controllerClosed = false;

            const safeEnqueue = (data: Uint8Array) => {
              if (controllerClosed) return;
              try { controller.enqueue(data); } catch { controllerClosed = true; }
            };

            safeEnqueue(enc.encode(formatSSEEvent("meta", {
              modelId: engineModel,
              modelTier: resolvedModelTier,
              buildProfileId,
              buildProfileLabel: MODEL_LABELS[resolvedModelTier],
              enginePath: "plan-mode",
              thinking: resolvedThinking,
              planMode: true,
              promptStrategy: strategyMeta.strategy,
              promptType: strategyMeta.promptType,
              promptBudgetTarget: strategyMeta.budgetTarget,
              promptOriginalLength: strategyMeta.originalLength,
              promptOptimizedLength: strategyMeta.optimizedLength,
              promptReductionRatio: strategyMeta.reductionRatio,
              promptStrategyReason: strategyMeta.reason,
              promptComplexityScore: strategyMeta.complexityScore,
            })));

            let toolPlanArtifact: Record<string, unknown> | null = null;

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                sseBuffer += decoder.decode(value, { stream: true });
                const { events: planEvents, remaining } = parseSSEBuffer(sseBuffer);
                sseBuffer = remaining;

                for (const evt of planEvents) {
                  if (controllerClosed) break;

                  switch (evt.event) {
                    case "thinking": {
                      const text =
                        typeof (evt.data as Record<string, unknown>)?.text === "string"
                          ? (evt.data as Record<string, string>).text
                          : "";
                      if (text) {
                        safeEnqueue(enc.encode(formatSSEEvent("thinking", { text })));
                      }
                      break;
                    }
                    case "content": {
                      const text =
                        typeof (evt.data as Record<string, unknown>)?.text === "string"
                          ? (evt.data as Record<string, string>).text
                          : "";
                      if (text) {
                        accumulatedContent += text;
                        safeEnqueue(enc.encode(formatSSEEvent("content", { text })));
                      }
                      break;
                    }
                    case "tool-call": {
                      const toolData = evt.data as Record<string, unknown>;
                      const toolName = typeof toolData?.toolName === "string" ? toolData.toolName : "";
                      const toolArgs = (toolData?.args as Record<string, unknown>) ?? {};

                      if (toolName === "emitPlanArtifact") {
                        const enrichedPlanArtifact = enrichPlanArtifactForReview(toolArgs, {
                          resolvedScaffold: planOrchestration.resolvedScaffold,
                          scaffoldMode: planScaffoldMode,
                        });
                        toolPlanArtifact = enrichedPlanArtifact;
                        safeEnqueue(enc.encode(formatSSEEvent("tool-call", {
                          toolName: "emitPlanArtifact",
                          toolCallId: typeof toolData.toolCallId === "string" ? toolData.toolCallId : `plan-${Date.now()}`,
                          args: enrichedPlanArtifact,
                        })));
                      } else if (toolName === "suggestIntegration" || toolName === "requestEnvVar") {
                        safeEnqueue(enc.encode(formatSSEEvent("tool-call", toolData)));
                      } else if (toolName === "askClarifyingQuestion") {
                        safeEnqueue(enc.encode(formatSSEEvent("tool-call", toolData)));
                      }
                      break;
                    }
                    case "done":
                    case "error":
                      break;
                  }
                }
              }
            } catch (err) {
              if (!controllerClosed) {
                safeEnqueue(enc.encode(formatSSEEvent("error", {
                  message: err instanceof Error ? err.message : "Plan generation failed",
                })));
              }
            }

            const planData = enrichPlanArtifactForReview(
              toolPlanArtifact ?? parsePlanResponse(accumulatedContent),
              {
                resolvedScaffold: planOrchestration.resolvedScaffold,
                scaffoldMode: planScaffoldMode,
              },
            );
            const hasBlockers = Array.isArray(planData?.blockers) &&
              (planData.blockers as unknown[]).length > 0;
            const blockerCount = hasBlockers
              ? (planData!.blockers as unknown[]).length
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

            safeEnqueue(enc.encode(formatSSEEvent("done", {
              chatId: plannerChat.id,
              planArtifact: planData,
              awaitingInput: hasBlockers,
              planMode: true,
            })));

            if (!controllerClosed) {
              try { controller.close(); } catch { /* already closed */ }
            }
          },
        });

        return attachSessionCookie(new Response(planStream, {
          headers: createSSEHeaders(),
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
        const { resolvedScaffold, capabilities: engineCapabilities, engineSystemPrompt } =
          orchestration;

        const promptLengths = getSystemPromptLengths(engineSystemPrompt);
        debugLog("prompt-cache", "System prompt lengths", promptLengths);

        const engineModel = resolveEngineModelId(resolvedModelTier, false);
        debugLog("engine", "Own engine model resolved", {
          resolvedModelTier,
          engineModel,
          fallback: false,
        });
        const { compressed: enginePrompt, urlMap } = compressUrls(optimizedMessage);
        const agentTools = getAgentTools();
        const pipelineStream = createGenerationPipeline({
          prompt: enginePrompt,
          systemPrompt: engineSystemPrompt,
          model: engineModel,
          thinking: resolvedThinking,
          tools: agentTools,
          maxSteps: 2,
          referenceAttachments: requestAttachments,
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

        const engineStartedAt = Date.now();
        const pipelineReader = pipelineStream.getReader();
        const pipelineDecoder = new TextDecoder();
        let engineControllerClosed = false;
        let enginePingTimer: ReturnType<typeof setInterval> | null = null;
        const stopEnginePing = () => {
          if (!enginePingTimer) return;
          clearInterval(enginePingTimer);
          enginePingTimer = null;
        };

        const engineStream = new ReadableStream({
          cancel() {
            engineControllerClosed = true;
            stopEnginePing();
            pipelineReader.cancel().catch(() => {});
          },
          async start(controller) {
            const enc = new TextEncoder();
            let sseBuffer = "";
            let accumulatedContent = "";
            let didSendDone = false;
            const toolSignaledProviders = new Set<string>();
            const toolCallNames = new Set<string>();
            let sawBlockingToolCall = false;
            const suspense = new SuspenseLineProcessor(undefined, { urlMap });

            const safeEnqueue = (data: Uint8Array) => {
              if (engineControllerClosed) return;
              try {
                controller.enqueue(data);
              } catch {
                engineControllerClosed = true;
                stopEnginePing();
              }
            };

            const safeClose = () => {
              if (engineControllerClosed) return;
              engineControllerClosed = true;
              stopEnginePing();
              try {
                controller.close();
              } catch {
                // already closed
              }
            };

            const emitProgress = (event: string, data: Record<string, unknown>) => {
              safeEnqueue(enc.encode(formatSSEEvent("progress", { step: event, ...data })));
            };

            const finishWithoutVersion = async (
              reason: string,
              options?: { userMessage?: string; awaitingInput?: boolean },
            ) => {
              didSendDone = true;
              const toolCalls = Array.from(toolCallNames);
              const awaitingInput = options?.awaitingInput ?? sawBlockingToolCall;

              if (options?.userMessage) {
                safeEnqueue(enc.encode(formatSSEEvent("content", options.userMessage)));
              }

              safeEnqueue(
                enc.encode(
                  formatSSEEvent("done", {
                    chatId: engineChat.id,
                    versionId: null,
                    messageId: null,
                    demoUrl: null,
                    awaitingInput,
                    toolCalls,
                    reason,
                  }),
                ),
              );

              devLogAppend("in-progress", {
                type: awaitingInput ? "site.awaiting_input" : "site.empty_generation",
                chatId: engineChat.id,
                reason,
                toolCalls,
                message: options?.userMessage ?? null,
              });
              devLogFinalizeSite();
              await commitCreditsOnce();
            };

            const handleEmptyGeneration = async (reason: string, error: EmptyGenerationError) => {
              const toolCalls = Array.from(toolCallNames);
              warnLog("engine", "No code emitted before finalize", {
                chatId: error.chatId,
                scaffold: error.scaffoldId,
                reason,
                toolCalls,
              });

              if (toolCalls.length > 0) {
                await finishWithoutVersion(reason, { awaitingInput: sawBlockingToolCall });
                return;
              }

              await finishWithoutVersion(reason, {
                userMessage: "Ingen kod genererades i första försöket. Försök igen med samma prompt.",
              });
            };

            safeEnqueue(enc.encode(formatSSEEvent("chatId", { id: engineChat.id })));
            safeEnqueue(
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
                  promptStrategy: strategyMeta.strategy,
                  promptType: strategyMeta.promptType,
                  promptBudgetTarget: strategyMeta.budgetTarget,
                  promptOriginalLength: strategyMeta.originalLength,
                  promptOptimizedLength: strategyMeta.optimizedLength,
                  promptReductionRatio: strategyMeta.reductionRatio,
                  promptStrategyReason: strategyMeta.reason,
                  promptComplexityScore: strategyMeta.complexityScore,
                }),
              ),
            );

            enginePingTimer = setInterval(() => {
              if (engineControllerClosed) return;
              safeEnqueue(enc.encode(formatSSEEvent("ping", { ts: Date.now() })));
            }, 15000);

            try {
              while (true) {
                if (engineControllerClosed || req.signal?.aborted) break;
                const { done, value } = await pipelineReader.read();
                if (done) break;

                sseBuffer += pipelineDecoder.decode(value, { stream: true });
                const { events, remaining } = parseSSEBuffer(sseBuffer);
                sseBuffer = remaining;

                for (const evt of events) {
                  if (engineControllerClosed) break;

                  switch (evt.event) {
                    case "thinking": {
                      const text =
                        typeof (evt.data as Record<string, unknown>)?.text === "string"
                          ? (evt.data as Record<string, string>).text
                          : "";
                      if (text) {
                        safeEnqueue(enc.encode(formatSSEEvent("thinking", text)));
                      }
                      break;
                    }

                    case "content": {
                      const text =
                        typeof (evt.data as Record<string, unknown>)?.text === "string"
                          ? (evt.data as Record<string, string>).text
                          : "";
                      if (text) {
                        const processed = suspense.process(text);
                        accumulatedContent += processed;
                        if (processed) {
                          safeEnqueue(enc.encode(formatSSEEvent("content", processed)));
                        }
                      }
                      break;
                    }

                    case "tool-call": {
                      const toolData = evt.data as Record<string, unknown>;
                      const toolName = typeof toolData?.toolName === "string" ? toolData.toolName : "";
                      const toolArgs = (toolData?.args as Record<string, unknown>) ?? {};
                      if (toolName) toolCallNames.add(toolName);

                      if (toolName === "suggestIntegration") {
                        sawBlockingToolCall = true;
                        const envVars = Array.isArray(toolArgs.envVars) ? toolArgs.envVars as string[] : [];
                        safeEnqueue(enc.encode(formatSSEEvent("integration", {
                          items: [{
                            key: typeof toolArgs.provider === "string" ? toolArgs.provider : "unknown",
                            name: typeof toolArgs.name === "string" ? toolArgs.name : "Integration",
                            provider: typeof toolArgs.provider === "string" ? toolArgs.provider : undefined,
                            intent: "env_vars" as const,
                            envVars,
                            status: "Kräver konfiguration",
                            reason: typeof toolArgs.reason === "string" ? toolArgs.reason : undefined,
                            setupHint: typeof toolArgs.setupHint === "string" ? toolArgs.setupHint : undefined,
                          }],
                        })));
                        const providerKey = typeof toolArgs.provider === "string" ? toolArgs.provider : "unknown";
                        toolSignaledProviders.add(providerKey);
                        debugLog("engine", "Tool: suggestIntegration", { provider: providerKey });
                      } else if (toolName === "requestEnvVar") {
                        sawBlockingToolCall = true;
                        safeEnqueue(enc.encode(formatSSEEvent("integration", {
                          items: [{
                            key: "custom-env",
                            name: "Miljövariabel",
                            intent: "env_vars" as const,
                            envVars: [typeof toolArgs.key === "string" ? toolArgs.key : "UNKNOWN"],
                            status: typeof toolArgs.description === "string" ? toolArgs.description : "Kräver konfiguration",
                          }],
                        })));
                      } else if (toolName === "askClarifyingQuestion") {
                        sawBlockingToolCall = true;
                        safeEnqueue(enc.encode(formatSSEEvent("tool-call", {
                          toolName: "askClarifyingQuestion",
                          toolCallId: typeof toolData.toolCallId === "string" ? toolData.toolCallId : `q-${Date.now()}`,
                          args: toolArgs,
                        })));
                      } else if (toolName === "emitPlanArtifact") {
                        safeEnqueue(enc.encode(formatSSEEvent("tool-call", {
                          toolName: "emitPlanArtifact",
                          toolCallId: typeof toolData.toolCallId === "string" ? toolData.toolCallId : `plan-${Date.now()}`,
                          args: toolArgs,
                        })));
                      }
                      break;
                    }

                    case "done": {
                      const flushed = suspense.flush();
                      if (flushed) {
                        accumulatedContent += flushed;
                        safeEnqueue(enc.encode(formatSSEEvent("content", flushed)));
                      }

                      const doneData = evt.data as Record<string, unknown> | null;
                      let finalized;
                      try {
                        finalized = await finalizeAndSaveVersion({
                          accumulatedContent,
                          chatId: engineChat.id,
                          model: engineModel,
                          resolvedScaffold,
                          urlMap,
                          startedAt: engineStartedAt,
                          tokenUsage: {
                            prompt: typeof doneData?.promptTokens === "number" ? doneData.promptTokens : undefined,
                            completion: typeof doneData?.completionTokens === "number" ? doneData.completionTokens : undefined,
                          },
                          onProgress: emitProgress,
                        });
                      } catch (error) {
                        if (error instanceof EmptyGenerationError) {
                          await handleEmptyGeneration("done_empty_output", error);
                          break;
                        }
                        throw error;
                      }

                      didSendDone = true;
                      const { version, messageId: assistantMsgId, previewUrl } = finalized;

                      const allDetected = detectIntegrations(accumulatedContent);
                      const newDetected = allDetected.filter(
                        (d) => !toolSignaledProviders.has(d.key),
                      );
                      if (newDetected.length > 0) {
                        safeEnqueue(
                          enc.encode(
                            formatSSEEvent("integration", {
                              items: newDetected,
                            }),
                          ),
                        );
                        devLogAppend("in-progress", {
                          type: "engine.integration_signals",
                          chatId: engineChat.id,
                          integrations: newDetected.map((d) => d.key),
                          envVars: newDetected.flatMap((d) => d.envVars),
                        });
                      }

                      safeEnqueue(
                        enc.encode(
                          formatSSEEvent("done", {
                            chatId: engineChat.id,
                            versionId: version.id,
                            messageId: assistantMsgId,
                            demoUrl: previewUrl,
                            preflight: finalized.preflight,
                            previewBlocked: finalized.preflight.previewBlocked,
                            verificationBlocked: finalized.preflight.verificationBlocked,
                            previewBlockingReason: finalized.preflight.previewBlockingReason,
                          }),
                        ),
                      );

                      devLogAppend("in-progress", {
                        type: "site.done",
                        chatId: engineChat.id,
                        versionId: version.id,
                        demoUrl: previewUrl,
                        durationMs: Date.now() - engineStartedAt,
                      });
                      devLogFinalizeSite();
                      await commitCreditsOnce();
                      break;
                    }

                    case "error": {
                      const msg =
                        typeof (evt.data as Record<string, unknown>)?.message === "string"
                          ? (evt.data as Record<string, string>).message
                          : "Engine generation failed";
                      safeEnqueue(
                        enc.encode(formatSSEEvent("error", { message: msg })),
                      );
                      devLogAppend("in-progress", {
                        type: "comm.error.create",
                        chatId: engineChat.id,
                        message: msg,
                      });
                      break;
                    }
                  }
                }
              }
            } catch (error) {
              console.error("Engine streaming error:", error);
              safeEnqueue(
                enc.encode(
                  formatSSEEvent("error", {
                    message:
                      error instanceof Error
                        ? error.message
                        : "Engine streaming failed",
                  }),
                ),
              );
            } finally {
              try {
                pipelineReader.releaseLock();
              } catch {
                // Reader may already be released
              }

              // Flush any remaining SSE data left in the buffer after stream ends
              if (sseBuffer.trim()) {
                const { events: finalEvents } = parseSSEBuffer(sseBuffer + "\n");
                for (const evt of finalEvents) {
                  if (evt.event === "content") {
                    const text =
                      typeof (evt.data as Record<string, unknown>)?.text === "string"
                        ? (evt.data as Record<string, string>).text
                        : "";
                    if (text) {
                      const processed = suspense.process(text);
                      accumulatedContent += processed;
                      if (processed) {
                        safeEnqueue(enc.encode(formatSSEEvent("content", processed)));
                      }
                    }
                  } else if (evt.event === "done" && !didSendDone) {
                    const flushed = suspense.flush();
                    if (flushed) {
                      accumulatedContent += flushed;
                      safeEnqueue(enc.encode(formatSSEEvent("content", flushed)));
                    }

                    const doneData = evt.data as Record<string, unknown> | null;
                    let bufFinalized;
                    try {
                      bufFinalized = await finalizeAndSaveVersion({
                        accumulatedContent,
                        chatId: engineChat.id,
                        model: engineModel,
                        resolvedScaffold,
                        urlMap,
                        startedAt: engineStartedAt,
                        tokenUsage: {
                          prompt: typeof doneData?.promptTokens === "number" ? doneData.promptTokens : undefined,
                          completion: typeof doneData?.completionTokens === "number" ? doneData.completionTokens : undefined,
                        },
                        logNote: "Done from buffer flush",
                        onProgress: emitProgress,
                      });
                    } catch (error) {
                      if (error instanceof EmptyGenerationError) {
                        await handleEmptyGeneration("buffer_flush_empty_output", error);
                        break;
                      }
                      throw error;
                    }

                    didSendDone = true;
                    safeEnqueue(
                      enc.encode(
                        formatSSEEvent("done", {
                          chatId: engineChat.id,
                          versionId: bufFinalized.version.id,
                          messageId: bufFinalized.messageId,
                          demoUrl: bufFinalized.previewUrl,
                          preflight: bufFinalized.preflight,
                          previewBlocked: bufFinalized.preflight.previewBlocked,
                          verificationBlocked: bufFinalized.preflight.verificationBlocked,
                          previewBlockingReason: bufFinalized.preflight.previewBlockingReason,
                        }),
                      ),
                    );
                    await commitCreditsOnce();
                  }
                }
              }

              if (!didSendDone) {
                const flushed = suspense.flush();
                if (flushed) accumulatedContent += flushed;

                if (accumulatedContent) {
                  try {
                    const fallbackFinalized = await finalizeAndSaveVersion({
                      accumulatedContent,
                      chatId: engineChat.id,
                      model: engineModel,
                      resolvedScaffold,
                      urlMap,
                      startedAt: engineStartedAt,
                      runAutofix: false,
                      logNote: "Done from fallback flush",
                      onProgress: emitProgress,
                    });
                    didSendDone = true;
                    safeEnqueue(
                      enc.encode(
                        formatSSEEvent("done", {
                          chatId: engineChat.id,
                          versionId: fallbackFinalized.version.id,
                          messageId: fallbackFinalized.messageId,
                          demoUrl: fallbackFinalized.previewUrl,
                          preflight: fallbackFinalized.preflight,
                          previewBlocked: fallbackFinalized.preflight.previewBlocked,
                          verificationBlocked: fallbackFinalized.preflight.verificationBlocked,
                          previewBlockingReason: fallbackFinalized.preflight.previewBlockingReason,
                        }),
                      ),
                    );
                    await commitCreditsOnce();
                  } catch (error) {
                    if (error instanceof EmptyGenerationError) {
                      await handleEmptyGeneration("fallback_flush_empty_output", error);
                    }
                    // ignore persistence errors in cleanup
                  }
                }

                if (!didSendDone) {
                  safeEnqueue(
                    enc.encode(
                      formatSSEEvent("done", {
                        chatId: engineChat.id,
                        versionId: null,
                        messageId: null,
                        demoUrl: null,
                      }),
                    ),
                  );
                  await commitCreditsOnce();
                }
              }
              safeClose();
            }
          },
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
        const v0Stream = result as unknown as ReadableStream<Uint8Array>;
        const reader = v0Stream.getReader();
        const decoder = new TextDecoder();

        // Hoisted so both cancel() and start() can access them
        let controllerClosed = false;
        let pingTimer: ReturnType<typeof setInterval> | null = null;
        const stopPing = () => {
          if (!pingTimer) return;
          clearInterval(pingTimer);
          pingTimer = null;
        };

        const stream = new ReadableStream({
          cancel() {
            controllerClosed = true;
            stopPing();
            reader.cancel().catch(() => {});
          },
          async start(controller) {
            const encoder = new TextEncoder();
            let buffer = "";
            let currentEvent = "";
            let v0ChatId: string | null = null;
            let internalChatId: string | null = null;
            let internalProjectId: string | null = null;
            let didSendChatId = false;
            let didSendProjectId = false;
            let didSendDone = false;
            let lastMessageId: string | null = null;
            let lastDemoUrl: string | null = null;
            let lastVersionId: string | null = null;
            let assistantContentPreview = "";
            let assistantThinkingPreview = "";
            const seenToolCalls = new Set<string>();
            const seenIntegrationSignals = new Set<string>();
            let pendingRawData: string | null = null;

            const safeEnqueue = (data: Uint8Array) => {
              if (controllerClosed) return;
              try {
                controller.enqueue(data);
              } catch {
                controllerClosed = true;
                stopPing();
              }
            };

            const safeClose = () => {
              if (controllerClosed) return;
              controllerClosed = true;
              stopPing();
              try {
                controller.close();
              } catch {
                // already closed
              }
            };

            const startPing = () => {
              if (pingTimer) return;
              pingTimer = setInterval(() => {
                if (controllerClosed) return;
                safeEnqueue(encoder.encode(formatSSEEvent("ping", { ts: Date.now() })));
              }, 15000);
            };

            // Keep a generous buffer window to avoid truncating large SSE data lines
            // mid-event (which can drop tool/question payloads).
            const MAX_BUFFER_SIZE = 8 * 1024 * 1024; // 8MB hard limit

            safeEnqueue(
              encoder.encode(
                formatSSEEvent("meta", {
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
                }),
              ),
            );
            startPing();

            try {
              while (true) {
                // Break early when the client disconnects or stream is cancelled
                if (controllerClosed || req.signal?.aborted) break;
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Prevent unbounded buffer growth from malformed streams.
                // Truncate at newline boundary to preserve event integrity.
                if (buffer.length > MAX_BUFFER_SIZE) {
                  const truncateTarget = buffer.length - MAX_BUFFER_SIZE;
                  const newlineIndex = buffer.indexOf("\n", truncateTarget);
                  warnLog("v0", "Stream buffer exceeded max size; truncating buffer", {
                    requestId,
                    chatId: v0ChatId,
                    currentEvent,
                    bufferLength: buffer.length,
                    maxBufferSize: MAX_BUFFER_SIZE,
                    truncateTarget,
                    newlineIndex,
                  });
                  if (newlineIndex !== -1) {
                    buffer = buffer.slice(newlineIndex + 1);
                  } else {
                    // Fallback: no newline found, keep a full tail window.
                    // This preserves as much context as possible for the parser.
                    buffer = buffer.slice(-MAX_BUFFER_SIZE);
                  }
                }

                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  if (controllerClosed) break;

                  if (line.startsWith("event:")) {
                    pendingRawData = null;
                    currentEvent = line.slice(6).trim();
                    continue;
                  }

                  if (!line.startsWith("data:")) continue;

                  let rawData = line.slice("data:".length);
                  if (rawData.startsWith(" ")) rawData = rawData.slice(1);
                  if (rawData.endsWith("\r")) rawData = rawData.slice(0, -1);
                  if (pendingRawData) {
                    rawData = `${pendingRawData}\n${rawData}`;
                  }
                  const parsed = safeJsonParse(rawData);
                  if (typeof parsed === "string" && looksLikeIncompleteJson(rawData)) {
                    pendingRawData = rawData;
                    continue;
                  }
                  pendingRawData = null;

                  if (!v0ChatId) {
                    const maybeChatId = extractChatId(parsed, currentEvent);
                    if (maybeChatId) {
                      v0ChatId = maybeChatId;
                    }
                  }

                  if (v0ChatId && !didSendChatId) {
                    didSendChatId = true;
                    const v0ProjectIdEffective = resolveV0ProjectId({
                      v0ChatId,
                      clientProjectId: projectId,
                    });
                    const projectName = generateProjectName({
                      v0ChatId,
                      clientProjectId: projectId,
                    });

                    try {
                      const ensured = await ensureProjectForRequest({
                        req,
                        v0ProjectId: v0ProjectIdEffective,
                        name: projectName,
                        sessionId,
                      });
                      internalProjectId = ensured.id;

                      // Use upsert to prevent race condition - atomically insert or get existing
                      internalChatId = nanoid();
                      const insertResult = await db
                        .insert(chats)
                        .values({
                          id: internalChatId,
                          v0ChatId: v0ChatId,
                          v0ProjectId: v0ProjectIdEffective,
                          projectId: internalProjectId,
                          webUrl: (parsed as Record<string, unknown>)?.webUrl as string | null ?? null,
                        })
                        .onConflictDoNothing({ target: chats.v0ChatId })
                        .returning({ id: chats.id });

                      // If insert was skipped due to conflict, fetch the existing chat
                      if (insertResult.length === 0) {
                        const existingChat = await getChatByV0ChatIdForRequest(req, v0ChatId, {
                          sessionId,
                        });
                        if (existingChat) {
                          internalChatId = existingChat.id;
                        } else {
                          console.warn(
                            "[v0-stream] Chat exists but is not accessible for this tenant",
                          );
                        }
                      }
                    } catch (dbError) {
                      console.error("Failed to save streaming chat to database:", dbError);
                    }

                    devLogAppend("in-progress", { type: "site.chatId", chatId: v0ChatId });
                    safeEnqueue(encoder.encode(formatSSEEvent("chatId", { id: v0ChatId })));

                    if (internalProjectId && !didSendProjectId) {
                      didSendProjectId = true;
                      safeEnqueue(
                        encoder.encode(
                          formatSSEEvent("projectId", {
                            id: internalProjectId,
                            v0ProjectId: v0ProjectIdEffective,
                          }),
                        ),
                      );
                    }
                  }

                  const messageId = extractMessageId(parsed);
                  if (messageId) {
                    lastMessageId = messageId;
                  }

                  const thinkingText = extractThinkingText(parsed);
                  if (thinkingText && !didSendDone) {
                    assistantThinkingPreview = appendPreview(assistantThinkingPreview, thinkingText);
                    safeEnqueue(encoder.encode(formatSSEEvent("thinking", thinkingText)));
                  }

                  const contentText = extractContentText(parsed, rawData);
                  const suppressContent = shouldSuppressContentForEvent(parsed, currentEvent, contentText);
                  if (contentText && !didSendDone && !suppressContent) {
                    assistantContentPreview = appendPreview(assistantContentPreview, contentText);
                    safeEnqueue(encoder.encode(formatSSEEvent("content", contentText)));
                  }

                  const uiParts = extractUiParts(parsed);
                  if (uiParts && uiParts.length > 0 && !didSendDone) {
                    const toolNames = extractToolNames(uiParts);
                    const freshToolNames = toolNames.filter((name) => !seenToolCalls.has(name));
                    if (freshToolNames.length > 0) {
                      freshToolNames.forEach((name) => seenToolCalls.add(name));
                      devLogAppend("in-progress", {
                        type: "comm.tool_calls",
                        chatId: v0ChatId,
                        tools: freshToolNames,
                        event: currentEvent || null,
                      });
                    }
                    safeEnqueue(encoder.encode(formatSSEEvent("parts", uiParts)));
                  }

                  const integrationSignals = extractIntegrationSignals(
                    parsed,
                    currentEvent,
                    uiParts || undefined,
                  );
                  if (integrationSignals.length > 0 && !didSendDone) {
                    const freshSignals = integrationSignals.filter(
                      (signal) => !seenIntegrationSignals.has(signal.key),
                    );
                    if (freshSignals.length > 0) {
                      freshSignals.forEach((signal) => seenIntegrationSignals.add(signal.key));
                      devLogAppend("in-progress", {
                        type: "comm.integration_signals",
                        chatId: v0ChatId,
                        event: currentEvent || null,
                        integrations: freshSignals,
                      });
                      safeEnqueue(
                        encoder.encode(
                          formatSSEEvent("integration", {
                            items: freshSignals,
                          }),
                        ),
                      );
                    }
                  }

                  const demoUrl = extractDemoUrl(parsed);
                  const versionId = extractVersionId(parsed);
                  if (demoUrl) {
                    lastDemoUrl = demoUrl;
                  }
                  if (versionId) {
                    lastVersionId = versionId;
                  }
                  const isDoneEvent = isDoneLikeEvent(currentEvent, parsed);
                  const finalDemoUrl = demoUrl || lastDemoUrl;
                  const finalVersionId = versionId || lastVersionId;

                  // Send "done" when:
                  // - preview/version is available, OR
                  // - v0 has completed with assistant content (clarification turn).
                  const hasMeaningfulData = finalDemoUrl || finalVersionId;
                  const hasAssistantReply = Boolean(
                    assistantContentPreview.trim() || assistantThinkingPreview.trim(),
                  );
                  const hasToolSignals =
                    seenToolCalls.size > 0 || seenIntegrationSignals.size > 0;
                  const shouldSendDone =
                    Boolean(finalDemoUrl) || (isDoneEvent && (hasMeaningfulData || hasAssistantReply));

                  if (!didSendDone && shouldSendDone) {
                    didSendDone = true;
                    const awaitingInput =
                      !finalDemoUrl && !finalVersionId && (hasAssistantReply || hasToolSignals);
                    safeEnqueue(
                      encoder.encode(
                        formatSSEEvent("done", {
                          chatId: v0ChatId,
                          demoUrl: finalDemoUrl || null,
                          versionId: finalVersionId || null,
                          messageId: lastMessageId,
                          projectId: internalProjectId || null,
                          awaitingInput,
                        }),
                      ),
                    );

                    if (internalChatId && finalVersionId) {
                      try {
                        // Use upsert to prevent race condition
                        await db
                          .insert(versions)
                          .values({
                            id: nanoid(),
                            chatId: internalChatId,
                            v0VersionId: finalVersionId,
                            v0MessageId: lastMessageId,
                            demoUrl: finalDemoUrl || null,
                            metadata: sanitizeV0Metadata(parsed),
                          })
                          .onConflictDoUpdate({
                            target: [versions.chatId, versions.v0VersionId],
                            set: {
                              v0MessageId: lastMessageId,
                              demoUrl: finalDemoUrl ?? null,
                              metadata: sanitizeV0Metadata(parsed),
                            },
                          });
                      } catch (dbError) {
                        console.error(
                          "Failed to save version to database:",
                          { chatId: internalChatId, versionId: finalVersionId },
                          dbError,
                        );
                      }
                    }

                    devLogAppend("in-progress", {
                      type: "site.done",
                      chatId: v0ChatId,
                      versionId: finalVersionId,
                      demoUrl: finalDemoUrl,
                      awaitingInput,
                      durationMs: Date.now() - generationStartedAt,
                    });
                    devLogAppend("in-progress", {
                      type: "comm.response.create",
                      chatId: v0ChatId,
                      versionId: finalVersionId || null,
                      demoUrl: finalDemoUrl || null,
                      assistantPreview: assistantContentPreview || null,
                      thinkingPreview: assistantThinkingPreview || null,
                      toolCalls: Array.from(seenToolCalls),
                    });
                    devLogFinalizeSite();
                    await commitCreditsOnce();
                  }
                }
              }
            } catch (error) {
              console.error("Streaming error:", error);
              const normalized = normalizeV0Error(error);
              devLogAppend("in-progress", {
                type: "comm.error.create",
                chatId: v0ChatId,
                message: normalized.message,
                code: normalized.code,
              });
              safeEnqueue(
                encoder.encode(
                  formatSSEEvent("error", {
                    message: normalized.message,
                    code: normalized.code,
                    retryAfter: normalized.retryAfter ?? null,
                  }),
                ),
              );
            } finally {
              // Release the stream reader lock to prevent memory leaks
              try {
                reader.releaseLock();
              } catch {
                // Reader may already be released
              }

              if (!didSendDone && !v0ChatId) {
                didSendDone = true;
                safeEnqueue(
                  encoder.encode(
                    formatSSEEvent("error", {
                      message: "No chat ID returned from stream. Please retry.",
                    }),
                  ),
                );
              }

              if (!didSendDone && v0ChatId) {
                try {
                  const resolved = await resolveLatestVersion(v0ChatId, {
                    preferVersionId: lastVersionId,
                    preferDemoUrl: lastDemoUrl,
                    maxAttempts: STREAM_RESOLVE_MAX_ATTEMPTS,
                    delayMs: STREAM_RESOLVE_DELAY_MS,
                  });
                  const finalVersionId = resolved.versionId || lastVersionId || null;
                  const finalDemoUrl = resolved.demoUrl || lastDemoUrl || null;
                  const hasAssistantReply = Boolean(
                    assistantContentPreview.trim() || assistantThinkingPreview.trim(),
                  );
                  const hasToolSignals =
                    seenToolCalls.size > 0 || seenIntegrationSignals.size > 0;

                  if (internalChatId && finalVersionId) {
                    // Use upsert to prevent race condition
                    await db
                      .insert(versions)
                      .values({
                        id: nanoid(),
                        chatId: internalChatId,
                        v0VersionId: finalVersionId,
                        v0MessageId: lastMessageId,
                        demoUrl: finalDemoUrl,
                        metadata: sanitizeV0Metadata(resolved.latestChat ?? null),
                      })
                      .onConflictDoUpdate({
                        target: [versions.chatId, versions.v0VersionId],
                        set: {
                          v0MessageId: lastMessageId,
                          demoUrl: finalDemoUrl,
                          metadata: sanitizeV0Metadata(resolved.latestChat ?? null),
                        },
                      });
                  }

                  didSendDone = true;
                  if (!finalVersionId && !finalDemoUrl) {
                    if (hasAssistantReply || hasToolSignals) {
                      safeEnqueue(
                        encoder.encode(
                          formatSSEEvent("done", {
                            chatId: v0ChatId,
                            demoUrl: null,
                            versionId: null,
                            messageId: lastMessageId,
                            projectId: internalProjectId || null,
                            awaitingInput: true,
                          }),
                        ),
                      );
                      devLogAppend("in-progress", {
                        type: "comm.response.create",
                        chatId: v0ChatId,
                        versionId: null,
                        demoUrl: null,
                        awaitingInput: true,
                        assistantPreview: assistantContentPreview || null,
                        thinkingPreview: assistantThinkingPreview || null,
                        toolCalls: Array.from(seenToolCalls),
                      });
                      await commitCreditsOnce();
                    } else {
                      safeEnqueue(
                        encoder.encode(
                          formatSSEEvent("error", {
                            code: "preview_unavailable",
                            message:
                              resolved.errorMessage ||
                              "No preview version was generated. Retry the prompt or run preview repair.",
                          }),
                        ),
                      );
                    }
                  } else {
                    safeEnqueue(
                      encoder.encode(
                        formatSSEEvent("done", {
                          chatId: v0ChatId,
                          demoUrl: finalDemoUrl,
                          versionId: finalVersionId,
                          messageId: lastMessageId,
                        }),
                      ),
                    );

                    devLogAppend("in-progress", {
                      type: "site.done",
                      chatId: v0ChatId,
                      versionId: finalVersionId,
                      demoUrl: finalDemoUrl,
                      durationMs: Date.now() - generationStartedAt,
                    });
                    devLogAppend("in-progress", {
                      type: "comm.response.create",
                      chatId: v0ChatId,
                      versionId: finalVersionId || null,
                      demoUrl: finalDemoUrl || null,
                      assistantPreview: assistantContentPreview || null,
                      thinkingPreview: assistantThinkingPreview || null,
                      toolCalls: Array.from(seenToolCalls),
                    });
                    devLogFinalizeSite();
                    await commitCreditsOnce();
                  }
                } catch (finalizeErr) {
                  console.error("Failed to finalize streaming chat:", finalizeErr);
                }
              }
              safeClose();
            }
          },
        });

        const headers = new Headers(createSSEHeaders());
        return attachSessionCookie(new Response(stream, { headers }));
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
