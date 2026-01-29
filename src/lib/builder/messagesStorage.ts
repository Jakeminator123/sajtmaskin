import type { ChatMessage } from "@/lib/builder/types";

function getMessagesStorageKey(chatId: string): string {
  return `sajtmaskin:messages:${chatId}`;
}

export function loadPersistedMessages(chatId: string): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getMessagesStorageKey(chatId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (m: any) =>
          m &&
          typeof m.id === "string" &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string",
      )
      .map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        thinking: typeof m.thinking === "string" ? m.thinking : null,
        uiParts: Array.isArray(m.uiParts)
          ? m.uiParts.filter((part: unknown) => part && typeof part === "object")
          : undefined,
        isStreaming: false,
      })) as ChatMessage[];
  } catch {
    return [];
  }
}

export function persistMessages(chatId: string, messages: ChatMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    const pruned = messages.slice(-200).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      thinking: m.thinking ?? null,
      uiParts: m.uiParts ?? undefined,
    }));
    localStorage.setItem(getMessagesStorageKey(chatId), JSON.stringify(pruned));
  } catch {
    // ignore storage errors
  }
}

export function clearPersistedMessages(chatId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(getMessagesStorageKey(chatId));
  } catch {
    // ignore storage errors
  }
}
