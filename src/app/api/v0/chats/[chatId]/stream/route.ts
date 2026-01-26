import { NextResponse } from "next/server";
import { assertV0Key, v0 } from "@/lib/v0";
import { createSSEHeaders, formatSSEEvent } from "@/lib/streaming";
import { db } from "@/lib/db/client";
import { versions } from "@/lib/db/schema";
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
import { devLogAppend } from "@/lib/devLog";
import { debugLog } from "@/lib/utils/debug";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request, ctx: { params: Promise<{ chatId: string }> }) {
  return withRateLimit(req, "message:send", async () => {
    try {
      assertV0Key();

      const { chatId } = await ctx.params;
      const body = await req.json().catch(() => ({}));
      const { message, attachments } = body;

      if (!message) {
        return NextResponse.json({ error: "Message is required" }, { status: 400 });
      }

      const existingChat = await getChatByV0ChatIdForRequest(req, chatId);
      if (!existingChat) {
        return NextResponse.json({ error: "Chat not found" }, { status: 404 });
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

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
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
              devLogAppend("latest", {
                type: "site.message.error",
                chatId,
                message: error instanceof Error ? error.message : "Unknown error",
                durationMs: Date.now() - requestStartedAt,
              });
              safeEnqueue(
                encoder.encode(
                  formatSSEEvent("error", {
                    message: error instanceof Error ? error.message : "Unknown error",
                  }),
                ),
              );
            } finally {
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
                    const existing = await db
                      .select()
                      .from(versions)
                      .where(
                        and(
                          eq(versions.chatId, internalChatId),
                          eq(versions.v0VersionId, finalVersionId),
                        ),
                      )
                      .limit(1);

                    if (existing.length === 0) {
                      await db.insert(versions).values({
                        id: nanoid(),
                        chatId: internalChatId,
                        v0VersionId: finalVersionId,
                        v0MessageId: lastMessageId,
                        demoUrl: finalDemoUrl,
                        metadata: resolved.latestChat ?? null,
                      });
                    }
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

        return new Response(stream, { headers: createSSEHeaders() });
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
            metadata: messageResult,
          });
        }
      }

      return new Response(
        formatSSEEvent("done", {
          chatId,
          messageId: messageResult.messageId || null,
          versionId,
          demoUrl,
        }),
        { headers: createSSEHeaders() },
      );
    } catch (err) {
      console.error("Send message error:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Unknown error" },
        { status: 500 },
      );
    }
  });
}
