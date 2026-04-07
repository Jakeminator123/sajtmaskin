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
import { VersionFeedback } from "@/components/builder/VersionFeedback";
import { Streamdown } from "streamdown";
import { code as streamdownCode } from "@streamdown/code";
import { toAIElementsFormat } from "@/lib/builder/messageAdapter";
import type { MessagePart } from "@/lib/builder/messageAdapter";
import type { ChatMessage } from "@/lib/builder/types";
import { ScrapeProgressBar } from "@/components/builder/ScrapeProgressBar";
import { Bot, ChevronDown, ChevronUp, Loader2, MessageSquare } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

const PROACTIVE_QUESTION = "Vad för typ av sajt vill du bygga? Berätta lite om ditt företag eller din idé så skapar vi något tillsammans.";

function useTypewriter(text: string, speed = 30, delay = 1000) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    const startTimer = setTimeout(() => {
      const interval = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(interval);
          setDone(true);
        }
      }, speed);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(startTimer);
  }, [text, speed, delay]);
  return { displayed, done };
}

interface MessageListProps {
  chatId: string | null;
  versionId?: string | null;
  messages?: Array<ChatMessage>;
  showStructuredParts?: boolean;
  onQuickReply?: (text: string, options?: { planMode?: boolean }) => Promise<void> | void;
  onApproveBuildPlan?: (plan: Record<string, unknown>) => Promise<void> | void;
  quickReplyDisabled?: boolean;
  onSuggestionSend?: (text: string) => void;
  hideAgentLog?: boolean;
  hideTooling?: boolean;
  hasInitialPrompt?: boolean;
  isGenerating?: boolean;
}

function hasGenerationContent(text: string, isStreaming: boolean): boolean {
  if (!text) return false;
  return (
    text.includes('file="') ||
    text.includes("```") ||
    (Boolean(isStreaming) && text.length > 400)
  );
}

const MessageListComponent = ({
  chatId,
  versionId = null,
  messages: externalMessages = [],
  showStructuredParts = false,
  onQuickReply,
  onSuggestionSend,
  onApproveBuildPlan,
  quickReplyDisabled = false,
  hideAgentLog = false,
  hideTooling = false,
  hasInitialPrompt = false,
  isGenerating = false,
}: MessageListProps) => {
  const messages = useMemo(() => externalMessages.map(toAIElementsFormat), [externalMessages]);
  const [pendingQuickReplyKey, setPendingQuickReplyKey] = useState<string | null>(null);
  const [isReplyDialogOpen, setIsReplyDialogOpen] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const lastAutoOpenedReplyKeyRef = useRef<string | null>(null);
  const lastAutoOpenedEnvRequirementRef = useRef<string | null>(null);
  const hasNoMessages = externalMessages.length === 0;
  const isNewEmptyChat = !chatId && hasNoMessages && !isGenerating;
  const greetingText = isNewEmptyChat
    ? PROACTIVE_QUESTION
    : "";
  const { displayed: typedQuestion, done: typingDone } = useTypewriter(
    isNewEmptyChat ? greetingText : "",
    25,
    1000,
  );

  useEffect(() => {
    setShowNudge(false);
    if (externalMessages.length === 0) return;
    const last = externalMessages[externalMessages.length - 1];
    if (last.role !== "assistant" || last.isStreaming) return;
    const timer = setTimeout(() => setShowNudge(true), 5000);
    return () => clearTimeout(timer);
  }, [externalMessages]);

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
      if (hasGenerationContent(text, Boolean(m.isStreaming))) last = i;
    }
    return last;
  }, [messages]);

  useEffect(() => {
    const pendingKey = pendingReply?.key ?? null;
    if (!pendingKey || hideTooling) {
      setIsReplyDialogOpen(false);
      lastAutoOpenedReplyKeyRef.current = null;
      return;
    }
    if (lastAutoOpenedReplyKeyRef.current === pendingKey) return;
    lastAutoOpenedReplyKeyRef.current = pendingKey;
    setIsReplyDialogOpen(true);
  }, [pendingReply?.key, hideTooling]);

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

  if (hasNoMessages) {
    if (!isNewEmptyChat) {
      return <div className="flex h-full flex-col items-center justify-center px-4" />;
    }
    return (
      <div className="flex h-full flex-col gap-4 px-4 pt-6">
        {typedQuestion && (
          <div className="flex gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary shadow-sm">
              <Bot className="h-4 w-4" />
            </span>
            <div className="rounded-2xl rounded-tl-md border border-border/30 bg-muted/60 px-4 py-3 shadow-sm">
              <p className="text-sm text-foreground leading-relaxed">
                {typedQuestion}
                {!typingDone && <span className="ml-0.5 inline-block w-[2px] h-4 bg-foreground/60 animate-pulse align-text-bottom" />}
              </p>
            </div>
          </div>
        )}
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
          const hasVisibleTooling =
            agentLogItems.length > 0 || compactToolParts.length > 0 || toolParts.length > 0;
          const hasUserAfterCurrentMessage = hasUserMessageAfterFromTooling(messages, messageIndex);

          return (
            <Message key={message.id} from={message.role}>
              <MessageContent role={message.role}>
                {message.role === "assistant" && message.isHelpMessage && (
                  <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary/60 uppercase">
                    <Bot className="h-3 w-3" />
                    Sajtagenten
                  </div>
                )}
                {message.role === "assistant" && reasoningPart && (
                  <Reasoning isStreaming={Boolean(message.isStreaming && !textContent)}>
                    <ReasoningTrigger />
                    <ReasoningContent>{reasoningPart.reasoning}</ReasoningContent>
                  </Reasoning>
                )}

                {!hideTooling && showStructuredParts &&
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

                {!hideTooling && !hideAgentLog &&
                  !showStructuredParts &&
                  message.role === "assistant" &&
                  agentLogItems.length > 0 && <AgentLogCard items={agentLogItems} />}

                {!hideTooling && !showStructuredParts &&
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
                            Planerade åtgärder
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

                {(() => {
                  const origMsg = externalMessages[messageIndex];
                  const scrapeUiPart = origMsg?.uiParts?.find(
                    (p) => p.kind === "scrape-progress",
                  );
                  if (scrapeUiPart) {
                    const rawState = String(scrapeUiPart.state ?? "loading");
                    const scrapeStatus: "loading" | "done" | "error" =
                      rawState === "done" ? "done" : rawState === "error" ? "error" : "loading";
                    const output = scrapeUiPart.output as Record<string, unknown> | undefined;
                    return (
                      <>
                        <ScrapeProgressBar
                          status={scrapeStatus}
                          url={output?.url as string | undefined}
                          title={output?.title as string | undefined}
                        />
                        {textContent && (
                          <MessageResponse>
                            <Streamdown plugins={{ code: streamdownCode }}>
                              {textContent}
                            </Streamdown>
                          </MessageResponse>
                        )}
                      </>
                    );
                  }
                  return null;
                })()}

                {!externalMessages[messageIndex]?.uiParts?.some((p) => p.kind === "scrape-progress") && (message.role === "assistant" ? (
                  textContent ? (
                    (textContent.includes('file="') ||
                      textContent.includes("```") ||
                      (Boolean(message.isStreaming) && textContent.length > 400)) ? (
                      <GenerationSummary content={textContent} isStreaming={Boolean(message.isStreaming)} simplified={hideTooling} />
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
                    <span className="text-sm text-muted-foreground">Ansluter...</span>
                  ) : null
                ) : (
                  <CollapsibleUserMessage content={textContent} />
                ))}

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
                  hasGenerationContent(textContent, false) && (
                    <VersionFeedback
                      chatId={chatId}
                      versionId={versionId}
                      className="mt-2 pt-2 border-t border-border"
                    />
                  )}
              </MessageContent>
            </Message>
          );
          })}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {showNudge && onSuggestionSend && (
        <div className="flex justify-center px-4 pb-2 animate-fade-up">
          <button
            type="button"
            onClick={() => {
              onSuggestionSend("Vad vill du ändra?");
              setShowNudge(false);
            }}
            className="rounded-full border border-border/40 bg-card/60 px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          >
            Vad vill du ändra?
          </button>
        </div>
      )}

      {pendingReply && !hideTooling && (
        <>
          <Dialog open={isReplyDialogOpen} onOpenChange={setIsReplyDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-semibold text-primary">
                  Svar krävs
                </DialogTitle>
                <DialogDescription>
                  Buildern väntar på ditt val.
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
              className="fixed bottom-6 right-6 z-40 bg-primary text-primary-foreground hover:bg-primary/90"
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
    return <p className="text-sm whitespace-pre-wrap">{content}</p>;
  }

  // Extract summary line (first line before ---)
  const lines = content.split("\n");
  const summaryEndIndex = lines.findIndex((line) => line.trim() === "---");
  const summaryLines = summaryEndIndex > 0 ? lines.slice(0, summaryEndIndex) : lines.slice(0, 3);
  const summary = summaryLines.join("\n").trim();

  if (isExpanded) {
    return (
      <div className="space-y-2">
        <p className="text-sm whitespace-pre-wrap">{content}</p>
        <button
          onClick={() => setIsExpanded(false)}
          className="flex items-center gap-1 text-xs opacity-70 hover:opacity-100"
        >
          <ChevronUp className="h-3 w-3" />
          Dölj detaljer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm whitespace-pre-wrap">{summary}</p>
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


