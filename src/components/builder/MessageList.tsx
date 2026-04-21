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

/**
 * Streamdown 2.x renders inline links inside a wrapper that, in
 * combination with the link-safety modal portal, occasionally injects
 * block-level elements inside `<p>` tags during hydration ("nested
 * `<a>`/`<div>` inside `<p>`" warning in console). We don't need the
 * link-safety popup or fancy preview affordance for assistant messages,
 * so render a plain anchor instead. This is the documented escape
 * hatch: the `components` prop forwards ReactMarkdown's component
 * override map straight through.
 *
 * If/when Streamdown ships an explicit `linkPreview={false}` toggle
 * this override can be replaced.
 */
const STREAMDOWN_PLAIN_COMPONENTS = {
  a: ({ children, href, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      {...rest}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2"
    >
      {children}
    </a>
  ),
};
import { toAIElementsFormat } from "@/lib/builder/messageAdapter";
import type { MessagePart } from "@/lib/builder/messageAdapter";
import type { ChatMessage } from "@/lib/builder/types";
import type { EngineVersionLifecycleStage } from "@/lib/db/engine-version-lifecycle";
import { ChevronDown, ChevronUp, Loader2, MessageSquare } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState, type AnchorHTMLAttributes } from "react";

interface MessageListProps {
  chatId: string | null;
  versionId?: string | null;
  messages?: Array<ChatMessage>;
  showStructuredParts?: boolean;
  onQuickReply?: (text: string, options?: { planMode?: boolean }) => Promise<void> | void;
  onApproveBuildPlan?: (plan: Record<string, unknown>) => Promise<void> | void;
  quickReplyDisabled?: boolean;
  /**
   * F2 vs F3 lifecycle gate. Forwarded to plan / tooling cards so their
   * env / integrations buttons are hidden during F2, and used to gate
   * the env-requirement auto-open side effect.
   */
  lifecycleStage?: EngineVersionLifecycleStage | null;
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
  lifecycleStage = null,
}: MessageListProps) => {
  const isIntegrations = lifecycleStage === "integrations";
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
    // F2-mute: ProjectEnvVarsPanel is only mounted in F3, so suppress the
    // auto-open side effect during F2 to avoid silently dispatching events
    // nothing is listening for.
    if (!isIntegrations) return;
    if (lastAutoOpenedEnvRequirementRef.current === requirement.key) return;
    lastAutoOpenedEnvRequirementRef.current = requirement.key;
    openProjectEnvVarsPanel(requirement.envKeys);
  }, [latestEnvRequirement, isIntegrations]);

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
          const hasVisibleTooling =
            agentLogItems.length > 0 || compactToolParts.length > 0 || toolParts.length > 0;
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
                      lifecycleStage={lifecycleStage}
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
                      lifecycleStage={lifecycleStage}
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
                          lifecycleStage={lifecycleStage}
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
                    hasGenerationContent(textContent) ? (
                      <GenerationSummary content={textContent} isStreaming={Boolean(message.isStreaming)} />
                    ) : (
                      <MessageResponse>
                        <Streamdown
                          plugins={{ code: streamdownCode }}
                          components={STREAMDOWN_PLAIN_COMPONENTS}
                          isAnimating={Boolean(message.isStreaming)}
                          caret={message.isStreaming ? "block" : undefined}
                        >
                          {textContent}
                        </Streamdown>
                      </MessageResponse>
                    )
                  ) : message.isStreaming && !reasoningPart && !hasStructuredParts && !hasVisibleTooling ? (
                    <span className="text-sm text-gray-500">Startar own-engine-ström...</span>
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
 *
 * Special-case: server- och klient-driven autofix-prompter (start med
 * "AUTO-FIX REQUEST — TARGETED REPAIR") är interna repair-instruktioner
 * till modellen och ska ALDRIG renderas som vanlig användarchat-text.
 * De visas som en kompakt status-rad med expanderbart innehåll för
 * felsökning.
 */
/**
 * Best-effort phase guess for the auto-repair status line.
 *
 * The repair pipeline does not currently emit per-phase SSE events to
 * this component, so we derive a phase label from elapsed wall-clock
 * since the user-message rendered. Numbers are calibrated against the
 * observed Snickar Anders timings (see logs/generationslogg/20260419-235205):
 *   reasoning ~10s, output ~40s, autofix ~5s, verifier ~3-5s,
 *   quality-gate ~30-40s. Total around 100-150s.
 *
 * The label is intentionally hedged ("ungefär") — when the model takes
 * substantially longer (e.g. max-tier with thinking can spend 6 min on
 * reasoning alone) the phase shown will lag reality, but at least the
 * elapsed counter is honest.
 */
function describeRepairPhase(elapsedSec: number): string {
  if (elapsedSec < 12) return "LLM tänker";
  if (elapsedSec < 50) return "Skriver kod";
  if (elapsedSec < 60) return "Autofix";
  if (elapsedSec < 100) return "Verifierar";
  return "Slutför";
}

function RepairProgressIndicator() {
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const next = Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSec(next);
      // Cap at 5 min — by then either the chat has moved on or
      // something is clearly stuck and we shouldn't keep counting.
      if (next > 300) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, []);
  const phase = describeRepairPhase(elapsedSec);
  return (
    <div
      className="text-muted-foreground bg-muted/40 inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs"
      aria-live="polite"
    >
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>Automatisk reparation körs</span>
      <span className="text-muted-foreground/70">·</span>
      <span className="text-foreground/80">{phase}</span>
      <span className="text-muted-foreground/70">·</span>
      <span className="tabular-nums">{elapsedSec}s</span>
    </div>
  );
}

function CollapsibleUserMessage({ content }: { content: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const lineCount = content.split("\n").length;
  const charCount = content.length;

  const isAutoFixPrompt = content.trimStart().startsWith("AUTO-FIX REQUEST");
  if (isAutoFixPrompt) {
    return (
      <div className="space-y-2">
        <RepairProgressIndicator />
        {isExpanded ? (
          <div className="space-y-2">
            <MessageResponse>
              <Streamdown
                plugins={{ code: streamdownCode }}
                components={STREAMDOWN_PLAIN_COMPONENTS}
              >
                {content}
              </Streamdown>
            </MessageResponse>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
            >
              <ChevronUp className="h-3 w-3" />
              Dölj reparations-prompt
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsExpanded(true)}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            <ChevronDown className="h-3 w-3" />
            Visa intern reparations-prompt ({lineCount} rader)
          </button>
        )}
      </div>
    );
  }

  // Check if this is a long technical message (shadcn block prompt pattern)
  const isTechnicalPrompt = content.includes("---") && content.includes("Registry files");

  // Only collapse if message is long (>500 chars or >10 lines) and contains technical content
  const shouldCollapse = isTechnicalPrompt && (charCount > 500 || lineCount > 10);

  if (!shouldCollapse) {
    return (
      <MessageResponse>
        <Streamdown
          plugins={{ code: streamdownCode }}
          components={STREAMDOWN_PLAIN_COMPONENTS}
        >
          {content}
        </Streamdown>
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
          <Streamdown
            plugins={{ code: streamdownCode }}
            components={STREAMDOWN_PLAIN_COMPONENTS}
          >
            {content}
          </Streamdown>
        </MessageResponse>
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
      <MessageResponse>
        <Streamdown
          plugins={{ code: streamdownCode }}
          components={STREAMDOWN_PLAIN_COMPONENTS}
        >
          {summary}
        </Streamdown>
      </MessageResponse>
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


