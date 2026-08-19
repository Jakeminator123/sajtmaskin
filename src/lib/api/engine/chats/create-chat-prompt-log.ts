/**
 * Init-promptlogg: skriv raden tidigt (prompten får inte tappas om
 * chat-skapandet faller), stämpla `chat_id` när `engineChat.id` finns.
 */
import { attachPromptLogChatId, createPromptLog } from "@/lib/db/services/prompt-logs";

type CreatePromptLogPayload = Parameters<typeof createPromptLog>[0];

export async function recordCreateChatPromptLog(
  payload: Omit<CreatePromptLogPayload, "event">,
): Promise<string | null> {
  try {
    return await createPromptLog({
      ...payload,
      event: "create_chat",
      chatId: payload.chatId ?? null,
    });
  } catch (error) {
    console.warn("[prompt-log] Failed to record prompt log:", error);
    return null;
  }
}

export async function attachCreateChatPromptLogChatId(
  logId: string | null | undefined,
  chatId: string,
): Promise<void> {
  const id = logId?.trim();
  const chat = chatId.trim();
  if (!id || !chat) return;
  // Befintliga tester mockar bara `createPromptLog`. Saknas attach-exporten
  // ska init-strömmen inte falla — raden är redan skriven.
  if (typeof attachPromptLogChatId !== "function") return;
  try {
    await attachPromptLogChatId(id, chat);
  } catch (error) {
    console.warn("[prompt-log] Failed to attach chat id to prompt log:", error);
  }
}
