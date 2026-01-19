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
import {
  Sources,
  SourcesContent,
  SourcesTrigger,
  Source,
} from "@/components/ai-elements/sources";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanFooter,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "@/components/ai-elements/plan";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { toAIElementsFormat } from "@/lib/builder/messageAdapter";
import type { MessagePart } from "@/lib/builder/messageAdapter";
import type { ChatMessage } from "@/lib/builder/types";
import { MessageSquare } from "lucide-react";
import type { ToolUIPart } from "ai";

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
          const reasoningPart = message.parts.find(
            (p): p is Extract<MessagePart, { type: "reasoning" }> => p.type === "reasoning"
          );
          const textParts = message.parts.filter(
            (p): p is Extract<MessagePart, { type: "text" }> => p.type === "text"
          );
          const toolParts = message.parts.filter(
            (p): p is Extract<MessagePart, { type: "tool" }> => p.type === "tool"
          );
          const planParts = message.parts.filter(
            (p): p is Extract<MessagePart, { type: "plan" }> => p.type === "plan"
          );
          const sourcesParts = message.parts.filter(
            (p): p is Extract<MessagePart, { type: "sources" }> => p.type === "sources"
          );
          const sourceParts = message.parts.filter(
            (p): p is Extract<MessagePart, { type: "source" }> => p.type === "source"
          );

          const textContent = textParts.map((p) => p.text).join("");
          const sources = dedupeSources([
            ...sourcesParts.flatMap((part) => part.sources),
            ...sourceParts.map((part) => part.source),
          ]);
          const hasStructuredParts = toolParts.length > 0 || planParts.length > 0 || sources.length > 0;

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

                {message.role === "assistant" &&
                  toolParts.map((part, index) => {
                    const tool = part.tool as Partial<ToolUIPart> & { type?: string };
                    const toolState = (typeof tool.state === "string"
                      ? tool.state
                      : "input-available") as ToolUIPart["state"];
                    const toolType =
                      typeof tool.type === "string" ? tool.type : "tool";
                    const toolTitle =
                      typeof (tool as { name?: string }).name === "string"
                        ? (tool as { name?: string }).name
                        : typeof (tool as { toolName?: string }).toolName === "string"
                          ? (tool as { toolName?: string }).toolName
                          : toolType.replace(/^tool[-_:]/, "") || "Tool";

                    return (
                      <Tool key={`${message.id}-tool-${toolType}-${index}`} defaultOpen>
                        <ToolHeader title={toolTitle} type={toolType} state={toolState} />
                        <ToolContent>
                          {tool.input !== undefined && <ToolInput input={tool.input} />}
                          <ToolOutput
                            output={tool.output}
                            errorText={typeof tool.errorText === "string" ? tool.errorText : undefined}
                          />
                        </ToolContent>
                      </Tool>
                    );
                  })}

                {message.role === "assistant" &&
                  planParts.map((part, index) => (
                    <Plan
                      key={`${message.id}-plan-${index}`}
                      isStreaming={Boolean(part.isStreaming || message.isStreaming)}
                      defaultOpen
                    >
                      <PlanHeader>
                        <div className="space-y-1">
                          <PlanTitle>{part.plan.title}</PlanTitle>
                          {part.plan.description && (
                            <PlanDescription>{part.plan.description}</PlanDescription>
                          )}
                        </div>
                        <PlanAction>
                          <PlanTrigger />
                        </PlanAction>
                      </PlanHeader>
                      <PlanContent>
                        {part.plan.content && (
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {part.plan.content}
                          </p>
                        )}
                        {part.plan.steps && part.plan.steps.length > 0 && (
                          <ol className="mt-2 list-decimal pl-4 text-sm text-muted-foreground space-y-1">
                            {part.plan.steps.map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ol>
                        )}
                        {!part.plan.content &&
                          (!part.plan.steps || part.plan.steps.length === 0) &&
                          part.plan.raw && (
                            <div className="rounded-md bg-muted/50 p-3">
                              <CodeBlock
                                code={JSON.stringify(part.plan.raw, null, 2)}
                                language="json"
                              />
                            </div>
                          )}
                      </PlanContent>
                      {part.plan.actions && part.plan.actions.length > 0 && (
                        <PlanFooter>
                          <div className="flex flex-wrap gap-2">
                            {part.plan.actions.map((action) => (
                              <span
                                key={action}
                                className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground"
                              >
                                {action}
                              </span>
                            ))}
                          </div>
                        </PlanFooter>
                      )}
                    </Plan>
                  ))}

                {message.role === "assistant" ? (
                  textContent ? (
                    <MessageResponse>{textContent}</MessageResponse>
                  ) : message.isStreaming && !reasoningPart && !hasStructuredParts ? (
                    <span className="text-gray-500 text-sm">Ansluter...</span>
                  ) : null
                ) : (
                  <p className="whitespace-pre-wrap text-sm text-white">{textContent}</p>
                )}

                {message.role === "assistant" && sources.length > 0 && (
                  <Sources>
                    <SourcesTrigger count={sources.length} />
                    <SourcesContent>
                      {sources.map((source) => (
                        <Source
                          key={source.url}
                          href={source.url}
                          title={source.title ?? source.url}
                        />
                      ))}
                    </SourcesContent>
                  </Sources>
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

function dedupeSources(sources: Array<{ url: string; title?: string }>) {
  const seen = new Map<string, { url: string; title?: string }>();
  sources.forEach((source) => {
    if (!seen.has(source.url)) {
      seen.set(source.url, source);
    }
  });
  return Array.from(seen.values());
}
