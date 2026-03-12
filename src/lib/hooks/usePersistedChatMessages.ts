import type { ChatMessage } from "@/lib/builder/types";
import { loadPersistedMessages, persistMessages } from "@/lib/builder/messagesStorage";
import { useEffect } from "react";

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
      content: msg.content,
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
  isCreatingChat: boolean;
  isAnyStreaming: boolean;
  messages: ChatMessage[];
  setMessages: (next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  serverMessages?: ChatMessage[];
  serverMessagesChatId?: string | null;
}) {
  const {
    chatId,
    isCreatingChat,
    isAnyStreaming,
    messages,
    setMessages,
    serverMessages,
    serverMessagesChatId,
  } = params;

  useEffect(() => {
    if (!chatId) return;
    if (isCreatingChat) return;
    if (isAnyStreaming) return;
    if (messages.length > 0) return;

    const restored = loadPersistedMessages(chatId);
    const normalizedServerMessages = normalizeServerMessages(serverMessages);

    if (serverMessagesChatId && serverMessagesChatId !== chatId) {
      if (restored.length > 0) {
        setMessages(restored);
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
      setMessages(normalizedServerMessages);
      persistMessages(chatId, normalizedServerMessages);
      return;
    }

    if (restored.length > 0) {
      setMessages(restored);
    }
  }, [
    chatId,
    isCreatingChat,
    isAnyStreaming,
    messages.length,
    setMessages,
    serverMessages,
    serverMessagesChatId,
  ]);

  useEffect(() => {
    if (!chatId) return;
    if (messages.length === 0) return;
    persistMessages(chatId, messages);
  }, [chatId, messages]);
}
