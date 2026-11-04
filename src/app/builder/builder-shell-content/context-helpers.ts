import { isAutoRepairPromptMessage, isF3KickPromptMessage, type ChatMessage } from "@/lib/builder/types";
import { buildOpenClawContextMessages } from "@/lib/builder/openclaw-context-messages";

export const CONTEXT_RECENT_MESSAGE_COUNT = 8;
export const CONTEXT_MESSAGE_MAX_CHARS = 3_000;
export const OPENCLAW_CONTEXT_CODE_MAX_CHARS = 30_000;
/** Marks the user's first brief when it falls outside the recent window. */
export const CONTEXT_FIRST_BRIEF_LABEL = "[Första briefen]";

export type ContextMessage = {
  role: ChatMessage["role"];
  content: string;
};

/**
 * The builder conversation as Sajtagenten sees it: the latest turns between
 * the user and the build engine, plus the user's first brief when it has
 * scrolled out of that window. Machine prompts the builder sends on its own
 * (auto-repair, the F3 kick) are left out — they crowded out the real
 * history and made the agent describe repairs as the user's wishes.
 */
export function buildRecentContextMessages(messages: ChatMessage[]): ContextMessage[] {
  const conversation = messages.filter(
    (message) => !isAutoRepairPromptMessage(message) && !isF3KickPromptMessage(message),
  );
  const options = {
    recentCount: CONTEXT_RECENT_MESSAGE_COUNT,
    maxChars: CONTEXT_MESSAGE_MAX_CHARS,
  };
  const recent = buildOpenClawContextMessages(conversation, options);
  const firstBrief = conversation.find((message) => message.role === "user");
  if (!firstBrief || conversation.slice(-CONTEXT_RECENT_MESSAGE_COUNT).includes(firstBrief)) {
    return recent;
  }
  const [brief] = buildOpenClawContextMessages([firstBrief], { ...options, recentCount: 1 });
  return [{ role: brief.role, content: `${CONTEXT_FIRST_BRIEF_LABEL} ${brief.content}` }, ...recent];
}
