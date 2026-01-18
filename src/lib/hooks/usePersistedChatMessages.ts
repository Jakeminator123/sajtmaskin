import type { ChatMessage } from '@/lib/builder/types';
import { loadPersistedMessages, persistMessages } from '@/lib/builder/messagesStorage';
import { useEffect } from 'react';

export function usePersistedChatMessages(params: {
  chatId: string | null;
  isCreatingChat: boolean;
  isAnyStreaming: boolean;
  messages: ChatMessage[];
  setMessages: (next: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
}) {
  const { chatId, isCreatingChat, isAnyStreaming, messages, setMessages } = params;

  useEffect(() => {
    if (!chatId) return;
    if (isCreatingChat) return;
    if (isAnyStreaming) return;
    if (messages.length > 0) return;

    try {
      const restored = loadPersistedMessages(chatId);
      if (restored.length > 0) {
        setMessages(restored);
      }
    } catch {
      // ignore
    }
  }, [chatId, isCreatingChat, isAnyStreaming, messages.length, setMessages]);

  useEffect(() => {
    if (!chatId) return;
    if (messages.length === 0) return;
    persistMessages(chatId, messages);
  }, [chatId, messages]);
}
