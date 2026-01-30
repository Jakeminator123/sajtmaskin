import { createSSEHeaders, formatSSEEvent } from "@/lib/streaming";
import { db } from "@/lib/db/client";
import { chats, versions } from "@/lib/db/schema";
import { assertV0Key, v0 } from "@/lib/v0";
import { createChatSchema } from "@/lib/validations/chatSchemas";
import {
  extractChatId,
  extractContentText,
  extractDemoUrl,
  extractMessageId,
  extractThinkingText,
  extractUiParts,
  extractVersionId,
  isDoneLikeEvent,
  safeJsonParse,
} from "@/lib/v0Stream";
import { resolveLatestVersion } from "@/lib/v0/resolve-latest-version";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import { ensureProjectForRequest, resolveV0ProjectId, generateProjectName } from "@/lib/tenant";
import { requireNotBot } from "@/lib/botProtection";
import { devLogAppend, devLogFinalizeSite, devLogStartNewSite } from "@/lib/logging/devLog";
import { debugLog } from "@/lib/utils/debug";
import { sanitizeV0Metadata } from "@/lib/v0/sanitize-metadata";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  return withRateLimit(req, "chat:create", async () => {
    try {
      const botError = requireNotBot(req);
      if (botError) return botError;

      assertV0Key();

      const body = await req.json().catch(() => ({}));
      const debugStream =
        process.env.NODE_ENV !== "production" && process.env.V0_STREAM_DEBUG === "1";

      const validationResult = createChatSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { error: "Validation failed", details: validationResult.error.issues },
          { status: 400 },
        );
      }

      const {
        message,
        attachments,
        projectId,
        system,
        modelId = "v0-max",
        thinking = true,
        imageGenerations,
        chatPrivacy,
      } = validationResult.data;
      const trimmedSystemPrompt = typeof system === "string" ? system.trim() : "";
      const hasSystemPrompt = Boolean(trimmedSystemPrompt);
      const resolvedThinking = typeof thinking === "boolean" ? thinking : modelId === "v0-max";
      const resolvedImageGenerations =
        typeof imageGenerations === "boolean" ? imageGenerations : true;
      const resolvedChatPrivacy = chatPrivacy ?? "private";

      debugLog("v0", "v0 chat stream request", {
        modelId,
        promptLength: typeof message === "string" ? message.length : null,
        attachments: Array.isArray(attachments) ? attachments.length : 0,
        systemProvided: hasSystemPrompt,
        systemApplied: hasSystemPrompt,
        systemIgnored: false,
        thinking: resolvedThinking,
        imageGenerations: resolvedImageGenerations,
        chatPrivacy: resolvedChatPrivacy,
      });

      devLogStartNewSite({
        message,
        modelId,
        thinking: resolvedThinking,
        imageGenerations: resolvedImageGenerations,
        projectId,
      });
      if (process.env.NODE_ENV === "development") {
        console.log("[dev-log] site generation started", {
          modelId,
          projectId: projectId ?? null,
        });
      }

      const generationStartedAt = Date.now();

      const result = await v0.chats.create({
        message,
        ...(hasSystemPrompt ? { system: trimmedSystemPrompt } : {}),
        projectId,
        chatPrivacy: resolvedChatPrivacy,
        modelConfiguration: {
          thinking: resolvedThinking,
          imageGenerations: resolvedImageGenerations,
        },
        ...(modelId && { modelId }),
        responseMode: "experimental_stream",
        ...(attachments ? { attachments } : {}),
      } as Parameters<typeof v0.chats.create>[0] & { responseMode?: string });

      if (result && typeof (result as any).getReader === "function") {
        const v0Stream = result as unknown as ReadableStream<Uint8Array>;
        const reader = v0Stream.getReader();
        const decoder = new TextDecoder();

        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            let buffer = "";
            let currentEvent = "";
            let v0ChatId: string | null = null;
            let internalChatId: string | null = null;
            let internalProjectId: string | null = null;
            let didSendChatId = false;
            let didSendDone = false;
            let controllerClosed = false;
            let lastMessageId: string | null = null;
            let lastDemoUrl: string | null = null;
            let lastVersionId: string | null = null;

            const safeEnqueue = (data: Uint8Array) => {
              if (controllerClosed) return;
              try {
                controller.enqueue(data);
              } catch {
                controllerClosed = true;
              }
            };

            const safeClose = () => {
              if (controllerClosed) return;
              controllerClosed = true;
              try {
                controller.close();
              } catch {
                // already closed
              }
            };

            const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB buffer limit

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Prevent unbounded buffer growth from malformed streams
                if (buffer.length > MAX_BUFFER_SIZE) {
                  console.warn("[v0-stream] Buffer exceeded max size, truncating");
                  buffer = buffer.slice(-MAX_BUFFER_SIZE / 2);
                }

                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  if (controllerClosed) break;

                  if (line.startsWith("event:")) {
                    currentEvent = line.slice(6).trim();
                    if (debugStream) console.log("[v0-stream] event:", currentEvent);
                    continue;
                  }

                  if (!line.startsWith("data: ")) continue;

                  const rawData = line.slice(6);
                  const parsed = safeJsonParse(rawData);
                  if (debugStream) {
                    console.log(
                      "[v0-stream] data for",
                      currentEvent,
                      ":",
                      typeof parsed === "string"
                        ? parsed.slice(0, 100)
                        : JSON.stringify(parsed).slice(0, 200),
                    );
                  }

                  if (!v0ChatId) {
                    const maybeChatId = extractChatId(parsed, currentEvent);
                    if (debugStream) {
                      console.log("[v0-stream-debug] chatId candidate:", maybeChatId);
                    }
                    if (maybeChatId) {
                      v0ChatId = maybeChatId;
                    }
                  }

                  if (v0ChatId && !didSendChatId) {
                    didSendChatId = true;
                    devLogAppend("in-progress", { type: "site.chatId", chatId: v0ChatId });
                    safeEnqueue(encoder.encode(formatSSEEvent("chatId", { id: v0ChatId })));

                    try {
                      // Use standardized v0ProjectId resolution
                      const v0ProjectIdEffective = resolveV0ProjectId({
                        v0ChatId,
                        clientProjectId: projectId,
                      });
                      const projectName = generateProjectName({
                        v0ChatId,
                        clientProjectId: projectId,
                      });
                      const ensured = await ensureProjectForRequest({
                        req,
                        v0ProjectId: v0ProjectIdEffective,
                        name: projectName,
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
                          webUrl: (parsed as any)?.webUrl || null,
                        })
                        .onConflictDoNothing({ target: chats.v0ChatId })
                        .returning({ id: chats.id });

                      // If insert was skipped due to conflict, fetch the existing chat
                      if (insertResult.length === 0) {
                        const existingChat = await db
                          .select()
                          .from(chats)
                          .where(eq(chats.v0ChatId, v0ChatId))
                          .limit(1);
                        if (existingChat.length > 0) {
                          internalChatId = existingChat[0].id;
                        }
                      }
                    } catch (dbError) {
                      console.error("Failed to save streaming chat to database:", dbError);
                    }
                  }

                  const messageId = extractMessageId(parsed);
                  if (messageId) {
                    lastMessageId = messageId;
                  }

                  const thinkingText = extractThinkingText(parsed);
                  if (thinkingText && !didSendDone) {
                    safeEnqueue(encoder.encode(formatSSEEvent("thinking", thinkingText)));
                  }

                  const contentText = extractContentText(parsed, rawData);
                  if (contentText && !didSendDone) {
                    safeEnqueue(encoder.encode(formatSSEEvent("content", contentText)));
                  }

                  const uiParts = extractUiParts(parsed);
                  if (uiParts && uiParts.length > 0 && !didSendDone) {
                    safeEnqueue(encoder.encode(formatSSEEvent("parts", uiParts)));
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

                  if (!didSendDone && (isDoneEvent || finalDemoUrl)) {
                    didSendDone = true;
                    safeEnqueue(
                      encoder.encode(
                        formatSSEEvent("done", {
                          chatId: v0ChatId,
                          demoUrl: finalDemoUrl || null,
                          versionId: finalVersionId || null,
                          messageId: messageId || null,
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
                              demoUrl: finalDemoUrl || undefined,
                              metadata: sanitizeV0Metadata(parsed),
                            },
                          });
                      } catch (dbError) {
                        console.error("Failed to save version to database:", dbError);
                      }
                    }

                    devLogAppend("in-progress", {
                      type: "site.done",
                      chatId: v0ChatId,
                      versionId: finalVersionId,
                      demoUrl: finalDemoUrl,
                      durationMs: Date.now() - generationStartedAt,
                    });
                    devLogFinalizeSite();
                  }
                }
              }
            } catch (error) {
              console.error("Streaming error:", error);
              safeEnqueue(
                encoder.encode(
                  formatSSEEvent("error", {
                    message: error instanceof Error ? error.message : "Unknown error",
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

              if (!didSendDone && v0ChatId) {
                try {
                  const resolved = await resolveLatestVersion(v0ChatId, {
                    preferVersionId: lastVersionId,
                    preferDemoUrl: lastDemoUrl,
                    maxAttempts: 15,
                    delayMs: 2000,
                  });
                  const finalVersionId = resolved.versionId || lastVersionId || null;
                  const finalDemoUrl = resolved.demoUrl || lastDemoUrl || null;

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
                          demoUrl: finalDemoUrl || undefined,
                          metadata: sanitizeV0Metadata(resolved.latestChat ?? null),
                        },
                      });
                  }

                  didSendDone = true;
                  if (!finalVersionId && !finalDemoUrl) {
                    safeEnqueue(
                      encoder.encode(
                        formatSSEEvent("error", {
                          message:
                            resolved.errorMessage ||
                            "No preview version was generated. Please try again.",
                        }),
                      ),
                    );
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
                    devLogFinalizeSite();
                  }
                } catch (finalizeErr) {
                  console.error("Failed to finalize streaming chat:", finalizeErr);
                }
              }
              safeClose();
            }
          },
        });

        return new Response(stream, { headers: createSSEHeaders() });
      }

      const chatData = result as any;

      try {
        const internalChatId = nanoid();
        const v0ChatId = chatData.id;
        // Use standardized v0ProjectId resolution
        const v0ProjectId = resolveV0ProjectId({
          v0ChatId,
          chatDataProjectId: chatData.projectId,
          clientProjectId: projectId,
        });
        const projectName = generateProjectName({
          v0ChatId,
          clientProjectId: projectId,
        });

        let internalProjectId: string | null = null;
        try {
          const project = await ensureProjectForRequest({
            req,
            v0ProjectId,
            name: projectName,
          });
          internalProjectId = project.id;
        } catch {
          // ignore project save errors
        }

        await db.insert(chats).values({
          id: internalChatId,
          v0ChatId,
          v0ProjectId,
          projectId: internalProjectId,
          webUrl: chatData.webUrl || null,
        });

        if (chatData.latestVersion) {
          await db.insert(versions).values({
            id: nanoid(),
            chatId: internalChatId,
            v0VersionId: chatData.latestVersion.id || chatData.latestVersion.versionId,
            v0MessageId: chatData.latestVersion.messageId || null,
            demoUrl: chatData.latestVersion.demoUrl || null,
            metadata: sanitizeV0Metadata(chatData.latestVersion),
          });
        }
      } catch (dbError) {
        console.error("Failed to save chat to database:", dbError);
      }

      return NextResponse.json(chatData);
    } catch (err) {
      console.error("Create chat error:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
