import type { ChatMessage } from "@/lib/builder/types";
import { buildOpenClawContextMessages } from "@/lib/builder/openclaw-context-messages";

export const CONTEXT_RECENT_MESSAGE_COUNT = 5;
export const CONTEXT_MESSAGE_MAX_CHARS = 3_000;
export const TIP_USER_MESSAGE_MAX_CHARS = 5_000;
export const TIP_ASSISTANT_MESSAGE_MAX_CHARS = 9_000;
export const TIP_CODE_MAX_CHARS = 22_000;
export const OPENCLAW_CONTEXT_CODE_MAX_CHARS = 30_000;

export type TipApiResponse = {
  success?: boolean;
  tip?: string;
  error?: string;
  cost?: number;
};

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

export function getLatestCompletedAssistantMessage(messages: ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (
      message?.role === "assistant" &&
      !message.isStreaming &&
      typeof message.content === "string" &&
      message.content.trim().length > 0
    ) {
      return message;
    }
  }
  return null;
}

export function getLatestUserMessage(messages: ChatMessage[]): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (
      message?.role === "user" &&
      typeof message.content === "string" &&
      message.content.trim().length > 0
    ) {
      return message;
    }
  }
  return null;
}
