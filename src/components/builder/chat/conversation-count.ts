import {
  isAuditPromptMessage,
  isAutoRepairPromptMessage,
  isF3KickPromptMessage,
  isKostnadsfriPromptMessage,
  type ChatMessage,
} from "@/lib/builder/types";
import { classifyAgentMessage } from "@/lib/openclaw/agent-message-kind";
import type { OpenClawMessage } from "@/lib/openclaw/openclaw-store";

/**
 * Byggmotorns systemrader: meddelanden som sparas som användartur men som
 * `MessageList` ritar som en systemrad (automatisk reparation, F3-start,
 * audit- och kampanjunderlag). De är hjälprader, inte något någon skrev.
 */
export function isSyntheticBuilderPrompt(
  message: Pick<ChatMessage, "role" | "uiParts" | "content">,
): boolean {
  return (
    isAutoRepairPromptMessage(message) ||
    isF3KickPromptMessage(message) ||
    isAuditPromptMessage(message) ||
    isKostnadsfriPromptMessage(message)
  );
}

/**
 * Antal meddelanden i den synliga konversationen (UX-granskningen 2026-11-11,
 * avsnitt C): byggmotorns och Sajtagentens rader i samma tidslinje som
 * `MessageList` ritar. Hjälprader räknas inte: byggmotorns systemrader och
 * Sajtagentens interna väckningar (statusrader). Arbetsloggen ligger inuti
 * ett svar och är aldrig en egen rad.
 */
export function countVisibleConversationMessages(
  builderMessages: ReadonlyArray<Pick<ChatMessage, "role" | "uiParts" | "content">>,
  agentMessages: ReadonlyArray<Pick<OpenClawMessage, "role" | "content" | "kind">>,
): number {
  let count = 0;
  for (const message of builderMessages) {
    if (!isSyntheticBuilderPrompt(message)) count += 1;
  }
  for (const message of agentMessages) {
    if (classifyAgentMessage(message) !== "internal") count += 1;
  }
  return count;
}
