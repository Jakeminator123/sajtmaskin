"use client";

import {
  Conversation,
  ConversationContent,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Sources, SourcesContent, SourcesTrigger, Source } from "@/components/ai-elements/sources";
import { VersionFeedback } from "@/components/builder/VersionFeedback";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Loader2, MessageSquare } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface MessageListProps {
  chatId: string | null;
  versionId?: string | null;
  messages?: Array<ChatMessage>;
  showStructuredParts?: boolean;
  onQuickReply?: (text: string, options?: { planMode?: boolean }) => Promise<void> | void;
  onApproveBuildPlan?: (plan: Record<string, unknown>) => Promise<void> | void;
  quickReplyDisabled?: boolean;
}

function hasGenerationContent(text: string): boolean {
  if (!text) return false;
  return text.includes('file="') || text.includes("```");
}

const MessageListComponent = ({
  chatId,
  versionId = null,
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

  const lastGenMessageIndex = useMemo(() => {
    let last = -1;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role !== "assistant") continue;
      const text = m.parts
        .filter((p): p is Extract<MessagePart, { type: "text" }> => p.type === "text")
        .map((p) => p.text)
        .join("");
      if (hasGenerationContent(text)) last = i;
    }
    return last;
  }, [messages]);

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
      <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/40 bg-card/60 shadow-[0_1px_0_hsl(var(--border)/0.4)]">
          <MessageSquare className="h-7 w-7 text-muted-foreground/75" aria-hidden />
        </div>
        <p className="text-sm" suppressHydrationWarning>
          Ingen chat vald
        </p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/40 bg-card/60 shadow-[0_1px_0_hsl(var(--border)/0.4)]">
          <MessageSquare className="h-7 w-7 text-muted-foreground/75" aria-hidden />
        </div>
        <p className="text-sm" suppressHydrationWarning>
          Inga meddelanden ännu
        </p>
      </div>
    );
  }

  return (
    <>
      <Conversation className="h-full scroll-smooth scrollbar-thin [scroll-behavior:smooth]" role="log" aria-label="Konversation">
        <ConversationContent className="space-y-3 px-3 py-3 sm:px-4 sm:py-4">
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
          const hasVisibleTooling =
            agentLogItems.length > 0 || compactToolParts.length > 0 || toolParts.length > 0;
          const hasUserAfterCurrentMessage = hasUserMessageAfterFromTooling(messages, messageIndex);
          const expandToolSection = Boolean(pendingReply?.messageId === message.id);
          const toolingStepCount = agentLogItems.length + compactToolParts.length;

          return (
            <Message key={message.id} from={message.role}>
              <MessageContent
                className={cn(
                  "max-w-[min(88%,28rem)] gap-2.5 rounded-[1.25rem] border px-4 py-3 shadow-[0_1px_0_hsl(var(--border)/0.45)] transition-[box-shadow,background-color,border-color] duration-[var(--transition-base,200ms)] ease-out",
                  message.role === "user"
                    ? "ml-auto border-primary/20 bg-primary/[0.06] text-foreground"
                    : "border-border/40 bg-card/75 text-foreground backdrop-blur-[2px]",
                )}
              >
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
                  toolingStepCount > 0 && (
                    <Collapsible
                      key={`tool-section-${message.id}-${expandToolSection ? "open" : "shut"}-${pendingReply?.key ?? "none"}`}
                      defaultOpen={expandToolSection}
                      className="group rounded-xl border border-border/35 bg-muted/15"
                    >
                      <CollapsibleTrigger className="text-muted-foreground hover:bg-muted/35 flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors">
                        <span>
                          Steg · {toolingStepCount}
                          {expandToolSection ? (
                            <span className="text-primary/90 ml-1.5 font-normal">· svar</span>
                          ) : null}
                        </span>
                        <ChevronDown
                          className="h-4 w-4 shrink-0 opacity-70 transition-transform duration-[var(--transition-base,200ms)] group-data-[state=open]:rotate-180"
                          aria-hidden
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-0 px-2 pb-2">
                        {agentLogItems.length > 0 && <AgentLogCard items={agentLogItems} />}
                        {compactToolParts.length > 0 && (
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
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                {showStructuredParts &&
                  message.role === "assistant" &&
                  planParts.map((part, index) => (
                    <Plan
                      key={`${message.id}-plan-${index}`}
                      isStreaming={Boolean(part.isStreaming || message.isStreaming)}
                      defaultOpen={Boolean(part.isStreaming || message.isStreaming)}
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
                            Planåtgärder
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
                    hasGenerationContent(textContent) ? (
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
                  ) : message.isStreaming && !reasoningPart && !hasStructuredParts && !hasVisibleTooling ? (
                    <StreamingTypingIndicator />
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

                {chatId &&
                  versionId &&
                  message.role === "assistant" &&
                  messageIndex === lastGenMessageIndex &&
                  !message.isStreaming &&
                  hasGenerationContent(textContent) && (
                    <VersionFeedback
                      key={versionId}
                      chatId={chatId}
                      versionId={versionId}
                      className="mt-2 pt-2 border-t border-zinc-700/50"
                    />
                  )}
              </MessageContent>
            </Message>
          );
          })}
        </ConversationContent>
        {/* ConversationScrollButton removed for cleaner UX */}
      </Conversation>

      {pendingReply && (
        <>
          <Dialog open={isReplyDialogOpen} onOpenChange={setIsReplyDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-semibold text-foreground">
                  Svar krävs
                </DialogTitle>
                <DialogDescription>
                  Buildern väntar innan nästa steg. Det kan gälla integrationer, innehåll eller
                  designval.
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
                          variant="outline"
                          className="h-8 border-border/60 text-xs font-normal"
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
              size="sm"
              variant="outline"
              className="border-border/60 bg-card/90 text-foreground shadow-sm backdrop-blur-sm transition-[box-shadow,background-color] duration-[var(--transition-fast,150ms)] hover:bg-muted/50 fixed bottom-6 right-6 z-40"
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
function StreamingTypingIndicator() {
  return (
    <div
      className="flex items-center gap-2.5 py-1 text-muted-foreground/80"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Skriver</span>
      <span className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-primary/30 motion-safe:animate-bounce"
            style={{
              animationDelay: `${i * 200}ms`,
              animationDuration: "1.2s",
            }}
          />
        ))}
      </span>
    </div>
  );
}

function CollapsibleUserMessage({ content }: { content: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Check if this is a long technical message (shadcn block prompt pattern)
  const isTechnicalPrompt = content.includes("---") && content.includes("Registry files");
  const lineCount = content.split("\n").length;
  const charCount = content.length;

  // Only collapse if message is long (>500 chars or >10 lines) and contains technical content
  const shouldCollapse = isTechnicalPrompt && (charCount > 500 || lineCount > 10);

  if (!shouldCollapse) {
    return (
      <MessageResponse>
        <Streamdown plugins={{ code: streamdownCode }}>{content}</Streamdown>
      </MessageResponse>
    );
  }

  // Extract summary line (first line before ---)
  const lines = content.split("\n");
  const summaryEndIndex = lines.findIndex((line) => line.trim() === "---");
  const summaryLines = summaryEndIndex > 0 ? lines.slice(0, summaryEndIndex) : lines.slice(0, 3);
  const summary = summaryLines.join("\n").trim();

  if (isExpanded) {
    return (
      <div className="space-y-2">
        <MessageResponse>
          <Streamdown plugins={{ code: streamdownCode }}>{content}</Streamdown>
        </MessageResponse>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
          onClick={() => setIsExpanded(false)}
        >
          <ChevronUp className="h-3 w-3" />
          Dölj
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <MessageResponse>
        <Streamdown plugins={{ code: streamdownCode }}>{summary}</Streamdown>
      </MessageResponse>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs text-muted-foreground"
        onClick={() => setIsExpanded(true)}
      >
        <ChevronDown className="h-3 w-3" />
        Visa mer ({lineCount})
      </Button>
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


