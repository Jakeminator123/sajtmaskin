import { consumeSseResponse } from '@/lib/builder/sse';
import type { ChatMessage, UiMessagePart } from '@/lib/builder/types';
import type { ModelTier } from '@/lib/validations/chatSchemas';
import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';

type RouterLike = { replace: (href: string) => void };

type V0Attachment = {
  type: 'user_file';
  url: string;
  filename: string;
  mimeType?: string;
  size?: number;
  purpose?: string;
};

type MessageOptions = {
  attachments?: V0Attachment[];
  attachmentPrompt?: string;
  skipPromptAssist?: boolean;
};

function appendAttachmentPrompt(message: string, attachmentPrompt?: string): string {
  if (!attachmentPrompt) return message;
  return `${message}${attachmentPrompt}`.trim();
}

function coerceUiParts(data: unknown): UiMessagePart[] {
  if (Array.isArray(data)) {
    return data.filter((part): part is UiMessagePart => Boolean(part) && typeof part === 'object');
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (typeof obj.type === 'string') {
      return [obj as UiMessagePart];
    }
    if (Array.isArray(obj.parts)) {
      return obj.parts.filter((part): part is UiMessagePart => Boolean(part) && typeof part === 'object');
    }
  }
  return [];
}

function mergeUiParts(prev: UiMessagePart[] | undefined, next: UiMessagePart[]): UiMessagePart[] {
  if (next.length === 0) return prev ?? [];
  const merged = [...(prev ?? [])];
  next.forEach((part) => {
    const key = getUiPartKey(part);
    if (!key) {
      merged.push(part);
      return;
    }
    const index = merged.findIndex((existing) => getUiPartKey(existing) === key);
    if (index === -1) {
      merged.push(part);
      return;
    }
    merged[index] = mergeUiPart(merged[index], part);
  });
  return merged;
}

function mergeUiPart(current: UiMessagePart, next: UiMessagePart): UiMessagePart {
  const merged = { ...current };
  Object.entries(next).forEach(([key, value]) => {
    if (value !== undefined) {
      merged[key] = value;
    }
  });
  return merged;
}

function getUiPartKey(part: UiMessagePart): string | null {
  const type = typeof part.type === 'string' ? part.type : '';
  if (type.startsWith('tool')) {
    const candidate =
      (typeof part.toolCallId === 'string' && part.toolCallId) ||
      (typeof part.id === 'string' && part.id) ||
      (typeof part.name === 'string' && part.name) ||
      (typeof part.toolName === 'string' && part.toolName) ||
      type;
    return candidate || null;
  }
  if (type === 'plan') return 'plan';
  if (type === 'sources') return 'sources';
  if (type === 'source') {
    const candidate =
      (typeof part.url === 'string' && part.url) ||
      (typeof (part.source as { url?: unknown })?.url === 'string' &&
        (part.source as { url?: string }).url) ||
      null;
    return candidate;
  }
  return null;
}

export function useV0ChatMessaging(params: {
  chatId: string | null;
  setChatId: (id: string | null) => void;
  chatIdParam: string | null;
  router: RouterLike;
  selectedModelTier: ModelTier;
  enableImageGenerations: boolean;
  maybeEnhanceInitialPrompt: (original: string) => Promise<string>;
  mutateVersions: () => void;
  setCurrentDemoUrl: (url: string | null) => void;
  setMessages: (next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  resetBeforeCreateChat: () => void;
}) {
  const {
    chatId,
    setChatId,
    chatIdParam,
    router,
    selectedModelTier,
    enableImageGenerations,
    maybeEnhanceInitialPrompt,
    mutateVersions,
    setCurrentDemoUrl,
    setMessages,
    resetBeforeCreateChat,
  } = params;

  const [isCreatingChat, setIsCreatingChat] = useState(false);

  const createNewChat = useCallback(
    async (initialMessage: string, options: MessageOptions = {}) => {
      if (isCreatingChat) return;
      if (!initialMessage?.trim()) {
        toast.error('Please enter a message to start a new chat');
        return;
      }

      resetBeforeCreateChat();

      const now = Date.now();
      const userMessageId = `user-${now}`;
      const assistantMessageId = `assistant-${now}`;

      setMessages([
        { id: userMessageId, role: 'user', content: initialMessage },
        {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          thinking: '',
          isStreaming: true,
          uiParts: [],
        },
      ]);
      setIsCreatingChat(true);

      try {
        const messageForV0 = options.skipPromptAssist
          ? initialMessage
          : await maybeEnhanceInitialPrompt(initialMessage);
        const finalMessage = appendAttachmentPrompt(messageForV0, options.attachmentPrompt);
        const thinkingForTier = selectedModelTier === 'v0-max';
        const requestBody: Record<string, unknown> = {
          message: finalMessage,
          modelId: selectedModelTier,
          thinking: thinkingForTier,
          imageGenerations: enableImageGenerations,
        };
        if (options.attachments && options.attachments.length > 0) {
          requestBody.attachments = options.attachments;
        }
        const response = await fetch('/api/v0/chats/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          let errorMessage = 'Failed to create chat';
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } catch {
            // ignore
          }
          throw new Error(errorMessage);
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/event-stream')) {
          let chatIdFromStream: string | null = null;
          let accumulatedThinking = '';
          let accumulatedContent = '';

          await consumeSseResponse(response, (event, data) => {
            switch (event) {
              case 'thinking': {
                const thinkingText =
                  typeof data === 'string'
                    ? data
                    : (data as any)?.thinking || (data as any)?.reasoning || null;
                if (thinkingText) {
                  accumulatedThinking += String(thinkingText);
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId
                        ? { ...m, thinking: accumulatedThinking, isStreaming: true }
                        : m
                    )
                  );
                }
                break;
              }
              case 'content': {
                const contentText =
                  typeof data === 'string'
                    ? data
                    : (data as any)?.content || (data as any)?.text || (data as any)?.delta || null;
                if (contentText) {
                  accumulatedContent += String(contentText);
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId
                        ? { ...m, content: accumulatedContent, isStreaming: true }
                        : m
                    )
                  );
                }
                break;
              }
              case 'parts': {
                const nextParts = coerceUiParts(data);
                if (nextParts.length > 0) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessageId
                        ? {
                            ...m,
                            uiParts: mergeUiParts(m.uiParts, nextParts),
                            isStreaming: true,
                          }
                        : m
                    )
                  );
                }
                break;
              }
              case 'chatId': {
                const nextChatId =
                  typeof data === 'string'
                    ? data
                    : (data as any)?.id || (data as any)?.chatId || null;
                if (nextChatId && !chatIdFromStream) {
                  const id = String(nextChatId);
                  chatIdFromStream = id;
                  setChatId(id);
                  if (chatIdParam !== id) {
                    router.replace(`/builder?chatId=${encodeURIComponent(id)}`);
                  }
                }
                break;
              }
              case 'done': {
                const doneData = typeof data === 'object' && data ? (data as any) : {};
                if (doneData.demoUrl) {
                  setCurrentDemoUrl(doneData.demoUrl);
                }
                if (doneData.id && !chatIdFromStream) {
                  setChatId(doneData.id);
                  if (chatIdParam !== doneData.id) {
                    router.replace(`/builder?chatId=${encodeURIComponent(doneData.id)}`);
                  }
                }
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m))
                );
                toast.success('Chat created!');
                mutateVersions();
                break;
              }
              case 'error': {
                const errorData =
                  typeof data === 'object' && data ? (data as any) : { message: data };
                throw new Error(errorData.message || errorData.error || 'Stream error');
              }
            }
          });

          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m))
          );
        } else {
          const data = await response.json();
          const newChatId = data.id || data.chatId || data.v0ChatId || data.chat?.id;

          if (!newChatId) {
            throw new Error('No chat ID returned from API');
          }

          setChatId(newChatId);
          router.replace(`/builder?chatId=${encodeURIComponent(newChatId)}`);
          toast.success('Chat created!');

          if (data.latestVersion?.demoUrl) {
            setCurrentDemoUrl(data.latestVersion.demoUrl);
          }

          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m))
          );
        }
      } catch (error) {
        console.error('Error creating chat:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to create chat');
      } finally {
        setIsCreatingChat(false);
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m))
        );
      }
    },
    [
      isCreatingChat,
      resetBeforeCreateChat,
      maybeEnhanceInitialPrompt,
      selectedModelTier,
      enableImageGenerations,
      setMessages,
      setChatId,
      chatIdParam,
      router,
      setCurrentDemoUrl,
      mutateVersions,
    ]
  );

  const sendMessage = useCallback(
    async (messageText: string, options: MessageOptions = {}) => {
      if (!messageText?.trim()) return;

      if (!chatId) {
        await createNewChat(messageText, options);
        return;
      }

      const now = Date.now();
      const userMessageId = `user-${now}`;
      const assistantMessageId = `assistant-${now}`;

      setMessages((prev) => [
        ...prev,
        { id: userMessageId, role: 'user', content: messageText },
        {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          thinking: '',
          isStreaming: true,
          uiParts: [],
        },
      ]);

      try {
        const finalMessage = appendAttachmentPrompt(messageText, options.attachmentPrompt);
        const requestBody: Record<string, unknown> = { message: finalMessage };
        if (options.attachments && options.attachments.length > 0) {
          requestBody.attachments = options.attachments;
        }
        const response = await fetch(`/api/v0/chats/${chatId}/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          let errorMessage = 'Failed to send message';
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } catch {
            // ignore
          }
          throw new Error(errorMessage);
        }

        let accumulatedThinking = '';
        let accumulatedContent = '';

        await consumeSseResponse(response, (event, data) => {
          switch (event) {
            case 'thinking': {
              const thinkingText =
                typeof data === 'string'
                  ? data
                  : (data as any)?.thinking || (data as any)?.reasoning || null;
              if (thinkingText) {
                accumulatedThinking += String(thinkingText);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, thinking: accumulatedThinking, isStreaming: true }
                      : m
                  )
                );
              }
              break;
            }
            case 'content': {
              const contentText =
                typeof data === 'string'
                  ? data
                  : (data as any)?.content || (data as any)?.text || (data as any)?.delta || null;
              if (contentText) {
                accumulatedContent += String(contentText);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: accumulatedContent, isStreaming: true }
                      : m
                  )
                );
              }
              break;
            }
            case 'parts': {
              const nextParts = coerceUiParts(data);
              if (nextParts.length > 0) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? {
                          ...m,
                          uiParts: mergeUiParts(m.uiParts, nextParts),
                          isStreaming: true,
                        }
                      : m
                  )
                );
              }
              break;
            }
            case 'done': {
              const doneData = typeof data === 'object' && data ? (data as any) : {};
              if (doneData?.demoUrl) setCurrentDemoUrl(doneData.demoUrl);
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m))
              );
              mutateVersions();
              break;
            }
            case 'error': {
              const errorData =
                typeof data === 'object' && data ? (data as any) : { message: data };
              throw new Error(errorData.message || errorData.error || 'Stream error');
            }
          }
        });
      } catch (error) {
        console.error('Error sending streaming message:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to send message');
      } finally {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m))
        );
      }
    },
    [chatId, createNewChat, setMessages, setCurrentDemoUrl, mutateVersions]
  );

  return { isCreatingChat, createNewChat, sendMessage };
}
