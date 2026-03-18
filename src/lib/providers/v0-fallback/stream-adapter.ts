import { formatSSEEvent } from "@/lib/streaming";
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
import { normalizeV0Error } from "@/lib/v0/errors";
import { sanitizeV0Metadata } from "@/lib/v0/sanitize-metadata";
import { db } from "@/lib/db/client";
import { chats, versions } from "@/lib/db/schema";
import { nanoid } from "nanoid";
import {
  ensureProjectForRequest,
  resolveV0ProjectId,
  generateProjectName,
  getChatByV0ChatIdForRequest,
} from "@/lib/tenant";
import { devLogAppend, devLogFinalizeSite } from "@/lib/logging/devLog";
import { warnLog } from "@/lib/utils/debug";
import {
  appendPreview,
  extractToolNames,
  looksLikeIncompleteJson,
} from "@/lib/gen/stream/shared-own-engine-helpers";

const DEFAULT_RESOLVE_MAX_ATTEMPTS = 6;
const DEFAULT_RESOLVE_DELAY_MS = 1200;
const MAX_BUFFER_SIZE = 8 * 1024 * 1024;

export interface V0FallbackCreateIdentity {
  mode: "create";
  req: Request;
  sessionId: string;
  clientProjectId?: string;
}

export interface V0FallbackFollowUpIdentity {
  mode: "follow-up";
  chatId: string;
  internalChatId: string;
  internalProjectId: string | null;
  v0ProjectId: string | null;
}

export type V0FallbackIdentity =
  | V0FallbackCreateIdentity
  | V0FallbackFollowUpIdentity;

export interface V0FallbackStreamParams {
  v0Stream: ReadableStream<Uint8Array>;
  signal?: AbortSignal;
  requestId: string;
  metaPayload?: Record<string, unknown>;
  identity: V0FallbackIdentity;
  generationStartedAt: number;
  commitCredits: () => Promise<void>;
  resolveMaxAttempts?: number;
  resolveDelayMs?: number;
}

export function createV0FallbackStream(
  params: V0FallbackStreamParams,
): ReadableStream<Uint8Array> {
  const {
    v0Stream,
    signal,
    requestId,
    metaPayload,
    identity,
    generationStartedAt,
    commitCredits,
    resolveMaxAttempts = DEFAULT_RESOLVE_MAX_ATTEMPTS,
    resolveDelayMs = DEFAULT_RESOLVE_DELAY_MS,
  } = params;

  const reader = v0Stream.getReader();
  const decoder = new TextDecoder();
  const isCreate = identity.mode === "create";
  const devChannel: "in-progress" | "latest" = isCreate ? "in-progress" : "latest";

  let controllerClosed = false;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  const stopPing = () => {
    if (!pingTimer) return;
    clearInterval(pingTimer);
    pingTimer = null;
  };

  return new ReadableStream({
    cancel() {
      controllerClosed = true;
      stopPing();
      reader.cancel().catch(() => {});
    },
    async start(controller) {
      const encoder = new TextEncoder();
      let buffer = "";
      let currentEvent = "";
      let didSendDone = false;
      let lastMessageId: string | null = null;
      let lastDemoUrl: string | null = null;
      let lastVersionId: string | null = null;
      let assistantContentPreview = "";
      let assistantThinkingPreview = "";
      const seenToolCalls = new Set<string>();
      const seenIntegrationSignals = new Set<string>();
      let pendingRawData: string | null = null;

      let v0ChatId: string | null = null;
      let internalChatId: string | null = null;
      let internalProjectId: string | null = null;
      let didSendChatId = false;
      let didSendProjectId = false;

      if (identity.mode === "follow-up") {
        v0ChatId = identity.chatId;
        internalChatId = identity.internalChatId;
        internalProjectId = identity.internalProjectId;
        didSendChatId = true;
      }

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
          /* already closed */
        }
      };

      const startPing = () => {
        if (pingTimer) return;
        pingTimer = setInterval(() => {
          if (controllerClosed) return;
          safeEnqueue(encoder.encode(formatSSEEvent("ping", { ts: Date.now() })));
        }, 15000);
      };

      const saveVersion = async (
        targetChatId: string,
        versionId: string,
        messageId: string | null,
        demoUrl: string | null,
        metadata: unknown,
      ) => {
        await db
          .insert(versions)
          .values({
            id: nanoid(),
            chatId: targetChatId,
            v0VersionId: versionId,
            v0MessageId: messageId,
            demoUrl,
            metadata: sanitizeV0Metadata(metadata),
          })
          .onConflictDoUpdate({
            target: [versions.chatId, versions.v0VersionId],
            set: {
              v0MessageId: messageId,
              demoUrl,
              metadata: sanitizeV0Metadata(metadata),
            },
          });
      };

      // ── Initial events ─────────────────────────────────────────────
      if (metaPayload) {
        safeEnqueue(encoder.encode(formatSSEEvent("meta", metaPayload)));
      }

      if (identity.mode === "follow-up") {
        safeEnqueue(encoder.encode(formatSSEEvent("chatId", { id: identity.chatId })));
        if (identity.internalProjectId) {
          didSendProjectId = true;
          safeEnqueue(
            encoder.encode(
              formatSSEEvent("projectId", {
                id: identity.internalProjectId,
                v0ProjectId: identity.v0ProjectId,
              }),
            ),
          );
        }
      }

      startPing();

      try {
        while (true) {
          if (controllerClosed || signal?.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

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

            // ── Chat ID extraction (create mode) ───────────────────
            if (isCreate && !v0ChatId) {
              const maybeChatId = extractChatId(parsed, currentEvent);
              if (maybeChatId) v0ChatId = maybeChatId;
            }

            if (isCreate && v0ChatId && !didSendChatId) {
              didSendChatId = true;
              const create = identity as V0FallbackCreateIdentity;
              const v0ProjectIdEffective = resolveV0ProjectId({
                v0ChatId,
                clientProjectId: create.clientProjectId,
              });
              const projectName = generateProjectName({
                v0ChatId,
                clientProjectId: create.clientProjectId,
              });

              try {
                const ensured = await ensureProjectForRequest({
                  req: create.req,
                  v0ProjectId: v0ProjectIdEffective,
                  name: projectName,
                  sessionId: create.sessionId,
                });
                internalProjectId = ensured.id;

                internalChatId = nanoid();
                const insertResult = await db
                  .insert(chats)
                  .values({
                    id: internalChatId,
                    v0ChatId,
                    v0ProjectId: v0ProjectIdEffective,
                    projectId: internalProjectId,
                    webUrl:
                      ((parsed as Record<string, unknown>)?.webUrl as string | null) ?? null,
                  })
                  .onConflictDoNothing({ target: chats.v0ChatId })
                  .returning({ id: chats.id });

                if (insertResult.length === 0) {
                  const existing = await getChatByV0ChatIdForRequest(
                    create.req,
                    v0ChatId,
                    { sessionId: create.sessionId },
                  );
                  if (existing) {
                    internalChatId = existing.id;
                  } else {
                    console.warn(
                      "[v0-stream] Chat exists but is not accessible for this tenant",
                    );
                  }
                }
              } catch (dbError) {
                console.error("Failed to save streaming chat to database:", dbError);
              }

              devLogAppend(devChannel, { type: "site.chatId", chatId: v0ChatId });
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

            // ── Common event forwarding ────────────────────────────
            const messageId = extractMessageId(parsed);
            if (messageId) lastMessageId = messageId;

            const thinkingText = extractThinkingText(parsed);
            if (thinkingText && !didSendDone) {
              assistantThinkingPreview = appendPreview(assistantThinkingPreview, thinkingText);
              safeEnqueue(encoder.encode(formatSSEEvent("thinking", thinkingText)));
            }

            const contentText = extractContentText(parsed, rawData);
            const suppressContent = shouldSuppressContentForEvent(
              parsed,
              currentEvent,
              contentText,
            );
            if (contentText && !didSendDone && !suppressContent) {
              assistantContentPreview = appendPreview(assistantContentPreview, contentText);
              safeEnqueue(encoder.encode(formatSSEEvent("content", contentText)));
            }

            const uiParts = extractUiParts(parsed);
            if (uiParts && uiParts.length > 0 && !didSendDone) {
              const toolNames = extractToolNames(uiParts);
              const freshToolNames = toolNames.filter((n) => !seenToolCalls.has(n));
              if (freshToolNames.length > 0) {
                freshToolNames.forEach((n) => seenToolCalls.add(n));
                devLogAppend(devChannel, {
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
                (s) => !seenIntegrationSignals.has(s.key),
              );
              if (freshSignals.length > 0) {
                freshSignals.forEach((s) => seenIntegrationSignals.add(s.key));
                devLogAppend(devChannel, {
                  type: "comm.integration_signals",
                  chatId: v0ChatId,
                  event: currentEvent || null,
                  integrations: freshSignals,
                });
                safeEnqueue(
                  encoder.encode(formatSSEEvent("integration", { items: freshSignals })),
                );
              }
            }

            const demoUrl = extractDemoUrl(parsed);
            const versionId = extractVersionId(parsed);
            if (demoUrl) lastDemoUrl = demoUrl;
            if (versionId) lastVersionId = versionId;

            // ── Inline done detection (create mode) ────────────────
            if (isCreate && !didSendDone) {
              const isDone = isDoneLikeEvent(currentEvent, parsed);
              const finalDemoUrl = demoUrl || lastDemoUrl;
              const finalVersionId = versionId || lastVersionId;
              const hasMeaningfulData = finalDemoUrl || finalVersionId;
              const hasAssistantReply = Boolean(
                assistantContentPreview.trim() || assistantThinkingPreview.trim(),
              );
              const hasToolSignals =
                seenToolCalls.size > 0 || seenIntegrationSignals.size > 0;
              const shouldSendDone =
                Boolean(finalDemoUrl) ||
                (isDone && (hasMeaningfulData || hasAssistantReply));

              if (shouldSendDone) {
                didSendDone = true;
                const awaitingInput =
                  !finalDemoUrl &&
                  !finalVersionId &&
                  (hasAssistantReply || hasToolSignals);
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
                    await saveVersion(
                      internalChatId,
                      finalVersionId,
                      lastMessageId,
                      finalDemoUrl || null,
                      parsed,
                    );
                  } catch (dbError) {
                    console.error(
                      "Failed to save version to database:",
                      { chatId: internalChatId, versionId: finalVersionId },
                      dbError,
                    );
                  }
                }

                devLogAppend(devChannel, {
                  type: "site.done",
                  chatId: v0ChatId,
                  versionId: finalVersionId,
                  demoUrl: finalDemoUrl,
                  awaitingInput,
                  durationMs: Date.now() - generationStartedAt,
                });
                devLogAppend(devChannel, {
                  type: "comm.response.create",
                  chatId: v0ChatId,
                  versionId: finalVersionId || null,
                  demoUrl: finalDemoUrl || null,
                  assistantPreview: assistantContentPreview || null,
                  thinkingPreview: assistantThinkingPreview || null,
                  toolCalls: Array.from(seenToolCalls),
                });
                devLogFinalizeSite();
                await commitCredits();
              }
            }
          }
        }
      } catch (error) {
        console.error("Streaming error:", error);
        const normalized = normalizeV0Error(error);
        if (isCreate) {
          devLogAppend(devChannel, {
            type: "comm.error.create",
            chatId: v0ChatId,
            message: normalized.message,
            code: normalized.code,
          });
        } else {
          devLogAppend(devChannel, {
            type: "site.message.error",
            chatId: v0ChatId,
            message: normalized.message,
            durationMs: Date.now() - generationStartedAt,
          });
        }
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
        try {
          reader.releaseLock();
        } catch {
          /* already released */
        }

        if (isCreate && !didSendDone && !v0ChatId) {
          didSendDone = true;
          safeEnqueue(
            encoder.encode(
              formatSSEEvent("error", {
                message: "No chat ID returned from stream. Please retry.",
              }),
            ),
          );
        }

        const canResolve = isCreate ? Boolean(v0ChatId) : Boolean(internalChatId);
        if (!didSendDone && canResolve && v0ChatId) {
          try {
            const resolved = await resolveLatestVersion(v0ChatId, {
              preferVersionId: lastVersionId,
              preferDemoUrl: lastDemoUrl,
              maxAttempts: resolveMaxAttempts,
              delayMs: resolveDelayMs,
            });
            const finalVersionId = resolved.versionId || lastVersionId || null;
            const finalDemoUrl = resolved.demoUrl || lastDemoUrl || null;
            const hasAssistantReply = Boolean(
              assistantContentPreview.trim() || assistantThinkingPreview.trim(),
            );
            const hasToolSignals =
              seenToolCalls.size > 0 || seenIntegrationSignals.size > 0;

            if (internalChatId && finalVersionId) {
              await saveVersion(
                internalChatId,
                finalVersionId,
                lastMessageId,
                finalDemoUrl,
                resolved.latestChat ?? null,
              );
            }

            didSendDone = true;
            if (!finalVersionId && !finalDemoUrl) {
              if (hasAssistantReply || hasToolSignals) {
                safeEnqueue(
                  encoder.encode(
                    formatSSEEvent("done", {
                      chatId: v0ChatId,
                      messageId: lastMessageId,
                      versionId: null,
                      demoUrl: null,
                      ...(isCreate ? { projectId: internalProjectId || null } : {}),
                      awaitingInput: true,
                    }),
                  ),
                );
                devLogAppend(devChannel, {
                  type: isCreate ? "comm.response.create" : "comm.response.send",
                  chatId: v0ChatId,
                  ...(isCreate ? {} : { messageId: lastMessageId || null }),
                  versionId: null,
                  demoUrl: null,
                  awaitingInput: true,
                  assistantPreview: assistantContentPreview || null,
                  thinkingPreview: assistantThinkingPreview || null,
                  toolCalls: Array.from(seenToolCalls),
                });
                await commitCredits();
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
                    messageId: lastMessageId,
                    versionId: finalVersionId,
                    demoUrl: finalDemoUrl,
                    ...(isCreate ? { projectId: internalProjectId || null } : {}),
                  }),
                ),
              );

              if (isCreate) {
                devLogAppend(devChannel, {
                  type: "site.done",
                  chatId: v0ChatId,
                  versionId: finalVersionId,
                  demoUrl: finalDemoUrl,
                  durationMs: Date.now() - generationStartedAt,
                });
              } else {
                devLogAppend(devChannel, {
                  type: "site.message.done",
                  chatId: v0ChatId,
                  messageId: lastMessageId,
                  versionId: finalVersionId,
                  demoUrl: finalDemoUrl,
                  durationMs: Date.now() - generationStartedAt,
                });
              }
              devLogAppend(devChannel, {
                type: isCreate ? "comm.response.create" : "comm.response.send",
                chatId: v0ChatId,
                ...(isCreate ? {} : { messageId: lastMessageId || null }),
                versionId: finalVersionId || null,
                demoUrl: finalDemoUrl || null,
                assistantPreview: assistantContentPreview || null,
                thinkingPreview: assistantThinkingPreview || null,
                toolCalls: Array.from(seenToolCalls),
              });
              if (isCreate) devLogFinalizeSite();
              await commitCredits();
            }
          } catch (finalizeErr) {
            console.error(
              isCreate
                ? "Failed to finalize streaming chat:"
                : "Failed to finalize streaming message with latest version:",
              finalizeErr,
            );
          }
        }
        safeClose();
      }
    },
  });
}
