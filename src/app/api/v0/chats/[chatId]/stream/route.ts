import { NextResponse } from "next/server";
import { assertV0Key, v0 } from "@/lib/v0";
import { createSSEHeaders, formatSSEEvent } from "@/lib/streaming";
import { db } from "@/lib/db/client";
import { chats, versions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  extractContentText,
  extractDemoUrl,
  extractIntegrationSignals,
  extractMessageId,
  extractThinkingText,
  extractUiParts,
  extractVersionId,
  shouldSuppressContentForEvent,
  safeJsonParse,
} from "@/lib/v0Stream";
import { resolveLatestVersion } from "@/lib/v0/resolve-latest-version";
import { withRateLimit } from "@/lib/rateLimit";
import { getChatByV0ChatIdForRequest, getEngineChatByIdForRequest } from "@/lib/tenant";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { prepareCredits } from "@/lib/credits/server";
import { devLogAppend } from "@/lib/logging/devLog";
import { debugLog, errorLog, warnLog } from "@/lib/utils/debug";
import { sanitizeV0Metadata } from "@/lib/v0/sanitize-metadata";
import { normalizeV0Error } from "@/lib/v0/errors";
import { sendMessageSchema } from "@/lib/validations/chatSchemas";
import { WARN_CHAT_MESSAGE_CHARS, WARN_CHAT_SYSTEM_CHARS } from "@/lib/builder/promptLimits";
import { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";
import { resolveModelSelection, resolveEngineModelId } from "@/lib/v0/modelSelection";
import { DEFAULT_MODEL_ID, MODEL_LABELS, getBuildProfileId, v0TierToOpenAIModel } from "@/lib/v0/models";
import { shouldUseExplicitBuilderFallback, shouldUseV0Fallback, createGenerationPipeline } from "@/lib/gen/fallback";
import { compressUrls } from "@/lib/gen/url-compress";
import { prepareGenerationContext } from "@/lib/gen/orchestrate";
import { buildPlannerSystemPrompt, parsePlanResponse } from "@/lib/gen/plan-prompt";
import {
  buildPlanSummaryMessage,
  buildPlanUiPart,
  enrichPlanArtifactForReview,
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
import { SuspenseLineProcessor, parseSSEBuffer } from "@/lib/gen/route-helpers";
import * as chatRepo from "@/lib/db/chat-repository-pg";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { buildFileContext } from "@/lib/gen/context";
import type { CodeFile } from "@/lib/gen/parser";
import { EmptyGenerationError, finalizeAndSaveVersion } from "@/lib/gen/stream/finalize-version";
import { detectIntegrations } from "@/lib/gen/detect-integrations";

export const runtime = "nodejs";
export const maxDuration = 800;
const STREAM_RESOLVE_MAX_ATTEMPTS = 6;
const STREAM_RESOLVE_DELAY_MS = 1200;
const FOLLOW_UP_REFINE_PATTERNS = [
  /\b(förfina|förbättra|justera|uppdatera|ändra|byt ut|lägg till|fixa|trimma)\b/i,
  /\b(refine|improve|update|adjust|tweak|fix|keep the current design)\b/i,
  /\b(förfina nuvarande design|behåll nuvarande design)\b/i,
];
const FOLLOW_UP_REDESIGN_PATTERNS = [
  /\b(redesign|rebrand|restyle|start over|from scratch)\b/i,
  /\b(gör om från grunden|helt ny riktning|helt annan stil|byt stil helt)\b/i,
  /\b(tydlig redesign|starta om från en ny grund)\b/i,
];
const FOLLOW_UP_NEW_SITE_PATTERNS = [
  /\b(hemsida|sajt|landningssida|startsida)\b/i,
  /\b(website|site|homepage|landing page|one-pager)\b/i,
];
const FOLLOW_UP_BUILD_PATTERNS = [/\b(bygg|skapa|gör|designa)\b/i, /\b(build|create|make|design)\b/i];

type FollowUpIntentMode = "clear-refine" | "clear-redesign" | "ambiguous-redesign" | "neutral";

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

function classifyFollowUpIntent(message: string): FollowUpIntentMode {
  const trimmed = message.trim();
  if (!trimmed) return "neutral";
  if (FOLLOW_UP_REFINE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return "clear-refine";
  }
  if (FOLLOW_UP_REDESIGN_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return "clear-redesign";
  }
  const mentionsNewSite = FOLLOW_UP_NEW_SITE_PATTERNS.some((pattern) => pattern.test(trimmed));
  const soundsLikeBuildRequest = FOLLOW_UP_BUILD_PATTERNS.some((pattern) => pattern.test(trimmed));
  if (mentionsNewSite && soundsLikeBuildRequest) {
    return "ambiguous-redesign";
  }
  return "neutral";
}

function buildAwaitingClarificationStream(chatId: string, question: string, options: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(formatSSEEvent("chatId", { id: chatId })));
      controller.enqueue(
        enc.encode(
          formatSSEEvent("tool-call", {
            toolName: "askClarifyingQuestion",
            toolCallId: `clarify-redesign:${chatId}:${Date.now()}`,
            args: {
              question,
              options,
              kind: "scope",
              blocking: true,
            },
          }),
        ),
      );
      controller.enqueue(
        enc.encode(
          formatSSEEvent(
            "content",
            "Jag kan fortsätta direkt, men först behöver jag veta om du vill förfina den nuvarande sajten eller göra en verklig redesign.",
          ),
        ),
      );
      controller.enqueue(
        enc.encode(
          formatSSEEvent("done", {
            chatId,
            versionId: null,
            messageId: null,
            demoUrl: null,
            awaitingInput: true,
            reason: "followup_redesign_ambiguous",
          }),
        ),
      );
      controller.close();
    },
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  const requestId = req.headers.get("x-vercel-id") || "unknown";
  const session = ensureSessionIdFromRequest(req);
  const sessionId = session.sessionId;
  const attachSessionCookie = (response: Response) => {
    if (session.setCookie) {
      response.headers.set("Set-Cookie", session.setCookie);
    }
    return response;
  };
  return withRateLimit(req, "message:send", async () => {
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

        const followUpIntent = previousFiles.length > 0 ? classifyFollowUpIntent(message) : "neutral";
        if (followUpIntent === "ambiguous-redesign") {
          devLogAppend("latest", {
            type: "site.message.awaiting_input",
            chatId,
            reason: "followup_redesign_ambiguous",
            promptPreview: message.slice(0, 160),
          });
          return attachSessionCookie(
            new Response(
              buildAwaitingClarificationStream(chatId, "Vill du att jag förfinar den nuvarande sajten eller behandlar detta som en riktig redesign?", [
                "Förfina nuvarande design",
                "Gör en tydlig redesign i samma projekt",
                "Starta om från en ny grund",
              ]),
              { headers: createSSEHeaders() },
            ),
          );
        }

        if (previousFiles.length > 0) {
          const fileCtx = buildFileContext({
            files: previousFiles,
            maxChars: 14_000,
            includeContents: true,
            maxFilesWithContent: 8,
          });
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
          const planModel = resolveEngineModelId(resolvedModelTier, false);
          const planPipelineStream = createGenerationPipeline({
            prompt: optimizedMessage,
            systemPrompt: planSystemPrompt,
            model: planModel,
            chatHistory: planChatHistory,
            thinking: resolvedThinking,
            tools: getAgentTools(),
            maxSteps: 2,
            referenceAttachments: requestAttachments,
          });

          const planStream = new ReadableStream({
            async start(controller) {
              const enc = new TextEncoder();
              const reader = planPipelineStream.getReader();
              const decoder = new TextDecoder();
              let sseBuffer = "";
              let accumulatedContent = "";
              let controllerClosed = false;
              let toolPlanArtifact: Record<string, unknown> | null = null;

              const safeEnqueue = (data: Uint8Array) => {
                if (controllerClosed) return;
                try {
                  controller.enqueue(data);
                } catch {
                  controllerClosed = true;
                }
              };

              safeEnqueue(enc.encode(formatSSEEvent("chatId", { id: chatId })));
              safeEnqueue(
                enc.encode(
                  formatSSEEvent("meta", {
                    modelId: planModel,
                    modelTier: resolvedModelTier,
                    buildProfileId,
                    buildProfileLabel: MODEL_LABELS[resolvedModelTier],
                    enginePath: "plan-mode",
                    thinking: resolvedThinking,
                    planMode: true,
                    scaffoldId: planResolvedScaffold?.id ?? null,
                    scaffoldFamily: planResolvedScaffold?.family ?? null,
                    promptStrategy: promptOrchestration.strategyMeta.strategy,
                    promptType: promptOrchestration.strategyMeta.promptType,
                  }),
                ),
              );

              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  sseBuffer += decoder.decode(value, { stream: true });
                  const { events, remaining } = parseSSEBuffer(sseBuffer);
                  sseBuffer = remaining;

                  for (const evt of events) {
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
                        const toolName =
                          typeof toolData?.toolName === "string" ? toolData.toolName : "";
                        const toolArgs = (toolData?.args as Record<string, unknown>) ?? {};

                        if (toolName === "emitPlanArtifact") {
                          const enrichedPlanArtifact = enrichPlanArtifactForReview(toolArgs, {
                            resolvedScaffold: planResolvedScaffold,
                            scaffoldMode: metaScaffoldMode,
                          });
                          toolPlanArtifact = enrichedPlanArtifact;
                          safeEnqueue(
                            enc.encode(
                              formatSSEEvent("tool-call", {
                                toolName: "emitPlanArtifact",
                                toolCallId:
                                  typeof toolData.toolCallId === "string"
                                    ? toolData.toolCallId
                                    : `plan-${Date.now()}`,
                                args: enrichedPlanArtifact,
                              }),
                            ),
                          );
                        } else if (
                          toolName === "suggestIntegration" ||
                          toolName === "requestEnvVar" ||
                          toolName === "askClarifyingQuestion"
                        ) {
                          safeEnqueue(
                            enc.encode(
                              formatSSEEvent(
                                "tool-call",
                                toolName === "askClarifyingQuestion"
                                  ? {
                                      toolName,
                                      toolCallId:
                                        typeof toolData.toolCallId === "string"
                                          ? toolData.toolCallId
                                          : `q-${Date.now()}`,
                                      args: toolArgs,
                                    }
                                  : toolData,
                              ),
                            ),
                          );
                        }
                        break;
                      }
                      case "done":
                      case "error":
                        break;
                    }
                  }
                }
              } catch (error) {
                if (!controllerClosed) {
                  safeEnqueue(
                    enc.encode(
                      formatSSEEvent("error", {
                        message:
                          error instanceof Error ? error.message : "Plan generation failed",
                      }),
                    ),
                  );
                }
              }

              const planData = enrichPlanArtifactForReview(
                toolPlanArtifact ?? parsePlanResponse(accumulatedContent),
                {
                  resolvedScaffold: planResolvedScaffold,
                  scaffoldMode: metaScaffoldMode,
                },
              );
              const hasBlockers =
                Array.isArray(planData?.blockers) && (planData.blockers as unknown[]).length > 0;

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

              safeEnqueue(
                enc.encode(
                  formatSSEEvent("done", {
                    chatId,
                    versionId: null,
                    messageId: null,
                    demoUrl: null,
                    awaitingInput: hasBlockers,
                    planArtifact: planData,
                    planMode: true,
                  }),
                ),
              );

              await commitCreditsOnce();

              if (!controllerClosed) {
                try {
                  controller.close();
                } catch {
                  /* already closed */
                }
              }
            },
          });

          return attachSessionCookie(
            new Response(planStream, {
              headers: createSSEHeaders(),
            }),
          );
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
          customInstructions: trimmedSystem || undefined,
        });
        const { resolvedScaffold, engineSystemPrompt } = orchestration;
        if (resolvedScaffold && !persistedScaffoldId) {
          try {
            await chatRepo.updateChatScaffoldId(chatId, resolvedScaffold.id);
          } catch { /* best-effort persist */ }
        }
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
          engineModel: v0TierToOpenAIModel(resolvedModelTier),
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
        const { compressed: enginePrompt, urlMap } = compressUrls(promptForLlm);
        const agentTools = getAgentTools();
        const pipelineStream = createGenerationPipeline({
          prompt: enginePrompt,
          systemPrompt: engineSystemPrompt,
          model: engineModel,
          chatHistory,
          thinking: resolvedThinking,
          tools: agentTools,
          maxSteps: 2,
          referenceAttachments: requestAttachments,
        });

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

            const emitFinalizeProgress = (event: string, data: Record<string, unknown>) => {
              safeEnqueue(
                enc.encode(formatSSEEvent("progress", { step: event, ...data })),
              );
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
                    chatId,
                    versionId: null,
                    messageId: null,
                    demoUrl: null,
                    awaitingInput,
                    toolCalls,
                    reason,
                  }),
                ),
              );
              devLogAppend("latest", {
                type: awaitingInput ? "site.message.awaiting_input" : "site.message.empty_generation",
                chatId,
                reason,
                toolCalls,
                message: options?.userMessage ?? null,
              });
              await commitCreditsOnce();
            };

            const handleEmptyGeneration = async (reason: string, error: EmptyGenerationError) => {
              warnLog("engine", "No follow-up code emitted before finalize", {
                chatId: error.chatId,
                scaffold: error.scaffoldId,
                reason,
                toolCalls: Array.from(toolCallNames),
              });
              if (toolCallNames.size > 0) {
                await finishWithoutVersion(reason, {
                  awaitingInput: sawBlockingToolCall,
                });
                return;
              }
              await finishWithoutVersion(reason, {
                userMessage:
                  "Ingen uppdaterad kod genererades i det här försöket. Försök igen eller omformulera ändringen.",
              });
            };

            safeEnqueue(enc.encode(formatSSEEvent("chatId", { id: chatId })));
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
                  scaffoldId: resolvedScaffold?.id ?? null,
                  scaffoldFamily: resolvedScaffold?.family ?? null,
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
                      const toolName =
                        typeof toolData?.toolName === "string" ? toolData.toolName : "";
                      const toolArgs = (toolData?.args as Record<string, unknown>) ?? {};
                      if (toolName) toolCallNames.add(toolName);

                      if (toolName === "suggestIntegration") {
                        sawBlockingToolCall = true;
                        const envVars = Array.isArray(toolArgs.envVars)
                          ? (toolArgs.envVars as string[])
                          : [];
                        safeEnqueue(
                          enc.encode(
                            formatSSEEvent("integration", {
                              items: [
                                {
                                  key:
                                    typeof toolArgs.provider === "string"
                                      ? toolArgs.provider
                                      : "unknown",
                                  name:
                                    typeof toolArgs.name === "string"
                                      ? toolArgs.name
                                      : "Integration",
                                  provider:
                                    typeof toolArgs.provider === "string"
                                      ? toolArgs.provider
                                      : undefined,
                                  intent: "env_vars" as const,
                                  envVars,
                                  status: "Kräver konfiguration",
                                  reason:
                                    typeof toolArgs.reason === "string"
                                      ? toolArgs.reason
                                      : undefined,
                                  setupHint:
                                    typeof toolArgs.setupHint === "string"
                                      ? toolArgs.setupHint
                                      : undefined,
                                },
                              ],
                            }),
                          ),
                        );
                        const providerKey =
                          typeof toolArgs.provider === "string"
                            ? toolArgs.provider
                            : "unknown";
                        toolSignaledProviders.add(providerKey);
                      } else if (toolName === "requestEnvVar") {
                        sawBlockingToolCall = true;
                        safeEnqueue(
                          enc.encode(
                            formatSSEEvent("integration", {
                              items: [
                                {
                                  key: "custom-env",
                                  name: "Miljövariabel",
                                  intent: "env_vars" as const,
                                  envVars: [
                                    typeof toolArgs.key === "string"
                                      ? toolArgs.key
                                      : "UNKNOWN",
                                  ],
                                  status:
                                    typeof toolArgs.description === "string"
                                      ? toolArgs.description
                                      : "Kräver konfiguration",
                                },
                              ],
                            }),
                          ),
                        );
                      } else if (toolName === "askClarifyingQuestion") {
                        sawBlockingToolCall = true;
                        safeEnqueue(
                          enc.encode(
                            formatSSEEvent("tool-call", {
                              toolName: "askClarifyingQuestion",
                              toolCallId:
                                typeof toolData.toolCallId === "string"
                                  ? toolData.toolCallId
                                  : `q-${Date.now()}`,
                              args: toolArgs,
                            }),
                          ),
                        );
                      } else if (toolName === "emitPlanArtifact") {
                        safeEnqueue(
                          enc.encode(
                            formatSSEEvent("tool-call", {
                              toolName: "emitPlanArtifact",
                              toolCallId:
                                typeof toolData.toolCallId === "string"
                                  ? toolData.toolCallId
                                  : `plan-${Date.now()}`,
                              args: toolArgs,
                            }),
                          ),
                        );
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
                      const tokenUsage = {
                        prompt: typeof doneData?.promptTokens === "number" ? doneData.promptTokens : undefined,
                        completion: typeof doneData?.completionTokens === "number" ? doneData.completionTokens : undefined,
                      };
                      let finalized;
                      try {
                        finalized = await finalizeAndSaveVersion({
                          accumulatedContent,
                          chatId,
                          model: engineModel,
                          resolvedScaffold,
                          urlMap,
                          startedAt: engineStartedAt,
                          previousFiles,
                          tokenUsage,
                          logNote: "Follow-up done",
                          onProgress: emitFinalizeProgress,
                        });
                      } catch (error) {
                        if (error instanceof EmptyGenerationError) {
                          await handleEmptyGeneration("followup_done_empty_output", error);
                          break;
                        }
                        throw error;
                      }

                      didSendDone = true;

                      const detectedIntegrations = detectIntegrations(accumulatedContent).filter(
                        (item) => !toolSignaledProviders.has(item.key),
                      );
                      if (detectedIntegrations.length > 0) {
                        safeEnqueue(
                          enc.encode(
                            formatSSEEvent("integration", {
                              items: detectedIntegrations,
                            }),
                          ),
                        );
                      }

                      safeEnqueue(
                        enc.encode(
                          formatSSEEvent("done", {
                            chatId,
                            versionId: finalized.version.id,
                            messageId: finalized.messageId,
                            demoUrl: finalized.previewUrl,
                            preflight: finalized.preflight,
                            previewBlocked: finalized.preflight.previewBlocked,
                            verificationBlocked: finalized.preflight.verificationBlocked,
                            previewBlockingReason: finalized.preflight.previewBlockingReason,
                          }),
                        ),
                      );
                      devLogAppend("latest", {
                        type: "site.message.done",
                        chatId,
                        versionId: finalized.version.id,
                        demoUrl: finalized.previewUrl,
                        durationMs: Date.now() - engineStartedAt,
                      });
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

                    let bufferFinalized;
                    try {
                      bufferFinalized = await finalizeAndSaveVersion({
                        accumulatedContent,
                        chatId,
                        model: engineModel,
                        resolvedScaffold,
                        urlMap,
                        startedAt: engineStartedAt,
                        previousFiles,
                        logNote: "Follow-up buffer flush",
                        onProgress: emitFinalizeProgress,
                      });
                    } catch (error) {
                      if (error instanceof EmptyGenerationError) {
                        await handleEmptyGeneration("followup_buffer_empty_output", error);
                        break;
                      }
                      throw error;
                    }

                    didSendDone = true;

                    const bufIntegrations = detectIntegrations(accumulatedContent).filter(
                      (item) => !toolSignaledProviders.has(item.key),
                    );
                    if (bufIntegrations.length > 0) {
                      safeEnqueue(
                        enc.encode(
                          formatSSEEvent("integration", { items: bufIntegrations }),
                        ),
                      );
                    }

                    safeEnqueue(
                      enc.encode(
                        formatSSEEvent("done", {
                          chatId,
                          versionId: bufferFinalized.version.id,
                          messageId: bufferFinalized.messageId,
                          demoUrl: bufferFinalized.previewUrl,
                          preflight: bufferFinalized.preflight,
                          previewBlocked: bufferFinalized.preflight.previewBlocked,
                          verificationBlocked: bufferFinalized.preflight.verificationBlocked,
                          previewBlockingReason: bufferFinalized.preflight.previewBlockingReason,
                        }),
                      ),
                    );
                    debugLog("engine", "Saved version from buffer flush", {
                      chatId,
                      versionId: bufferFinalized.version.id,
                      contentLen: bufferFinalized.contentForVersion.length,
                    });
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
                      chatId,
                      model: engineModel,
                      resolvedScaffold,
                      urlMap,
                      startedAt: engineStartedAt,
                      previousFiles,
                      runAutofix: false,
                      logNote: "Follow-up fallback flush",
                      onProgress: emitFinalizeProgress,
                    });

                    didSendDone = true;

                    const fbIntegrations = detectIntegrations(accumulatedContent).filter(
                      (item) => !toolSignaledProviders.has(item.key),
                    );
                    if (fbIntegrations.length > 0) {
                      safeEnqueue(
                        enc.encode(
                          formatSSEEvent("integration", { items: fbIntegrations }),
                        ),
                      );
                    }

                    safeEnqueue(
                      enc.encode(
                        formatSSEEvent("done", {
                          chatId,
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
                    debugLog("engine", "Saved version from fallback flush", {
                      chatId,
                      versionId: fallbackFinalized.version.id,
                      contentLen: fallbackFinalized.contentForVersion.length,
                    });
                    await commitCreditsOnce();
                  } catch (error) {
                    if (error instanceof EmptyGenerationError) {
                      await handleEmptyGeneration("followup_fallback_empty_output", error);
                    }
                    // ignore persistence errors in cleanup
                  }
                }

                if (!didSendDone) {
                  safeEnqueue(
                    enc.encode(
                      formatSSEEvent("done", {
                        chatId,
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
        const v0Stream = result as ReadableStream<Uint8Array>;
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
            let _currentEvent = "";
            let didSendDone = false;
            let didSendChatMeta = false;
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

            if (!didSendChatMeta) {
              didSendChatMeta = true;
              safeEnqueue(encoder.encode(formatSSEEvent("chatId", { id: chatId })));
              if (existingChat?.projectId) {
                safeEnqueue(
                  encoder.encode(
                    formatSSEEvent("projectId", {
                      id: existingChat.projectId,
                      v0ProjectId: existingChat.v0ProjectId,
                    }),
                  ),
                );
              }
            }

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
                    chatId,
                    currentEvent: _currentEvent,
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
                    _currentEvent = line.slice(6).trim();
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
                  const suppressContent = shouldSuppressContentForEvent(parsed, _currentEvent, contentText);
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
                      devLogAppend("latest", {
                        type: "comm.tool_calls",
                        chatId,
                        tools: freshToolNames,
                        event: _currentEvent || null,
                      });
                    }
                    safeEnqueue(encoder.encode(formatSSEEvent("parts", uiParts)));
                  }

                  const integrationSignals = extractIntegrationSignals(
                    parsed,
                    _currentEvent,
                    uiParts || undefined,
                  );
                  if (integrationSignals.length > 0 && !didSendDone) {
                    const freshSignals = integrationSignals.filter(
                      (signal) => !seenIntegrationSignals.has(signal.key),
                    );
                    if (freshSignals.length > 0) {
                      freshSignals.forEach((signal) => seenIntegrationSignals.add(signal.key));
                      devLogAppend("latest", {
                        type: "comm.integration_signals",
                        chatId,
                        event: _currentEvent || null,
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
                  if (demoUrl) lastDemoUrl = demoUrl;
                  const versionId = extractVersionId(parsed);
                  if (versionId) lastVersionId = versionId;
                }
              }
            } catch (error) {
              console.error("Streaming sendMessage proxy error:", error);
              const normalized = normalizeV0Error(error);
              devLogAppend("latest", {
                type: "site.message.error",
                chatId,
                message: normalized.message,
                durationMs: Date.now() - requestStartedAt,
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

              if (!didSendDone && internalChatId) {
                try {
                  const resolved = await resolveLatestVersion(chatId, {
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

                  if (finalVersionId) {
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
                            chatId,
                            messageId: lastMessageId,
                            versionId: null,
                            demoUrl: null,
                            awaitingInput: true,
                          }),
                        ),
                      );

                      devLogAppend("latest", {
                        type: "comm.response.send",
                        chatId,
                        messageId: lastMessageId || null,
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
                          chatId,
                          messageId: lastMessageId,
                          versionId: finalVersionId,
                          demoUrl: finalDemoUrl,
                        }),
                      ),
                    );

                    devLogAppend("latest", {
                      type: "site.message.done",
                      chatId,
                      messageId: lastMessageId,
                      versionId: finalVersionId,
                      demoUrl: finalDemoUrl,
                      durationMs: Date.now() - requestStartedAt,
                    });
                    devLogAppend("latest", {
                      type: "comm.response.send",
                      chatId,
                      messageId: lastMessageId || null,
                      versionId: finalVersionId || null,
                      demoUrl: finalDemoUrl || null,
                      assistantPreview: assistantContentPreview || null,
                      thinkingPreview: assistantThinkingPreview || null,
                      toolCalls: Array.from(seenToolCalls),
                    });
                    await commitCreditsOnce();
                  }
                } catch (finalizeErr) {
                  console.error(
                    "Failed to finalize streaming message with latest version:",
                    finalizeErr,
                  );
                }
              }
              safeClose();
            }
          },
        });

        const headers = new Headers(createSSEHeaders());
        return attachSessionCookie(new Response(stream, { headers }));
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
  });
}
