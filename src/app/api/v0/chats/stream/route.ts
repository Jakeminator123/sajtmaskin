import { createSSEHeaders, formatSSEEvent } from '@/lib/streaming';
import { db } from '@/lib/db/client';
import { chats, versions } from '@/lib/db/schema';
import { assertV0Key, v0 } from '@/lib/v0';
import { createChatSchema } from '@/lib/validations/chatSchemas';
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
} from '@/lib/v0Stream';
import { SYSTEM_PROMPT } from '@/lib/v0/systemPrompt';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rateLimit';
import { ensureProjectForRequest } from '@/lib/tenant';
import { requireNotBot } from '@/lib/botProtection';
import { devLogAppend, devLogFinalizeSite, devLogStartNewSite } from '@/lib/devLog';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  return withRateLimit(req, 'chat:create', async () => {
    try {
      const botError = requireNotBot(req);
      if (botError) return botError;

      assertV0Key();

      const body = await req.json().catch(() => ({}));
      const debugStream =
        process.env.NODE_ENV !== 'production' && process.env.V0_STREAM_DEBUG === '1';

      const validationResult = createChatSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: validationResult.error.issues },
          { status: 400 }
        );
      }

      const {
        message,
        attachments,
        system,
        projectId,
        modelId = 'v0-pro',
        thinking = true,
        imageGenerations,
        chatPrivacy,
      } = validationResult.data;
      const resolvedSystem = system?.trim() ? system : SYSTEM_PROMPT;
      const resolvedThinking =
        typeof thinking === 'boolean' ? thinking : modelId === 'v0-max';
      const resolvedImageGenerations =
        typeof imageGenerations === 'boolean' ? imageGenerations : false;
      const resolvedChatPrivacy = chatPrivacy ?? 'private';

      devLogStartNewSite({
        message,
        modelId,
        thinking: resolvedThinking,
        imageGenerations: resolvedImageGenerations,
        projectId,
      });
      if (process.env.NODE_ENV === 'development') {
        console.log('[dev-log] site generation started', {
          modelId,
          projectId: projectId ?? null,
        });
      }

      const generationStartedAt = Date.now();

      const result = await v0.chats.create({
        message,
        system: resolvedSystem,
        projectId,
        chatPrivacy: resolvedChatPrivacy,
        modelConfiguration: {
          thinking: resolvedThinking,
          imageGenerations: resolvedImageGenerations,
        },
        ...(modelId && { modelId }),
        responseMode: 'experimental_stream',
        ...(attachments ? { attachments } : {}),
      } as Parameters<typeof v0.chats.create>[0] & { responseMode?: string });

      if (result && typeof (result as any).getReader === 'function') {
        const v0Stream = result as unknown as ReadableStream<Uint8Array>;
        const reader = v0Stream.getReader();
        const decoder = new TextDecoder();

        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            let buffer = '';
            let currentEvent = '';
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

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                  if (controllerClosed) break;

                  if (line.startsWith('event:')) {
                    currentEvent = line.slice(6).trim();
                    if (debugStream) console.log('[v0-stream] event:', currentEvent);
                    continue;
                  }

                  if (!line.startsWith('data: ')) continue;

                  const rawData = line.slice(6);
                  const parsed = safeJsonParse(rawData);
                  if (debugStream) {
                    console.log(
                      '[v0-stream] data for',
                      currentEvent,
                      ':',
                      typeof parsed === 'string'
                        ? parsed.slice(0, 100)
                        : JSON.stringify(parsed).slice(0, 200)
                    );
                  }

                  if (!v0ChatId) {
                    const maybeChatId = extractChatId(parsed, currentEvent);
                    if (debugStream) {
                      console.log('[v0-stream-debug] chatId candidate:', maybeChatId);
                    }
                    if (maybeChatId) {
                      v0ChatId = maybeChatId;
                    }
                  }

                  if (v0ChatId && !didSendChatId) {
                    didSendChatId = true;
                    devLogAppend('in-progress', { type: 'site.chatId', chatId: v0ChatId });
                    safeEnqueue(encoder.encode(formatSSEEvent('chatId', { id: v0ChatId })));

                    try {
                      const v0ProjectIdEffective = projectId || `chat:${v0ChatId}`;
                      const ensured = await ensureProjectForRequest({
                        req,
                        v0ProjectId: v0ProjectIdEffective,
                        name: projectId ? `Project ${projectId}` : `Chat ${v0ChatId}`,
                      });
                      internalProjectId = ensured.id;

                      const existingChat = await db
                        .select()
                        .from(chats)
                        .where(eq(chats.v0ChatId, v0ChatId))
                        .limit(1);

                      if (existingChat.length === 0) {
                        internalChatId = nanoid();
                        await db.insert(chats).values({
                          id: internalChatId,
                          v0ChatId: v0ChatId,
                          v0ProjectId: projectId || `chat:${v0ChatId}`,
                          projectId: internalProjectId,
                          webUrl: (parsed as any)?.webUrl || null,
                        });
                      } else {
                        internalChatId = existingChat[0].id;
                      }
                    } catch (dbError) {
                      console.error('Failed to save streaming chat to database:', dbError);
                    }
                  }

                  const messageId = extractMessageId(parsed);
                  if (messageId) {
                    lastMessageId = messageId;
                  }

                  const thinkingText = extractThinkingText(parsed);
                  if (thinkingText && !didSendDone) {
                    safeEnqueue(encoder.encode(formatSSEEvent('thinking', thinkingText)));
                  }

                  const contentText = extractContentText(parsed, rawData);
                  if (contentText && !didSendDone) {
                    safeEnqueue(encoder.encode(formatSSEEvent('content', contentText)));
                  }

                  const uiParts = extractUiParts(parsed);
                  if (uiParts && uiParts.length > 0 && !didSendDone) {
                    safeEnqueue(encoder.encode(formatSSEEvent('parts', uiParts)));
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

                  if (!didSendDone && (isDoneEvent || demoUrl || versionId)) {
                    didSendDone = true;
                    safeEnqueue(
                      encoder.encode(
                        formatSSEEvent('done', {
                          chatId: v0ChatId,
                          demoUrl: demoUrl || null,
                          versionId: versionId || null,
                          messageId: messageId || null,
                        })
                      )
                    );

                    if (internalChatId && versionId) {
                      try {
                        const existingVersion = await db
                          .select()
                          .from(versions)
                          .where(eq(versions.v0VersionId, versionId))
                          .limit(1);

                        if (existingVersion.length === 0) {
                          await db.insert(versions).values({
                            id: nanoid(),
                            chatId: internalChatId,
                            v0VersionId: versionId,
                            v0MessageId: messageId || null,
                            demoUrl: demoUrl || null,
                            metadata: parsed,
                          });
                        } else if (demoUrl) {
                          await db
                            .update(versions)
                            .set({ demoUrl, metadata: parsed })
                            .where(eq(versions.id, existingVersion[0].id));
                        }
                      } catch (dbError) {
                        console.error('Failed to save version to database:', dbError);
                      }
                    }

                    devLogAppend('in-progress', {
                      type: 'site.done',
                      chatId: v0ChatId,
                      versionId,
                      demoUrl,
                      durationMs: Date.now() - generationStartedAt,
                    });
                    devLogFinalizeSite();
                  }
                }
              }
            } catch (error) {
              console.error('Streaming error:', error);
              safeEnqueue(
                encoder.encode(
                  formatSSEEvent('error', {
                    message: error instanceof Error ? error.message : 'Unknown error',
                  })
                )
              );
            } finally {
              if (!didSendDone && v0ChatId) {
                try {
                  const latestChat = await v0.chats.getById({ chatId: v0ChatId });
                  const latestVersion = (latestChat as any)?.latestVersion || null;
                  const finalVersionId: string | null =
                    (latestVersion && (latestVersion.id || latestVersion.versionId)) ||
                    lastVersionId;
                  const finalDemoUrl: string | null =
                    (latestVersion && (latestVersion.demoUrl || latestVersion.demo_url)) ||
                    (latestChat as any)?.demoUrl ||
                    lastDemoUrl;

                  if (internalChatId && finalVersionId) {
                    const existingVersion = await db
                      .select()
                      .from(versions)
                      .where(eq(versions.v0VersionId, finalVersionId))
                      .limit(1);

                    if (existingVersion.length === 0) {
                      await db.insert(versions).values({
                        id: nanoid(),
                        chatId: internalChatId,
                        v0VersionId: finalVersionId,
                        v0MessageId: lastMessageId,
                        demoUrl: finalDemoUrl,
                        metadata: latestChat,
                      });
                    } else if (finalDemoUrl) {
                      await db
                        .update(versions)
                        .set({ demoUrl: finalDemoUrl, metadata: latestChat })
                        .where(eq(versions.id, existingVersion[0].id));
                    }
                  }

                  didSendDone = true;
                  safeEnqueue(
                    encoder.encode(
                      formatSSEEvent('done', {
                        chatId: v0ChatId,
                        demoUrl: finalDemoUrl,
                        versionId: finalVersionId,
                        messageId: lastMessageId,
                      })
                    )
                  );

                  devLogAppend('in-progress', {
                    type: 'site.done',
                    chatId: v0ChatId,
                    versionId: finalVersionId,
                    demoUrl: finalDemoUrl,
                    durationMs: Date.now() - generationStartedAt,
                  });
                  devLogFinalizeSite();
                } catch (finalizeErr) {
                  console.error('Failed to finalize streaming chat:', finalizeErr);
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
        const v0ProjectId = chatData.projectId || projectId || `chat:${v0ChatId}`;

        let internalProjectId: string | null = null;
        try {
          const project = await ensureProjectForRequest({
            req,
            v0ProjectId,
            name: projectId ? `Project ${projectId}` : `Chat ${v0ChatId}`,
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
            metadata: chatData.latestVersion,
          });
        }
      } catch (dbError) {
        console.error('Failed to save chat to database:', dbError);
      }

      return NextResponse.json(chatData);
    } catch (err) {
      console.error('Create chat error:', err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      );
    }
  });
}
