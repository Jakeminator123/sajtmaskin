import type { ChatMessage } from "@/lib/builder/types";
import { buildOpenClawContextMessages } from "@/lib/builder/openclaw-context-messages";

export const CONTEXT_RECENT_MESSAGE_COUNT = 5;
export const CONTEXT_MESSAGE_MAX_CHARS = 3_000;
export const OPENCLAW_CONTEXT_CODE_MAX_CHARS = 30_000;

export type ContextMessage = {
  role: ChatMessage["role"];
  content: string;
};

export function buildRecentContextMessages(messages: ChatMessage[]): ContextMessage[] {
  return buildOpenClawContextMessages(messages, {
    recentCount: CONTEXT_RECENT_MESSAGE_COUNT,
    maxChars: CONTEXT_MESSAGE_MAX_CHARS,
  });
}
