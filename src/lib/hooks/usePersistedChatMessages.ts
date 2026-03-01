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
    if (restored.length > 0) {
      setMessages(restored);
      return;
    }

    if (serverMessagesChatId && serverMessagesChatId !== chatId) {
      return;
    }

    const normalizedServerMessages = normalizeServerMessages(serverMessages);
    if (normalizedServerMessages.length > 0) {
      console.info(
        "[usePersistedChatMessages] Restoring %d messages from server (localStorage was empty)",
        normalizedServerMessages.length,
      );
      setMessages(normalizedServerMessages);
      persistMessages(chatId, normalizedServerMessages);
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
