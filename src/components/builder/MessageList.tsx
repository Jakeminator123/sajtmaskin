"use client";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Sources, SourcesContent, SourcesTrigger, Source } from "@/components/ai-elements/sources";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { BuildPlanCard } from "@/components/builder/BuildPlanCard";
import {
  AgentLogCard,
  CompactToolParts,
  StructuredToolParts,
  getLatestEnvRequirement as getLatestEnvRequirementFromTooling,
  getLatestPendingReply as getLatestPendingReplyFromTooling,
  hasUserMessageAfter as hasUserMessageAfterFromTooling,
  isActionableToolPart,
  openProjectEnvVarsPanel,
  buildAgentLogItems as buildAgentLogItemsFromTooling,
} from "@/components/builder/BuilderMessageTooling";
import { GenerationSummary } from "@/components/builder/GenerationSummary";
import { Streamdown } from "streamdown";
import { code as streamdownCode } from "@streamdown/code";
import { toAIElementsFormat } from "@/lib/builder/messageAdapter";
import type { MessagePart } from "@/lib/builder/messageAdapter";
import type { ChatMessage } from "@/lib/builder/types";
import { ChevronDown, ChevronUp, Loader2, MessageSquare } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";

interface MessageListProps {
  chatId: string | null;
  messages?: Array<ChatMessage>;
  showStructuredParts?: boolean;
  onQuickReply?: (text: string, options?: { planMode?: boolean }) => Promise<void> | void;
  onApproveBuildPlan?: (plan: Record<string, unknown>) => Promise<void> | void;
  quickReplyDisabled?: boolean;
}

const MessageListComponent = ({
  chatId,
  messages: externalMessages = [],
  showStructuredParts = false,
  onQuickReply,
  onApproveBuildPlan,
  quickReplyDisabled = false,
}: MessageListProps) => {
  const messages = useMemo(() => externalMessages.map(toAIElementsFormat), [externalMessages]);
  const [pendingQuickReplyKey, setPendingQuickReplyKey] = useState<string | null>(null);
  const [isReplyDialogOpen, setIsReplyDialogOpen] = useState(false);
  const lastAutoOpenedReplyKeyRef = useRef<string | null>(null);
  const lastAutoOpenedEnvRequirementRef = useRef<string | null>(null);

  const sendQuickReply = async (
    messageId: string,
    optionIndex: number,
    text: string,
    options?: { planMode?: boolean },
  ) => {
    if (!onQuickReply) return false;
    const key = `${messageId}:${optionIndex}:${text}`;
    setPendingQuickReplyKey(key);
    try {
      await onQuickReply(text, options);
      return true;
    } catch (error) {
      console.error("Quick reply failed:", error);
      return false;
    } finally {
      setPendingQuickReplyKey((current) => (current === key ? null : current));
    }
  };

  const pendingReply = useMemo(
    () => getLatestPendingReplyFromTooling(messages),
    [messages],
  );
  const latestEnvRequirement = useMemo(
    () => getLatestEnvRequirementFromTooling(messages),
    [messages],
  );

  useEffect(() => {
    const pendingKey = pendingReply?.key ?? null;
    if (!pendingKey) {
      setIsReplyDialogOpen(false);
      lastAutoOpenedReplyKeyRef.current = null;
      return;
    }
    if (lastAutoOpenedReplyKeyRef.current === pendingKey) return;
    lastAutoOpenedReplyKeyRef.current = pendingKey;
    setIsReplyDialogOpen(true);
  }, [pendingReply?.key]);

  useEffect(() => {
    const requirement = latestEnvRequirement;
    if (!requirement) {
      lastAutoOpenedEnvRequirementRef.current = null;
      return;
    }
    if (lastAutoOpenedEnvRequirementRef.current === requirement.key) return;
    lastAutoOpenedEnvRequirementRef.current = requirement.key;
    openProjectEnvVarsPanel(requirement.envKeys);
  }, [latestEnvRequirement]);

  const handleModalQuickReply = async (option: string, optionIndex: number) => {
    if (!pendingReply) return;
    const success = await sendQuickReply(pendingReply.messageId, optionIndex, option, {
      planMode: pendingReply.planMode,
    });
    if (success) {
      setIsReplyDialogOpen(false);
    }
  };

  if (!chatId && messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
        <MessageSquare className="mb-3 h-10 w-10" />
        <p className="text-sm" suppressHydrationWarning>Ingen chat vald ännu</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
        <MessageSquare className="mb-3 h-10 w-10" />
        <p className="text-sm" suppressHydrationWarning>Inga meddelanden ännu</p>
      </div>
    );
  }

  return (
    <>
      <Conversation className="h-full">
        <ConversationContent>
          {messages.map((message, messageIndex) => {
          const reasoningPart = message.parts.find(
            (p): p is Extract<MessagePart, { type: "reasoning" }> => p.type === "reasoning",
          );
          const textParts = message.parts.filter(
            (p): p is Extract<MessagePart, { type: "text" }> => p.type === "text",
          );
          const toolParts = message.parts.filter(
            (p): p is Extract<MessagePart, { type: "tool" }> => p.type === "tool",
          );
          const compactToolParts = showStructuredParts
            ? []
            : toolParts.filter((part) => isActionableToolPart(part.tool));
          const agentLogItems = showStructuredParts ? [] : buildAgentLogItemsFromTooling(toolParts);
          const planParts = showStructuredParts
            ? message.parts.filter(
                (p): p is Extract<MessagePart, { type: "plan" }> => p.type === "plan",
              )
            : [];
          const sourcesParts = showStructuredParts
            ? message.parts.filter(
                (p): p is Extract<MessagePart, { type: "sources" }> => p.type === "sources",
              )
            : [];
          const sourceParts = showStructuredParts
            ? message.parts.filter(
                (p): p is Extract<MessagePart, { type: "source" }> => p.type === "source",
              )
            : [];

          const textContent = textParts.map((p) => p.text).join("");
          const sources = showStructuredParts
            ? dedupeSources([
                ...sourcesParts.flatMap((part) => part.sources),
                ...sourceParts.map((part) => part.source),
              ])
            : [];
          const hasStructuredParts =
            showStructuredParts &&
            (toolParts.length > 0 || planParts.length > 0 || sources.length > 0);
          const hasUserAfterCurrentMessage = hasUserMessageAfterFromTooling(messages, messageIndex);

          return (
            <Message key={message.id} from={message.role}>
              <MessageContent>
                {message.role === "assistant" && reasoningPart && (
                  <Reasoning isStreaming={Boolean(message.isStreaming && !textContent)}>
                    <ReasoningTrigger />
                    <ReasoningContent>{reasoningPart.reasoning}</ReasoningContent>
                  </Reasoning>
                )}

                {showStructuredParts &&
                  message.role === "assistant" && (
                    <StructuredToolParts
                      messageId={message.id}
                      toolParts={toolParts}
                      pendingReply={pendingReply}
                      hasUserAfterCurrentMessage={hasUserAfterCurrentMessage}
                      pendingQuickReplyKey={pendingQuickReplyKey}
                      onQuickReply={async (messageId, optionIndex, option, options) =>
                        sendQuickReply(messageId, optionIndex, option, options)
                      }
                      quickReplyDisabled={quickReplyDisabled}
                    />
                  )}

                {!showStructuredParts &&
                  message.role === "assistant" &&
                  agentLogItems.length > 0 && <AgentLogCard items={agentLogItems} />}

                {!showStructuredParts &&
                  message.role === "assistant" &&
                  compactToolParts.length > 0 && (
                    <CompactToolParts
                      messageId={message.id}
                      toolParts={compactToolParts}
                      pendingReply={pendingReply}
                      hasUserAfterCurrentMessage={hasUserAfterCurrentMessage}
                      pendingQuickReplyKey={pendingQuickReplyKey}
                      onQuickReply={async (messageId, optionIndex, option, options) =>
                        sendQuickReply(messageId, optionIndex, option, options)
                      }
                      quickReplyDisabled={quickReplyDisabled}
                    />
                  )}

                {showStructuredParts &&
                  message.role === "assistant" &&
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
                          <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                            {part.plan.content}
                          </p>
                        )}
                        <BuildPlanCard
                          rawPlan={part.plan.raw}
                          onApproveBuild={onApproveBuildPlan}
                          approveDisabled={quickReplyDisabled}
                        />
                      </PlanContent>
                      {part.plan.actions && part.plan.actions.length > 0 && (
                        <PlanFooter>
                          <div className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                            Plan actions
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {part.plan.actions.map((action) => (
                              <span
                                key={action}
                                className="border-border text-muted-foreground rounded-full border px-2 py-1 text-xs"
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
                    (textContent.includes('file="') ||
                      textContent.includes("```") ||
                      (Boolean(message.isStreaming) && textContent.length > 400)) ? (
                      <GenerationSummary content={textContent} isStreaming={Boolean(message.isStreaming)} />
                    ) : (
                      <MessageResponse>
                        <Streamdown
                          plugins={{ code: streamdownCode }}
                          isAnimating={Boolean(message.isStreaming)}
                          caret={message.isStreaming ? "block" : undefined}
                        >
                          {textContent}
                        </Streamdown>
                      </MessageResponse>
                    )
                  ) : message.isStreaming && !reasoningPart && !hasStructuredParts ? (
                    <span className="text-sm text-gray-500">Ansluter...</span>
                  ) : null
                ) : (
                  <CollapsibleUserMessage content={textContent} />
                )}

                {showStructuredParts && message.role === "assistant" && sources.length > 0 && (
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

      {pendingReply && (
        <>
          <Dialog open={isReplyDialogOpen} onOpenChange={setIsReplyDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-semibold text-amber-300">
                  Svar krävs för att fortsätta
                </DialogTitle>
                <DialogDescription>
                  Buildern väntar på ditt svar innan nästa steg kan fortsätta. Det kan gälla till
                  exempel integrationer, innehåll, designval eller planblockerare.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <p className="text-foreground text-sm font-semibold">{pendingReply.question}</p>
                {pendingReply.options.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {pendingReply.options.map((option, optionIndex) => {
                      const replyKey = `${pendingReply.messageId}:${optionIndex}:${option}`;
                      const isPending = pendingQuickReplyKey === replyKey;
                      const canReply = Boolean(onQuickReply) && !quickReplyDisabled;
                      return (
                        <Button
                          key={replyKey}
                          size="sm"
                          variant="secondary"
                          disabled={!canReply || pendingQuickReplyKey !== null}
                          onClick={() => void handleModalQuickReply(option, optionIndex)}
                        >
                          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          {option}
                        </Button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Svara i chatten för att fortsätta genereringen.
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {!isReplyDialogOpen && (
            <Button
              type="button"
              className="fixed bottom-6 right-6 z-40 bg-amber-500 text-black hover:bg-amber-400"
              onClick={() => setIsReplyDialogOpen(true)}
            >
              Svar krävs
            </Button>
          )}
        </>
      )}
    </>
  );
};

export const MessageList = memo(MessageListComponent);

/**
 * CollapsibleUserMessage - Truncates long user messages (especially shadcn/ui block prompts)
 * Shows first few lines with expand button for long technical messages.
 */
function CollapsibleUserMessage({ content }: { content: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Check if this is a long technical message (shadcn block prompt pattern)
  const isTechnicalPrompt = content.includes("---") && content.includes("Registry files");
  const lineCount = content.split("\n").length;
  const charCount = content.length;

  // Only collapse if message is long (>500 chars or >10 lines) and contains technical content
  const shouldCollapse = isTechnicalPrompt && (charCount > 500 || lineCount > 10);

  if (!shouldCollapse) {
    return <p className="text-sm whitespace-pre-wrap text-white">{content}</p>;
  }

  // Extract summary line (first line before ---)
  const lines = content.split("\n");
  const summaryEndIndex = lines.findIndex((line) => line.trim() === "---");
  const summaryLines = summaryEndIndex > 0 ? lines.slice(0, summaryEndIndex) : lines.slice(0, 3);
  const summary = summaryLines.join("\n").trim();

  if (isExpanded) {
    return (
      <div className="space-y-2">
        <p className="text-sm whitespace-pre-wrap text-white">{content}</p>
        <button
          onClick={() => setIsExpanded(false)}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
        >
          <ChevronUp className="h-3 w-3" />
          Dölj detaljer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm whitespace-pre-wrap text-white">{summary}</p>
      <button
        onClick={() => setIsExpanded(true)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
      >
        <ChevronDown className="h-3 w-3" />
        Visa tekniska instruktioner ({lineCount} rader)
      </button>
    </div>
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


