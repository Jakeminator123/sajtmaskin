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
  extractMessageId,
  extractThinkingText,
  extractUiParts,
  extractVersionId,
  safeJsonParse,
} from "@/lib/v0Stream";
import { resolveLatestVersion } from "@/lib/v0/resolve-latest-version";
import { withRateLimit } from "@/lib/rateLimit";
import { getChatByV0ChatIdForRequest } from "@/lib/tenant";
import { ensureSessionIdFromRequest } from "@/lib/auth/session";
import { devLogAppend } from "@/lib/logging/devLog";
import { debugLog, errorLog } from "@/lib/utils/debug";
import { sanitizeV0Metadata } from "@/lib/v0/sanitize-metadata";
import { normalizeV0Error } from "@/lib/v0/errors";

export const runtime = "nodejs";
export const maxDuration = 300;

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
      const { message, attachments } = body;

      if (!message) {
        return attachSessionCookie(
          NextResponse.json({ error: "Message is required" }, { status: 400 }),
        );
      }

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

      debugLog("v0", "v0 follow-up message request", {
        chatId,
        messageLength: typeof message === "string" ? message.length : null,
        attachments: Array.isArray(attachments) ? attachments.length : 0,
      });

      devLogAppend("latest", {
        type: "site.message.start",
        chatId,
        message:
          typeof message === "string"
            ? `${message.slice(0, 500)}${message.length > 500 ? "…" : ""}`
            : null,
        attachmentsCount: Array.isArray(attachments) ? attachments.length : null,
      });
      if (process.env.NODE_ENV === "development") {
        console.log("[dev-log] follow-up started", { chatId });
      }

      let result: unknown;
      try {
        result = await (v0.chats as any).sendMessage({
          chatId,
          message,
          attachments,
          responseMode: "experimental_stream",
        });
      } catch (streamErr) {
        console.warn(
          "sendMessage streaming not available, falling back to non-stream response:",
          streamErr,
        );
        result = await v0.chats.sendMessage({
          chatId,
          message,
          attachments,
        });
      }

      if (result && typeof (result as any).getReader === "function") {
        const v0Stream = result as ReadableStream<Uint8Array>;
        const reader = v0Stream.getReader();
        const decoder = new TextDecoder();

        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            let buffer = "";
            let _currentEvent = "";
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
                // Truncate at newline boundary to preserve event integrity
                if (buffer.length > MAX_BUFFER_SIZE) {
                  console.warn(
                    "[v0-stream] Buffer exceeded max size, truncating at newline boundary",
                  );
                  const truncateTarget = buffer.length - MAX_BUFFER_SIZE / 2;
                  const newlineIndex = buffer.indexOf("\n", truncateTarget);
                  if (newlineIndex !== -1) {
                    buffer = buffer.slice(newlineIndex + 1);
                  } else {
                    // Fallback: no newline found, keep last half
                    buffer = buffer.slice(-MAX_BUFFER_SIZE / 2);
                  }
                }

                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  if (controllerClosed) break;

                  if (line.startsWith("event:")) {
                    _currentEvent = line.slice(6).trim();
                    continue;
                  }
                  if (!line.startsWith("data: ")) continue;

                  const rawData = line.slice(6);
                  const parsed = safeJsonParse(rawData);

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
                    maxAttempts: 12,
                    delayMs: 1500,
                  });
                  const finalVersionId = resolved.versionId || lastVersionId || null;
                  const finalDemoUrl = resolved.demoUrl || lastDemoUrl || null;

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
