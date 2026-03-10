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
} from "@/lib/tenant";
import { requireNotBot } from "@/lib/botProtection";
import { devLogAppend, devLogFinalizeSite, devLogStartNewSite } from "@/lib/logging/devLog";
import { debugLog, errorLog, warnLog } from "@/lib/utils/debug";
import { sanitizeV0Metadata } from "@/lib/v0/sanitize-metadata";
import { createPromptLog } from "@/lib/db/services";
import { resolveModelSelection, resolveEngineModelId } from "@/lib/v0/modelSelection";
import { AI } from "@/lib/config";
import { shouldUseV0Fallback, createGenerationPipeline } from "@/lib/gen/fallback";
import { matchScaffold, getScaffoldById, serializeScaffoldForPrompt } from "@/lib/gen/scaffolds";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import { compressUrls } from "@/lib/gen/url-compress";
import { buildSystemPrompt, getSystemPromptLengths } from "@/lib/gen/system-prompt";
import { SuspenseLineProcessor, parseSSEBuffer } from "@/lib/gen/route-helpers";
import * as chatRepo from "@/lib/db/chat-repository";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { runAutoFix } from "@/lib/gen/autofix/pipeline";
import { validateAndFix } from "@/lib/gen/autofix/validate-and-fix";
import { buildPreviewUrl } from "@/lib/gen/preview";

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
      const _debugStream =
        process.env.NODE_ENV !== "production" && process.env.V0_STREAM_DEBUG === "1";

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
        modelId = "v0-max-fast",
        thinking = true,
        imageGenerations,
        chatPrivacy,
        designSystemId: clientDesignSystemId,
        meta,
      } = validationResult.data;
      const designSystemId = clientDesignSystemId || AI.designSystemId;
      const metaRequestedModelTier =
        typeof (meta as { modelTier?: unknown })?.modelTier === "string"
          ? String((meta as { modelTier?: string }).modelTier)
          : null;
      const modelSelection = resolveModelSelection({
        requestedModelId: modelId,
        requestedModelTier: metaRequestedModelTier,
        fallbackTier: "v0-max-fast",
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
      const metaAppProjectId =
        typeof (meta as { appProjectId?: unknown })?.appProjectId === "string"
          ? String((meta as { appProjectId?: string }).appProjectId).trim()
          : "";
      const promptOrchestration = orchestratePromptMessage({
        message,
        buildMethod: metaBuildMethod,
        buildIntent: metaBuildIntent,
        isFirstPrompt: true,
        attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
      });
      const strategyMeta = promptOrchestration.strategyMeta;
      let optimizedMessage = promptOrchestration.finalMessage;
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
        attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
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
          attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
          meta: metaPayload,
        });
      } catch (error) {
        console.warn("[prompt-log] Failed to record prompt log:", error);
      }

      debugLog("v0", "v0 chat stream request", {
        modelId: resolvedModelId,
        modelTier: resolvedModelTier,
        promptLength: optimizedMessage.length,
        originalPromptLength: message.length,
        attachments: Array.isArray(attachments) ? attachments.length : 0,
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
        attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
      });

      devLogStartNewSite({
        message: optimizedMessage,
        modelId: resolvedModelId,
        thinking: resolvedThinking,
        imageGenerations: resolvedImageGenerations,
        projectId,
        slug: metaBuildMethod || metaBuildIntent || undefined,
      });

      // ── New Engine Path ───────────────────────────────────────────────
      if (!shouldUseV0Fallback()) {
        const engineIntent: BuildIntent =
          metaBuildIntent === "template" || metaBuildIntent === "website" || metaBuildIntent === "app"
            ? (metaBuildIntent as BuildIntent)
            : "website";

        const metaScaffoldMode =
          typeof (meta as Record<string, unknown>)?.scaffoldMode === "string"
            ? String((meta as Record<string, string>).scaffoldMode)
            : "auto";
        const metaScaffoldId =
          typeof (meta as Record<string, unknown>)?.scaffoldId === "string"
            ? String((meta as Record<string, string>).scaffoldId)
            : null;

        let resolvedScaffold: ScaffoldManifest | null = null;
        if (metaScaffoldMode === "manual" && metaScaffoldId) {
          resolvedScaffold = getScaffoldById(metaScaffoldId);
        } else if (metaScaffoldMode === "auto") {
          resolvedScaffold = matchScaffold(optimizedMessage, engineIntent);
        }

        if (resolvedScaffold) {
          const scaffoldContext = serializeScaffoldForPrompt(resolvedScaffold);
          optimizedMessage = `${scaffoldContext}\n\n---\n\n${optimizedMessage}`;
          debugLog("engine", "Scaffold injected", {
            scaffoldId: resolvedScaffold.id,
            family: resolvedScaffold.family,
            mode: metaScaffoldMode,
          });
        }

        const engineSystemPrompt = buildSystemPrompt({
          intent: engineIntent,
          imageGenerations: resolvedImageGenerations,
        });
        const promptLengths = getSystemPromptLengths(engineSystemPrompt);
        debugLog("prompt-cache", "System prompt lengths", promptLengths);

        const engineModel = resolveEngineModelId(resolvedModelTier, false);
        debugLog("engine", "Own engine model resolved", {
          resolvedModelTier,
          engineModel,
          fallback: false,
        });
        const { compressed: enginePrompt, urlMap } = compressUrls(optimizedMessage);
        const pipelineStream = createGenerationPipeline({
          prompt: enginePrompt,
          systemPrompt: engineSystemPrompt,
          model: engineModel,
          thinking: resolvedThinking,
        });

        const projectIdForChat = metaAppProjectId || projectId || `proj-${nanoid()}`;
        const engineChat = chatRepo.createChat(projectIdForChat, engineModel, engineSystemPrompt);
        chatRepo.addMessage(engineChat.id, "user", optimizedMessage);

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

            safeEnqueue(enc.encode(formatSSEEvent("chatId", { id: engineChat.id })));
            safeEnqueue(
              enc.encode(
                formatSSEEvent("meta", {
                  modelId: engineModel,
                  thinking: resolvedThinking,
                  imageGenerations: resolvedImageGenerations,
                  chatPrivacy: resolvedChatPrivacy,
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

                    case "done": {
                      const flushed = suspense.flush();
                      if (flushed) {
                        accumulatedContent += flushed;
                        safeEnqueue(enc.encode(formatSSEEvent("content", flushed)));
                      }

                      let contentForVersion = accumulatedContent;
                      try {
                        const autoFixResult = await runAutoFix(accumulatedContent, {
                          chatId: engineChat.id,
                          model: engineModel,
                        });
                        contentForVersion = autoFixResult.fixedContent;

                        if (autoFixResult.fixes.length > 0 || autoFixResult.warnings.length > 0) {
                          devLogAppend("in-progress", {
                            type: "autofix.result",
                            chatId: engineChat.id,
                            fixes: autoFixResult.fixes,
                            warnings: autoFixResult.warnings.slice(0, 20),
                            dependencies: autoFixResult.dependencies,
                          });
                        }
                      } catch (autofixErr) {
                        console.warn("[autofix] Pipeline error, using raw content:", autofixErr);
                      }

                      const syntaxResult = await validateAndFix(contentForVersion, {
                        chatId: engineChat.id,
                        model: engineModel,
                      });
                      contentForVersion = syntaxResult.content;
                      if (syntaxResult.fixerUsed) {
                        devLogAppend("in-progress", {
                          type: "syntax-validation.result",
                          chatId: engineChat.id,
                          fixerImproved: syntaxResult.fixerImproved,
                          errorsBefore: syntaxResult.errorsBefore,
                          errorsAfter: syntaxResult.errorsAfter,
                        });
                      }

                      const assistantMsg = chatRepo.addMessage(
                        engineChat.id,
                        "assistant",
                        contentForVersion,
                      );
                      const { parseFilesFromContent, mergeVersionFiles } = await import("@/lib/gen/version-manager");
                      let filesJson = parseFilesFromContent(contentForVersion);
                      if (resolvedScaffold) {
                        const generatedFiles = (JSON.parse(filesJson) as Array<{ path: string; content: string; language?: string }>).map(f => ({ ...f, language: f.language || "tsx" }));
                        const scaffoldBase = resolvedScaffold.files.map((f) => ({
                          path: f.path,
                          content: f.content,
                          language: "tsx" as const,
                        }));
                        const mergedFiles = mergeVersionFiles(scaffoldBase, generatedFiles);
                        filesJson = JSON.stringify(mergedFiles);
                      }
                      const version = chatRepo.createVersion(
                        engineChat.id,
                        assistantMsg.id,
                        filesJson,
                      );

                      const doneData = evt.data as Record<string, unknown> | null;
                      chatRepo.logGeneration(
                        engineChat.id,
                        engineModel,
                        {
                          prompt:
                            typeof doneData?.promptTokens === "number"
                              ? doneData.promptTokens
                              : undefined,
                          completion:
                            typeof doneData?.completionTokens === "number"
                              ? doneData.completionTokens
                              : undefined,
                        },
                        Date.now() - engineStartedAt,
                        true,
                      );

                      didSendDone = true;
                      const previewUrl = buildPreviewUrl(engineChat.id, version.id);
                      safeEnqueue(
                        enc.encode(
                          formatSSEEvent("done", {
                            chatId: engineChat.id,
                            versionId: version.id,
                            messageId: assistantMsg.id,
                            demoUrl: previewUrl,
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

                    let contentForVersion = accumulatedContent;
                    try {
                      const autoFixResult = await runAutoFix(accumulatedContent, {
                        chatId: engineChat.id,
                        model: engineModel,
                      });
                      contentForVersion = autoFixResult.fixedContent;
                    } catch {
                      // use raw content
                    }

                    const bufferSyntaxResult = await validateAndFix(contentForVersion, {
                      chatId: engineChat.id,
                      model: engineModel,
                    });
                    contentForVersion = bufferSyntaxResult.content;

                    const assistantMsg = chatRepo.addMessage(
                      engineChat.id,
                      "assistant",
                      contentForVersion,
                    );
                    const { parseFilesFromContent, mergeVersionFiles } = await import("@/lib/gen/version-manager");
                    let filesJson = parseFilesFromContent(contentForVersion);
                    if (resolvedScaffold) {
                      const generatedFiles = (JSON.parse(filesJson) as Array<{ path: string; content: string; language?: string }>).map(f => ({ ...f, language: f.language || "tsx" }));
                      const scaffoldBase = resolvedScaffold.files.map((f) => ({
                        path: f.path,
                        content: f.content,
                        language: "tsx" as const,
                      }));
                      const mergedFiles = mergeVersionFiles(scaffoldBase, generatedFiles);
                      filesJson = JSON.stringify(mergedFiles);
                    }
                    const version = chatRepo.createVersion(
                      engineChat.id,
                      assistantMsg.id,
                      filesJson,
                    );

                    const doneData = evt.data as Record<string, unknown> | null;
                    chatRepo.logGeneration(
                      engineChat.id,
                      engineModel,
                      {
                        prompt:
                          typeof doneData?.promptTokens === "number"
                            ? doneData.promptTokens
                            : undefined,
                        completion:
                          typeof doneData?.completionTokens === "number"
                            ? doneData.completionTokens
                            : undefined,
                      },
                      Date.now() - engineStartedAt,
                      true,
                    );

                    didSendDone = true;
                    const previewUrl = buildPreviewUrl(engineChat.id, version.id);
                    safeEnqueue(
                      enc.encode(
                        formatSSEEvent("done", {
                          chatId: engineChat.id,
                          versionId: version.id,
                          messageId: assistantMsg.id,
                          demoUrl: previewUrl,
                        }),
                      ),
                    );
                    debugLog("engine", "Saved version from buffer flush", {
                      chatId: engineChat.id,
                      versionId: version.id,
                      contentLen: contentForVersion.length,
                      filesJson: filesJson.slice(0, 200),
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
                    const assistantMsg = chatRepo.addMessage(engineChat.id, "assistant", accumulatedContent);
                    const { parseFilesFromContent, mergeVersionFiles } = await import("@/lib/gen/version-manager");
                    let filesJson = parseFilesFromContent(accumulatedContent);
                    if (resolvedScaffold) {
                      const generatedFiles = (JSON.parse(filesJson) as Array<{ path: string; content: string; language?: string }>).map(f => ({ ...f, language: f.language || "tsx" }));
                      const scaffoldBase = resolvedScaffold.files.map((f) => ({
                        path: f.path,
                        content: f.content,
                        language: "tsx" as const,
                      }));
                      const mergedFiles = mergeVersionFiles(scaffoldBase, generatedFiles);
                      filesJson = JSON.stringify(mergedFiles);
                    }
                    const version = chatRepo.createVersion(
                      engineChat.id,
                      assistantMsg.id,
                      filesJson,
                    );
                    const previewUrl = buildPreviewUrl(engineChat.id, version.id);
                    didSendDone = true;
                    safeEnqueue(
                      enc.encode(
                        formatSSEEvent("done", {
                          chatId: engineChat.id,
                          versionId: version.id,
                          messageId: assistantMsg.id,
                          demoUrl: previewUrl,
                        }),
                      ),
                    );
                    debugLog("engine", "Saved version from fallback flush", {
                      chatId: engineChat.id,
                      versionId: version.id,
                      contentLen: accumulatedContent.length,
                    });
                    chatRepo.logGeneration(
                      engineChat.id,
                      engineModel,
                      {},
                      Date.now() - engineStartedAt,
                      true,
                      "Done from fallback flush",
                    );
                    await commitCreditsOnce();
                  } catch {
                    // ignore persistence errors in cleanup
                  }
                }

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

      const result = await v0.chats.create({
        message: optimizedMessage,
        ...(hasSystemPrompt ? { system: trimmedSystemPrompt } : {}),
        projectId,
        chatPrivacy: resolvedChatPrivacy,
        modelConfiguration: {
          modelId: resolvedModelId as string,
          thinking: resolvedThinking,
          imageGenerations: resolvedImageGenerations,
        },
        responseMode: "experimental_stream",
        ...(attachments ? { attachments } : {}),
        ...(designSystemId ? { designSystemId } : {}),
      } as Parameters<typeof v0.chats.create>[0] & { responseMode?: string; designSystemId?: string });

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
                  thinking: resolvedThinking,
                  imageGenerations: resolvedImageGenerations,
                  chatPrivacy: resolvedChatPrivacy,
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
                          messageId: messageId || null,
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
                            v0MessageId: messageId || null,
                            demoUrl: finalDemoUrl || null,
                            metadata: sanitizeV0Metadata(parsed),
                          })
                          .onConflictDoUpdate({
                            target: [versions.chatId, versions.v0VersionId],
                            set: {
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
