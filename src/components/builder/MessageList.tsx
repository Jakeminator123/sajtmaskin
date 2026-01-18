"use client";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { toAIElementsFormat } from "@/lib/builder/messageAdapter";
import type { ChatMessage } from "@/lib/builder/types";
import { MessageSquare } from "lucide-react";

interface MessageListProps {
  chatId: string | null;
  messages?: Array<ChatMessage>;
}

export function MessageList({ chatId, messages: externalMessages = [] }: MessageListProps) {
  const messages = externalMessages.map(toAIElementsFormat);

  if (!chatId && messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
        <MessageSquare className="h-10 w-10 mb-3" />
        <p className="text-sm">Ingen chat vald ännu</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
        <MessageSquare className="h-10 w-10 mb-3" />
        <p className="text-sm">Inga meddelanden ännu</p>
      </div>
    );
  }

  return (
    <Conversation className="h-full">
      <ConversationContent>
        {messages.map((message) => {
          const reasoningPart = message.parts.find((p) => p.type === "reasoning");
          const textParts = message.parts.filter((p) => p.type === "text");
          const textContent = textParts.map((p) => (p as { text: string }).text).join("");

          return (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                {message.role === "assistant" && reasoningPart && (
                  <Reasoning>
                    <ReasoningTrigger
                      isStreaming={Boolean(message.isStreaming && !textContent)}
                    />
                    <ReasoningContent>
                      {(reasoningPart as { reasoning: string }).reasoning}
                    </ReasoningContent>
                  </Reasoning>
                )}

                {message.role === "assistant" ? (
                  textContent ? (
                    <MessageResponse>{textContent}</MessageResponse>
                  ) : message.isStreaming && !reasoningPart ? (
                    <span className="text-gray-500 text-sm">Ansluter...</span>
                  ) : null
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-white">{textContent}</p>
                )}
              </MessageContent>
            </Message>
          );
        })}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
