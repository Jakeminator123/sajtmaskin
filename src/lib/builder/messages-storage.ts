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
        (m: unknown): m is Record<string, unknown> & {
          id: string;
          role: "user" | "assistant";
          content: string;
        } =>
          !!m &&
          typeof m === "object" &&
          typeof (m as { id?: unknown }).id === "string" &&
          ((m as { role?: unknown }).role === "user" ||
            (m as { role?: unknown }).role === "assistant") &&
          typeof (m as { content?: unknown }).content === "string",
      )
      .map((m) => ({
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
