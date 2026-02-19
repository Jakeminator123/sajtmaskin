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
import { getChatByV0ChatIdForRequest } from "@/lib/tenant";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { prepareCredits } from "@/lib/credits/server";
import { devLogAppend } from "@/lib/logging/devLog";
import { debugLog, errorLog, warnLog } from "@/lib/utils/debug";
import { sanitizeV0Metadata } from "@/lib/v0/sanitize-metadata";
import { normalizeV0Error } from "@/lib/v0/errors";
import { sendMessageSchema } from "@/lib/validations/chatSchemas";
import { WARN_CHAT_MESSAGE_CHARS, WARN_CHAT_SYSTEM_CHARS } from "@/lib/builder/promptLimits";
import { orchestratePromptMessage } from "@/lib/builder/promptOrchestration";
import { resolveModelSelection } from "@/lib/v0/modelSelection";

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
      assertV0Key();

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

      const { message, attachments, modelId, thinking, imageGenerations, system, meta } =
        validationResult.data;
      const metaRequestedModelTier =
        typeof (meta as { modelTier?: unknown })?.modelTier === "string"
          ? String((meta as { modelTier?: string }).modelTier)
          : null;
      const modelSelection = resolveModelSelection({
        requestedModelId: modelId,
        requestedModelTier: metaRequestedModelTier,
        fallbackTier: "v0-max",
      });

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
        typeof thinking === "boolean" ? thinking : resolvedModelTier === "v0-max";
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
      const promptOrchestration = orchestratePromptMessage({
        message,
        buildMethod: metaBuildMethod,
        buildIntent: metaBuildIntent,
        isFirstPrompt: false,
        attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
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

      debugLog("v0", "v0 follow-up message request", {
        chatId,
        messageLength: optimizedMessage.length,
        originalMessageLength: message.length,
        attachments: Array.isArray(attachments) ? attachments.length : 0,
        modelId: resolvedModelId,
        modelTier: resolvedModelTier,
        customModelIdIgnored: modelSelection.customModelIdIgnored,
        usingCustomModelId: modelSelection.usingCustomModelId,
        thinking: resolvedThinking,
        imageGenerations: resolvedImageGenerations,
        promptStrategy: strategyMeta.strategy,
        promptType: strategyMeta.promptType,
      });

      const creditContext = {
        modelId: resolvedModelId,
        thinking: resolvedThinking,
        imageGenerations: resolvedImageGenerations,
        attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
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
        attachmentsCount: Array.isArray(attachments) ? attachments.length : null,
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
        attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
      });
      if (process.env.NODE_ENV === "development") {
        console.log("[dev-log] follow-up started", { chatId });
      }

      let result: unknown;
      try {
        result = await (v0.chats as any).sendMessage({
          chatId,
          message: optimizedMessage,
          attachments,
          modelConfiguration: {
            modelId: resolvedModelId,
            thinking: resolvedThinking,
            imageGenerations: resolvedImageGenerations,
          },
          ...(trimmedSystemPrompt ? { system: trimmedSystemPrompt } : {}),
          responseMode: "experimental_stream",
        });
      } catch (streamErr) {
        console.warn(
          "sendMessage streaming not available, falling back to non-stream response:",
          streamErr,
        );
        result = await (v0.chats as any).sendMessage({
          chatId,
          message: optimizedMessage,
          attachments,
          modelConfiguration: {
            modelId: resolvedModelId,
            thinking: resolvedThinking,
            imageGenerations: resolvedImageGenerations,
          },
          ...(trimmedSystemPrompt ? { system: trimmedSystemPrompt } : {}),
        });
      }

      if (result && typeof (result as any).getReader === "function") {
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
            try {
              reader.releaseLock();
            } catch {
              // reader may already be released
            }
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
                  const suppressContent = shouldSuppressContentForEvent(parsed, _currentEvent);
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
                          demoUrl: finalDemoUrl,
                          metadata: sanitizeV0Metadata(resolved.latestChat ?? null),
                        },
                      });
                  }

                  didSendDone = true;
                  if (!finalVersionId && !finalDemoUrl) {
                    if (hasAssistantReply) {
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
                    if (process.env.NODE_ENV === "development") {
                      console.log("[dev-log] follow-up finished", {
                        chatId,
                        versionId: finalVersionId,
                        demoUrl: finalDemoUrl,
                      });
                    }
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

      const messageResult = result as any;
      const versionId =
        messageResult.versionId ||
        messageResult.latestVersion?.id ||
        messageResult.latestVersion?.versionId ||
        null;
      const demoUrl =
        messageResult.demoUrl ||
        messageResult.latestVersion?.demoUrl ||
        messageResult.latestVersion?.demo_url ||
        null;

      if (versionId) {
        const existing = await db
          .select()
          .from(versions)
          .where(and(eq(versions.chatId, internalChatId), eq(versions.v0VersionId, versionId)))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(versions).values({
            id: nanoid(),
            chatId: internalChatId,
            v0VersionId: versionId,
            v0MessageId: messageResult.messageId || null,
            demoUrl,
            metadata: sanitizeV0Metadata(messageResult),
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
