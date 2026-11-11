import type { ChatMessage } from "@/lib/builder/types";
import { sanitizeChatMessageContentForDisplay } from "@/lib/builder/message-adapter";
import { loadPersistedMessages, persistMessages } from "@/lib/builder/messages-storage";
import { useEffect, useRef } from "react";

function normalizeServerMessages(input: ChatMessage[] | undefined): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (msg) =>
        msg &&
        typeof msg.id === "string" &&
        (msg.role === "user" || msg.role === "assistant") &&
        typeof msg.content === "string",
    )
    .map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: sanitizeChatMessageContentForDisplay({
        role: msg.role,
        content: msg.content,
      }),
      thinking: typeof msg.thinking === "string" ? msg.thinking : null,
      uiParts: Array.isArray(msg.uiParts)
        ? msg.uiParts.filter((part: unknown) => part && typeof part === "object")
        : undefined,
      isStreaming: false,
    }));
}

function countUiParts(messages: ChatMessage[]): number {
  return messages.reduce(
    (total, message) => total + (Array.isArray(message.uiParts) ? message.uiParts.length : 0),
    0,
  );
}

export function usePersistedChatMessages(params: {
  chatId: string | null;
  chatIdParam: string | null;
  cancelActiveGeneration: () => void;
  isCreatingChat: boolean;
  isAnyStreaming: boolean;
  messages: ChatMessage[];
  setMessages: (next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  serverMessages?: ChatMessage[];
  serverMessagesChatId?: string | null;
}) {
  const {
    chatId,
    chatIdParam,
    cancelActiveGeneration,
    isCreatingChat,
    isAnyStreaming,
    messages,
    setMessages,
    serverMessages,
    serverMessagesChatId,
  } = params;
  const messagesChatIdRef = useRef(chatId);
  const routeChatIdRef = useRef(chatIdParam);
  const navigationTargetRef = useRef<string | null>(null);
  const pendingRestoreRef = useRef<ChatMessage[] | null>(null);
  const wasCreatingChatRef = useRef(isCreatingChat);

  useEffect(() => {
    const routeChanged = routeChatIdRef.current !== chatIdParam;
    routeChatIdRef.current = chatIdParam;
    // A generation assigns its id before (or together with) its URL update.
    // An external URL change arrives while state still belongs to the old chat.
    const navigatedChatId = routeChanged && chatIdParam && chatIdParam !== chatId
      ? chatIdParam
      : null;
    if (navigatedChatId) {
      navigationTargetRef.current = navigatedChatId;
      cancelActiveGeneration();
    }
    const targetChatId = navigationTargetRef.current ?? chatId;
    const chatChanged = messagesChatIdRef.current !== chatId;
    const creationAssignedId = chatChanged && !navigationTargetRef.current &&
      (isCreatingChat || wasCreatingChatRef.current);
    wasCreatingChatRef.current = isCreatingChat;
    if (!targetChatId) {
      messagesChatIdRef.current = null;
      pendingRestoreRef.current = null;
      return;
    }
    const restore = (next: ChatMessage[]) => {
      // The persistence effect below still sees this render's old messages.
      // Wait until React has applied the replacement before writing this key.
      pendingRestoreRef.current = next;
      setMessages(next);
    };
    if (navigatedChatId || (chatChanged && !creationAssignedId && !navigationTargetRef.current)) {
      messagesChatIdRef.current = targetChatId;
      const cached = normalizeServerMessages(loadPersistedMessages(targetChatId));
      const server = serverMessagesChatId === targetChatId
        ? normalizeServerMessages(serverMessages)
        : [];
      const next = server.length > cached.length || countUiParts(server) > countUiParts(cached)
        ? server
        : cached;
      restore(next);
      return;
    }
    if (navigationTargetRef.current) {
      if (chatId !== navigationTargetRef.current) return;
      navigationTargetRef.current = null;
    }
    if (!chatId) return;
    messagesChatIdRef.current = chatId;
    if (creationAssignedId) pendingRestoreRef.current = null;
    if (pendingRestoreRef.current && pendingRestoreRef.current !== messages) return;
    if (isCreatingChat) return;
    if (isAnyStreaming) return;

    const normalizedServerMessages = normalizeServerMessages(serverMessages);

    if (messages.length > 0) {
      if (
        serverMessagesChatId === chatId &&
        normalizedServerMessages.length > 0 &&
        (normalizedServerMessages.length > messages.length ||
          countUiParts(normalizedServerMessages) > countUiParts(messages))
      ) {
        restore(normalizedServerMessages);
        persistMessages(chatId, normalizedServerMessages);
      }
      return;
    }

    const restored = normalizeServerMessages(loadPersistedMessages(chatId));

    if (serverMessagesChatId && serverMessagesChatId !== chatId) {
      if (restored.length > 0) {
        restore(restored);
      }
      return;
    }

    const shouldUseServer =
      normalizedServerMessages.length > 0 &&
      (restored.length === 0 ||
        countUiParts(normalizedServerMessages) > countUiParts(restored) ||
        normalizedServerMessages.length > restored.length);

    if (shouldUseServer) {
      console.info(
        "[usePersistedChatMessages] Restoring %d messages from server",
        normalizedServerMessages.length,
      );
      restore(normalizedServerMessages);
      persistMessages(chatId, normalizedServerMessages);
      return;
    }

    if (restored.length > 0) {
      restore(restored);
    }
  }, [
    chatId,
    chatIdParam,
    cancelActiveGeneration,
    isCreatingChat,
    isAnyStreaming,
    messages,
    setMessages,
    serverMessages,
    serverMessagesChatId,
  ]);

  useEffect(() => {
    if (!chatId) return;
    if (navigationTargetRef.current && navigationTargetRef.current !== chatId) return;
    if (pendingRestoreRef.current && pendingRestoreRef.current !== messages) return;
    pendingRestoreRef.current = null;
    if (messages.length === 0) return;
    persistMessages(chatId, messages);
  }, [chatId, messages]);
}
