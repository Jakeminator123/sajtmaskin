import type { ChatMessage } from "./types";

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "reasoning"; reasoning: string };

export type AIElementsMessage = {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
  isStreaming?: boolean;
};

export function toAIElementsFormat(msg: ChatMessage): AIElementsMessage {
  const parts: MessagePart[] = [];

  if (msg.thinking) {
    parts.push({
      type: "reasoning",
      reasoning: msg.thinking,
    });
  }

  parts.push({
    type: "text",
    text: msg.content || "",
  });

  return {
    id: msg.id,
    role: msg.role,
    parts,
    isStreaming: msg.isStreaming,
  };
}
