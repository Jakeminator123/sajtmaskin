"use client";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Sources, SourcesContent, SourcesTrigger, Source } from "@/components/ai-elements/sources";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
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
import { CodeBlock } from "@/components/ai-elements/code-block";
import { toAIElementsFormat, hasToolData } from "@/lib/builder/messageAdapter";
import type { AIElementsMessage, MessagePart } from "@/lib/builder/messageAdapter";
import type { ChatMessage } from "@/lib/builder/types";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Loader2, MessageSquare } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ToolUIPart } from "ai";

interface MessageListProps {
  chatId: string | null;
  messages?: Array<ChatMessage>;
  showStructuredParts?: boolean;
  onQuickReply?: (text: string) => Promise<void> | void;
  quickReplyDisabled?: boolean;
}

const MessageListComponent = ({
  chatId,
  messages: externalMessages = [],
  showStructuredParts = false,
  onQuickReply,
  quickReplyDisabled = false,
}: MessageListProps) => {
  const messages = useMemo(() => externalMessages.map(toAIElementsFormat), [externalMessages]);
  const [pendingQuickReplyKey, setPendingQuickReplyKey] = useState<string | null>(null);
  const [isReplyDialogOpen, setIsReplyDialogOpen] = useState(false);
  const lastAutoOpenedReplyKeyRef = useRef<string | null>(null);
  const lastAutoOpenedEnvRequirementRef = useRef<string | null>(null);

  const sendQuickReply = async (messageId: string, optionIndex: number, text: string) => {
    if (!onQuickReply) return false;
    const key = `${messageId}:${optionIndex}:${text}`;
    setPendingQuickReplyKey(key);
    try {
      await onQuickReply(text);
      return true;
    } catch (error) {
      console.error("Quick reply failed:", error);
      return false;
    } finally {
      setPendingQuickReplyKey((current) => (current === key ? null : current));
    }
  };

  const pendingReply = useMemo(() => getLatestPendingReply(messages), [messages]);
  const latestEnvRequirement = useMemo(() => getLatestEnvRequirement(messages), [messages]);

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

  useEffect(() => {
    const handleDialogClose = () => setIsReplyDialogOpen(false);
    window.addEventListener("dialog-close", handleDialogClose);
    return () => window.removeEventListener("dialog-close", handleDialogClose);
  }, []);

  const handleModalQuickReply = async (option: string, optionIndex: number) => {
    if (!pendingReply) return;
    const success = await sendQuickReply(pendingReply.messageId, optionIndex, option);
    if (success) {
      setIsReplyDialogOpen(false);
    }
  };

  if (!chatId && messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
        <MessageSquare className="mb-3 h-10 w-10" />
        <p className="text-sm">Ingen chat vald ännu</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-500">
        <MessageSquare className="mb-3 h-10 w-10" />
        <p className="text-sm">Inga meddelanden ännu</p>
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
          const agentLogItems = showStructuredParts ? [] : buildAgentLogItems(toolParts);
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
          const hasUserAfterCurrentMessage = hasUserMessageAfter(messages, messageIndex);

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
                  message.role === "assistant" &&
                  toolParts.map((part, index) => {
                    const tool = part.tool as Partial<ToolUIPart> & {
                      type?: string;
                      approval?: unknown;
                    };
                    const toolState = (
                      typeof tool.state === "string" ? tool.state : "input-available"
                    ) as ToolUIPart["state"];
                    const { toolType, toolTitle } = resolveToolLabels(tool);
                    const replyPrompt = getActionPrompt(tool, toolState);
                    const canQuickReply =
                      Boolean(onQuickReply) &&
                      !quickReplyDisabled &&
                      replyPrompt &&
                      replyPrompt.options.length > 0;
                    const hasInput = tool.input !== undefined && tool.input !== null;
                    const hasOutput = tool.output !== undefined && tool.output !== null;
                    const hasErrorText =
                      typeof tool.errorText === "string" && tool.errorText.trim().length > 0;
                    const toolRecord = tool as Record<string, unknown>;
                    const toolCallId =
                      (typeof tool.toolCallId === "string" && tool.toolCallId) ||
                      (typeof toolRecord.id === "string" && toolRecord.id) ||
                      null;
                    const toolDebug = {
                      type: toolType,
                      name: toolTitle,
                      state: toolState,
                      toolCallId,
                      hasInput,
                      hasOutput,
                    };
                    const postCheckSummary =
                      toolType === "tool-post-check" ? getPostCheckSummary(tool.output) : null;

                    // Collapse empty tool calls by default - they'll expand when data arrives
                    const toolHasData = hasToolData(tool as ToolUIPart);

                    return (
                      <Tool
                        key={`${message.id}-tool-${toolType}-${index}`}
                        defaultOpen={toolHasData}
                      >
                        <ToolHeader title={toolTitle} type={toolType} state={toolState} />
                        <ToolContent>
                          {!pendingReply && !hasUserAfterCurrentMessage && replyPrompt && (
                            <div className="mb-3 rounded-md border border-amber-500/60 bg-amber-500/10 p-3 text-xs">
                              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-200">
                                Svar krävs
                              </p>
                              <p className="text-foreground text-sm font-semibold">
                                {replyPrompt.question}
                              </p>
                              {replyPrompt.options.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {replyPrompt.options.map((option, optionIndex) => {
                                    const replyKey = `${message.id}:${optionIndex}:${option}`;
                                    const isPending = pendingQuickReplyKey === replyKey;
                                    return (
                                      <Button
                                        key={replyKey}
                                        size="sm"
                                        variant="secondary"
                                        disabled={!canQuickReply || pendingQuickReplyKey !== null}
                                        onClick={() =>
                                          void sendQuickReply(message.id, optionIndex, option)
                                        }
                                      >
                                        {isPending ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : null}
                                        {option}
                                      </Button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                          {hasInput && <ToolInput input={tool.input} />}
                          <ToolOutput
                            output={tool.output}
                            errorText={
                              typeof tool.errorText === "string" ? tool.errorText : undefined
                            }
                          />
                          {postCheckSummary && (
                            <div className="border-border bg-muted/40 mb-3 rounded-md border p-3 text-xs">
                              <div className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                                Post-check-sammanfattning
                              </div>
                              <div className="text-muted-foreground space-y-1">
                                {postCheckSummary.files !== null && (
                                  <div>Filer: {postCheckSummary.files}</div>
                                )}
                                {postCheckSummary.added !== null &&
                                  postCheckSummary.modified !== null &&
                                  postCheckSummary.removed !== null && (
                                    <div>
                                      Ändringar: +{postCheckSummary.added} ~
                                      {postCheckSummary.modified} -{postCheckSummary.removed}
                                    </div>
                                  )}
                                {postCheckSummary.warnings !== null && (
                                  <div>Varningar: {postCheckSummary.warnings}</div>
                                )}
                                {postCheckSummary.previousVersionId && (
                                  <div>
                                    Föregående version: {postCheckSummary.previousVersionId}
                                  </div>
                                )}
                                {postCheckSummary.demoUrl && (
                                  <a
                                    className="text-primary inline-flex items-center gap-1"
                                    href={postCheckSummary.demoUrl}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    Öppna preview-länk
                                  </a>
                                )}
                              </div>
                            </div>
                          )}
                          {!hasInput && !hasOutput && !hasErrorText && (
                            <div className="text-muted-foreground p-4 text-xs">
                              AI-motorn skickade en tool-call, men data har inte anlänt än. Detta är
                              normalt under streaming. Output läggs till när svaret är redo. Post-check
                              är en snabb statisk kontroll och verifierar inte att sidan fungerar
                              fullt ut.
                            </div>
                          )}
                          <div className="border-border border-t p-4">
                            <div className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                              Tool debug
                            </div>
                            <div className="text-muted-foreground mb-2 space-y-1 text-xs">
                              <p>
                                <span className="font-medium">hasInput</span> visar om tool-callen
                                innehåller en input-payload (parametrar).
                              </p>
                              <p>
                                <span className="font-medium">hasOutput</span> visar om tool-callen
                                redan har ett resultat/response.
                              </p>
                              <p>
                                <span className="font-medium">state</span> beskriver status (t.ex.
                                input-available, output-available, output-error).
                              </p>
                              <p>
                                <span className="font-medium">toolCallId</span> identifierar
                                verktygsanropet och kan saknas tills det registrerats.
                              </p>
                            </div>
                            <CodeBlock code={JSON.stringify(toolDebug, null, 2)} language="json" />
                          </div>
                        </ToolContent>
                      </Tool>
                    );
                  })}

                {!showStructuredParts &&
                  message.role === "assistant" &&
                  agentLogItems.length > 0 && (
                    <div className="border-border bg-muted/30 mb-3 rounded-md border p-3">
                      <div className="text-muted-foreground text-xs font-medium">Agentlogg</div>
                      <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
                        {agentLogItems.map((item, index) => (
                          <li key={`${message.id}-agent-${index}`} className="flex gap-2">
                            <span className="bg-muted-foreground/70 mt-1 h-1.5 w-1.5 rounded-full" />
                            <span>{item.label}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                {!showStructuredParts &&
                  message.role === "assistant" &&
                  compactToolParts.map((part, index) => {
                    const tool = part.tool as Partial<ToolUIPart> & {
                      type?: string;
                      approval?: unknown;
                    };
                    const toolState = (
                      typeof tool.state === "string" ? tool.state : "input-available"
                    ) as ToolUIPart["state"];
                    const { toolType, toolTitle } = resolveToolLabels(tool);
                    const integrationSummary = getToolIntegrationSummary(tool);
                    const integrationCard = getIntegrationCardData(tool);
                    const replyPrompt = getActionPrompt(tool, toolState);
                    const requiresUserReply = toolState === "approval-requested" || Boolean(replyPrompt);
                    const canQuickReply =
                      Boolean(onQuickReply) &&
                      !quickReplyDisabled &&
                      replyPrompt &&
                      replyPrompt.options.length > 0;
                    const canOpen = Boolean(chatId);
                    const projectEnvKeys = dedupeStrings([
                      ...(integrationSummary?.envKeys ?? []),
                      ...(integrationCard?.envKeys ?? []),
                    ]);

                    return (
                      <div
                        key={`${message.id}-tool-compact-${toolType}-${index}`}
                        className="border-border bg-card mb-3 rounded-md border p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium">{toolTitle}</div>
                          <span className="text-muted-foreground text-xs">
                            {getToolStateLabel(toolState)}
                          </span>
                        </div>
                        {replyPrompt ? (
                          !pendingReply && !hasUserAfterCurrentMessage ? (
                            <div
                              className={cn(
                                "mt-2 rounded-md border p-2 text-xs",
                                requiresUserReply
                                  ? "border-amber-500/60 bg-amber-500/10"
                                  : "border-border bg-muted/20",
                              )}
                            >
                              {requiresUserReply && (
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-200">
                                  Svar krävs
                                </p>
                              )}
                              <p className="text-foreground text-sm font-semibold">
                                {replyPrompt.question}
                              </p>
                              {replyPrompt.options.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {replyPrompt.options.map((option, optionIndex) => {
                                    const replyKey = `${message.id}:${optionIndex}:${option}`;
                                    const isPending = pendingQuickReplyKey === replyKey;
                                    return (
                                      <Button
                                        key={replyKey}
                                        size="sm"
                                        variant="secondary"
                                        disabled={!canQuickReply || pendingQuickReplyKey !== null}
                                        onClick={() =>
                                          void sendQuickReply(message.id, optionIndex, option)
                                        }
                                      >
                                        {isPending ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : null}
                                        {option}
                                      </Button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-muted-foreground mt-2">
                                  Svara i chatten för att fortsätta genereringen.
                                </p>
                              )}
                            </div>
                          ) : null
                        ) : (
                          <>
                            {integrationSummary?.name && (
                              <p className="text-muted-foreground mt-1 text-xs">
                                Integration: {integrationSummary.name}
                              </p>
                            )}
                            {integrationSummary?.envKeys && integrationSummary.envKeys.length > 0 && (
                              <p className="text-muted-foreground mt-1 text-xs">
                                Miljövariabler: {integrationSummary.envKeys.join(", ")}
                              </p>
                            )}
                            {integrationSummary?.status && (
                              <p className="text-muted-foreground mt-1 text-xs">
                                Status: {integrationSummary.status}
                              </p>
                            )}
                            {integrationCard ? (
                              <div className="border-border bg-muted/20 mt-2 rounded-md border p-2 text-xs">
                                {integrationCard.intentLabel && (
                                  <p className="text-muted-foreground">
                                    Åtgärd: {integrationCard.intentLabel}
                                  </p>
                                )}
                                {integrationCard.envKeys.length > 0 && (
                                  <p className="text-muted-foreground mt-1">
                                    Miljövariabler: {integrationCard.envKeys.join(", ")}
                                  </p>
                                )}
                                {integrationCard.sourceEvent && (
                                  <p className="text-muted-foreground mt-1">
                                    Källa: {integrationCard.sourceEvent}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <>
                                <p className="text-muted-foreground mt-2 text-xs">
                                  Den här åtgärden hanteras av den externa motorn. Öppna extern chat
                                  om du vill installera.
                                </p>
                                <p className="text-muted-foreground mt-1 text-xs">
                                  Om integration krävs: kontrollera Integrationspanelen för saknade nycklar.
                                </p>
                              </>
                            )}
                          </>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => openChatInV0(chatId)}
                            disabled={!canOpen}
                          >
                            Öppna extern chat
                          </Button>
                          {integrationCard?.marketplaceUrl && (
                            <Button size="sm" variant="outline" asChild>
                              <a
                                href={integrationCard.marketplaceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Öppna Marketplace
                              </a>
                            </Button>
                          )}
                          {!replyPrompt && projectEnvKeys.length > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openProjectEnvVarsPanel(projectEnvKeys)}
                            >
                              Öppna miljövariabler
                            </Button>
                          )}
                          {!replyPrompt && (
                            <Button size="sm" variant="outline" onClick={openIntegrationsPanel}>
                              Öppna Integrationspanelen
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}

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
                        {part.plan.steps && part.plan.steps.length > 0 && (
                          <ol className="text-muted-foreground mt-2 list-decimal space-y-1 pl-4 text-sm">
                            {part.plan.steps.map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ol>
                        )}
                        {!part.plan.content &&
                          (!part.plan.steps || part.plan.steps.length === 0) &&
                          part.plan.raw && (
                            <div className="bg-muted/50 rounded-md p-3">
                              <CodeBlock
                                code={JSON.stringify(part.plan.raw, null, 2)}
                                language="json"
                              />
                            </div>
                          )}
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
                    <MessageResponse>{textContent}</MessageResponse>
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
          <Dialog open={isReplyDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-semibold text-amber-300">
                  Svar krävs för att fortsätta
                </DialogTitle>
                <DialogDescription>
                  Buildern väntar på ditt val innan nästa steg i chatten kan fortsätta.
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

function resolveToolLabels(tool: Partial<ToolUIPart> & { type?: string }) {
  const rawToolType = typeof tool.type === "string" ? `${tool.type}` : "";
  const toolType = (() => {
    if (!rawToolType || rawToolType === "tool") return "tool-unknown";
    if (rawToolType.startsWith("tool-")) return rawToolType;
    if (rawToolType.startsWith("tool:")) return `tool-${rawToolType.slice(5)}`;
    if (rawToolType.startsWith("tool_")) return `tool-${rawToolType.slice(5)}`;
    return `tool-${rawToolType}`;
  })() as ToolUIPart["type"];
  const toolTitle =
    typeof (tool as { name?: string }).name === "string"
      ? (tool as { name?: string }).name
      : typeof (tool as { toolName?: string }).toolName === "string"
        ? (tool as { toolName?: string }).toolName
        : toolType.replace(/^tool[-_:]/, "") || "Tool";

  return { toolType, toolTitle };
}

type AgentLogItem = {
  label: string;
};

function buildAgentLogItems(toolParts: Array<Extract<MessagePart, { type: "tool" }>>) {
  const items: AgentLogItem[] = [];
  toolParts.forEach((part) => {
    const tool = part.tool as Partial<ToolUIPart> & { type?: string; input?: unknown };
    const toolState = (
      typeof tool.state === "string" ? tool.state : "input-available"
    ) as ToolUIPart["state"];
    const { toolTitle } = resolveToolLabels(tool);
    const steps = extractToolSteps(tool);

    if (steps.length > 0) {
      steps.forEach((step) => {
        items.push({ label: step });
      });
    } else {
      items.push({ label: `${toolTitle} • ${getToolStateLabel(toolState)}` });
    }
  });

  return items;
}

function extractToolSteps(tool: Partial<ToolUIPart> & { input?: unknown }) {
  const output = tool.output;
  if (typeof output === "string") {
    return splitToSteps(output);
  }
  if (Array.isArray(output)) {
    return output
      .map((item) => extractStepFromValue(item))
      .filter((item): item is string => Boolean(item));
  }
  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    const listFromKeys = coerceStringArray(
      obj.steps ?? obj.actions ?? obj.results ?? obj.messages ?? obj.items,
    );
    if (listFromKeys.length > 0) return listFromKeys;

    if (Array.isArray(obj.files)) {
      const fileSteps = obj.files
        .map((item) => extractStepFromValue(item))
        .filter((item): item is string => Boolean(item));
      if (fileSteps.length > 0) return fileSteps;
    }

    if (Array.isArray(obj.images) || Array.isArray(obj.assets)) {
      const assets = (obj.images ?? obj.assets) as unknown[];
      if (assets.length > 0) {
        return assets
          .map((item) => extractStepFromValue(item))
          .filter((item): item is string => Boolean(item));
      }
    }
  }

  const input = tool.input;
  if (input && typeof input === "object") {
    const inputObj = input as Record<string, unknown>;
    const integrationName =
      (typeof inputObj.integration === "string" && inputObj.integration) ||
      (typeof inputObj.provider === "string" && inputObj.provider) ||
      (typeof inputObj.service === "string" && inputObj.service) ||
      (typeof inputObj.name === "string" && inputObj.name) ||
      null;
    if (integrationName) {
      return [`Begär integration: ${integrationName}`];
    }
  }

  return [];
}

function extractStepFromValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const label =
      (typeof obj.label === "string" && obj.label) ||
      (typeof obj.title === "string" && obj.title) ||
      (typeof obj.name === "string" && obj.name) ||
      (typeof obj.status === "string" && obj.status) ||
      null;
    return label ? String(label) : null;
  }
  return null;
}

function splitToSteps(text: string) {
  const normalized = text.trim();
  if (!normalized) return [];
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 ? lines : [normalized];
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter((item) => item.trim().length > 0);
}

type ToolQuestionPrompt = {
  question: string;
  options: string[];
};

type PendingReplyModalData = {
  key: string;
  messageId: string;
  question: string;
  options: string[];
};

type EnvRequirementHint = {
  key: string;
  envKeys: string[];
};

function getLatestPendingReply(messages: AIElementsMessage[]): PendingReplyModalData | null {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message.role !== "assistant") continue;
    if (hasUserMessageAfter(messages, messageIndex)) continue;
    const toolParts = message.parts.filter(
      (part): part is Extract<MessagePart, { type: "tool" }> => part.type === "tool",
    );
    for (let toolIndex = toolParts.length - 1; toolIndex >= 0; toolIndex -= 1) {
      const toolPart = toolParts[toolIndex];
      const tool = toolPart.tool as Partial<ToolUIPart> & {
        type?: string;
        approval?: unknown;
      };
      const toolState = (
        typeof tool.state === "string" ? tool.state : "input-available"
      ) as ToolUIPart["state"];
      const replyPrompt = getActionPrompt(tool, toolState);
      if (!replyPrompt) continue;
      const toolCallId =
        (typeof tool.toolCallId === "string" && tool.toolCallId) || `tool-${toolIndex}`;
      const key = [
        message.id,
        toolCallId,
        replyPrompt.question,
        replyPrompt.options.join("|"),
      ].join(":");
      return {
        key,
        messageId: message.id,
        question: replyPrompt.question,
        options: replyPrompt.options,
      };
    }
    // Fallback: awaiting-input tool present but question could not be extracted
    const hasAwaitingInput = toolParts.some((p) => {
      const t = p.tool as { type?: string; state?: string };
      return t.type === "tool:awaiting-input" || t.state === "approval-requested";
    });
    if (hasAwaitingInput) {
      return {
        key: `${message.id}:awaiting-input-fallback`,
        messageId: message.id,
        question: "V0 väntar på ditt svar. Kontrollera meddelandet ovan och skriv ett svar.",
        options: [],
      };
    }
  }
  return null;
}

function getLatestEnvRequirement(messages: AIElementsMessage[]): EnvRequirementHint | null {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message.role !== "assistant") continue;
    const toolParts = message.parts.filter(
      (part): part is Extract<MessagePart, { type: "tool" }> => part.type === "tool",
    );
    for (let toolIndex = toolParts.length - 1; toolIndex >= 0; toolIndex -= 1) {
      const toolPart = toolParts[toolIndex];
      const tool = toolPart.tool as Partial<ToolUIPart> & {
        type?: string;
        output?: unknown;
        input?: unknown;
      };
      const toolState = (
        typeof tool.state === "string" ? tool.state : "input-available"
      ) as ToolUIPart["state"];
      const summary = getToolIntegrationSummary(tool);
      const envKeys = dedupeStrings(summary?.envKeys ?? []);
      const looksEnvLike = looksLikeEnvVarEvent(typeof tool.type === "string" ? tool.type : "");
      const shouldPrompt =
        envKeys.length > 0 &&
        (toolState === "approval-requested" ||
          toolState === "output-available" ||
          toolState === "input-available" ||
          looksEnvLike);
      if (!shouldPrompt) continue;
      if (hasUserMessageAfter(messages, messageIndex)) continue;
      const toolCallId =
        (typeof tool.toolCallId === "string" && tool.toolCallId) || `tool-${toolIndex}`;
      return {
        key: [message.id, toolCallId, envKeys.join("|")].join(":"),
        envKeys,
      };
    }
  }
  return null;
}

function hasUserMessageAfter(messages: AIElementsMessage[], assistantMessageIndex: number): boolean {
  for (let i = assistantMessageIndex + 1; i < messages.length; i += 1) {
    if (messages[i]?.role === "user") return true;
  }
  return false;
}

function getToolQuestionPrompt(
  tool: Partial<ToolUIPart> & {
    input?: unknown;
    output?: unknown;
    type?: string;
    approval?: unknown;
  },
): ToolQuestionPrompt | null {
  const fromApproval = extractQuestionPrompt(tool.approval);
  if (fromApproval) return fromApproval;
  const fromOutput = extractQuestionPrompt(tool.output);
  if (fromOutput) return fromOutput;
  const fromInput = extractQuestionPrompt(tool.input);
  if (fromInput) return fromInput;

  const type = typeof tool.type === "string" ? tool.type.toLowerCase() : "";
  const toolWithName = tool as { name?: string; toolName?: string };
  const name = `${toolWithName.name ?? ""} ${toolWithName.toolName ?? ""}`.toLowerCase();
  const hasQuestionHint =
    type.includes("question") ||
    type.includes("clarif") ||
    type.includes("approval") ||
    name.includes("question") ||
    name.includes("clarif") ||
    name.includes("approval");
  if (!hasQuestionHint) return null;

  return {
    question: "Välj ett svar för att fortsätta.",
    options: [],
  };
}

function getActionPrompt(
  tool: Partial<ToolUIPart> & {
    input?: unknown;
    output?: unknown;
    type?: string;
    approval?: unknown;
  },
  state: ToolUIPart["state"],
): ToolQuestionPrompt | null {
  const explicitPrompt = getToolQuestionPrompt(tool);
  // Some providers mark follow-up questions as "input-available" even when
  // the payload already contains a concrete question/options prompt.
  const isActionableState =
    state === "approval-requested" ||
    ((state === "input-available" || state === "input-streaming") && Boolean(explicitPrompt));
  if (!isActionableState) return null;

  if (explicitPrompt) {
    const normalizedPrompt = {
      question: normalizeQuestionText(explicitPrompt.question),
      options: explicitPrompt.options.map(normalizeApprovalOptionLabel),
    };
    if (normalizedPrompt.options.length === 0) {
      return {
        question: normalizedPrompt.question,
        options: ["Godkänn förslag", "Avvisa förslag", "Annat"],
      };
    }
    return normalizedPrompt;
  }

  const approvalOptions = extractApprovalOptions(tool);
  return {
    question: "AI väntar på ditt svar innan nästa steg kan fortsätta.",
    options:
      approvalOptions.length > 0
        ? approvalOptions.map(normalizeApprovalOptionLabel)
        : ["Godkänn förslag", "Avvisa förslag", "Annat"],
  };
}

function normalizeQuestionText(value: string): string {
  return value
    .replace(/\bv0\b/gi, "AI")
    .replace(
      /needs your answer before the next version can be generated\.?/gi,
      "behöver ditt svar innan nästa version kan genereras.",
    )
    .replace(
      /needs your answer to a follow-up question before the next version can be generated\.?/gi,
      "behöver ditt svar på en följdfråga innan nästa version kan genereras.",
    )
    .replace(
      /pick an option in chat or reply with free text\.?/gi,
      "Välj ett alternativ i chatten eller svara med fri text.",
    );
}

function normalizeApprovalOptionLabel(value: string): string {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "approve plan") return "Godkänn förslag";
  if (lower === "deny plan") return "Avvisa förslag";
  if (lower === "other") return "Annat";
  return trimmed.replace(/\bv0\b/gi, "AI");
}

function extractQuestionPrompt(value: unknown, depth = 0): ToolQuestionPrompt | null {
  if (depth > 4) return null;
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const question =
    (typeof obj.question === "string" && obj.question.trim()) ||
    (typeof obj.prompt === "string" && obj.prompt.trim()) ||
    (typeof obj.title === "string" && obj.title.trim()) ||
    (typeof obj.message === "string" && obj.message.trim()) ||
    (typeof obj.text === "string" && obj.text.trim()) ||
    (typeof obj.description === "string" && obj.description.trim()) ||
    (typeof obj.label === "string" && obj.label.trim()) ||
    null;

  const options = readQuestionOptions(
    obj.options ??
      obj.choices ??
      obj.answers ??
      obj.buttons ??
      obj.values ??
      obj.items ??
      obj.questions,
  );
  if (question || options.length > 0) {
    return {
      question: question || "Choose an answer to continue.",
      options,
    };
  }

  const nestedCandidates = [
    obj.approval,
    obj.data,
    obj.payload,
    obj.result,
    obj.response,
    obj.meta,
    obj.details,
  ];
  for (const candidate of nestedCandidates) {
    const nested = extractQuestionPrompt(candidate, depth + 1);
    if (nested) return nested;
  }

  for (const nestedValue of Object.values(obj)) {
    if (!nestedValue || typeof nestedValue !== "object") continue;
    const nested = extractQuestionPrompt(nestedValue, depth + 1);
    if (nested) return nested;
  }

  return null;
}

function readQuestionOptions(value: unknown): string[] {
  if (Array.isArray(value)) {
    const options = value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (!item || typeof item !== "object") return "";
        const obj = item as Record<string, unknown>;
        return (
          (typeof obj.label === "string" && obj.label.trim()) ||
          (typeof obj.text === "string" && obj.text.trim()) ||
          (typeof obj.title === "string" && obj.title.trim()) ||
          (typeof obj.value === "string" && obj.value.trim()) ||
          (typeof obj.name === "string" && obj.name.trim()) ||
          ""
        );
      })
      .filter(Boolean);
    return dedupeStrings(options).slice(0, 8);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const options = entries
      .map(([key, item]) => {
        if (typeof item === "string" && item.trim()) return item.trim();
        if (typeof key === "string" && key.trim()) return key.trim();
        return "";
      })
      .filter(Boolean);
    return dedupeStrings(options).slice(0, 8);
  }

  return [];
}

function extractApprovalOptions(
  tool: Partial<ToolUIPart> & { input?: unknown; output?: unknown; approval?: unknown },
): string[] {
  const outputObj =
    tool.output && typeof tool.output === "object" ? (tool.output as Record<string, unknown>) : null;
  const inputObj =
    tool.input && typeof tool.input === "object" ? (tool.input as Record<string, unknown>) : null;
  const approvalObj =
    tool.approval && typeof tool.approval === "object"
      ? (tool.approval as Record<string, unknown>)
      : null;
  const options = dedupeStrings([
    ...readQuestionOptions(approvalObj?.options ?? approvalObj?.choices ?? approvalObj?.answers),
    ...readQuestionOptions(outputObj?.options ?? outputObj?.choices ?? outputObj?.answers),
    ...readQuestionOptions(inputObj?.options ?? inputObj?.choices ?? inputObj?.answers),
  ]);
  return dedupeStrings(options).slice(0, 8);
}

function isActionableToolPart(tool: Partial<ToolUIPart> & { type?: string }) {
  const state = typeof tool.state === "string" ? tool.state : "";
  const normalizedState = state as ToolUIPart["state"];
  if (
    getActionPrompt(
      tool as Partial<ToolUIPart> & {
        input?: unknown;
        output?: unknown;
        type?: string;
        approval?: unknown;
      },
      normalizedState,
    )
  ) {
    return true;
  }
  const type = typeof tool.type === "string" ? tool.type.toLowerCase() : "";
  const toolWithName = tool as { name?: string; toolName?: string };
  const name = (toolWithName.name ?? toolWithName.toolName ?? "").toLowerCase();
  return (
    type.includes("install") ||
    name.includes("install") ||
    type.includes("integration") ||
    name.includes("integration") ||
    looksLikeEnvVarEvent(type) ||
    looksLikeEnvVarEvent(name)
  );
}

function looksLikeEnvVarEvent(value: string): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  if (normalized.includes("environment")) return true;
  if (normalized.includes("env-var") || normalized.includes("env_var") || normalized.includes("envvar")) {
    return true;
  }
  if (normalized.includes("env") && (normalized.includes("var") || normalized.includes("variable"))) {
    return true;
  }
  return false;
}

type ToolIntegrationSummary = {
  name?: string;
  envKeys?: string[];
  status?: string;
};

type IntegrationCardData = {
  name: string;
  status?: string;
  intentLabel?: string;
  envKeys: string[];
  marketplaceUrl?: string | null;
  sourceEvent?: string | null;
};

function getToolIntegrationSummary(
  tool: Partial<ToolUIPart> & { input?: unknown; output?: unknown; type?: string },
): ToolIntegrationSummary | null {
  const name =
    extractIntegrationName(tool.input) ||
    extractIntegrationName(tool.output) ||
    extractIntegrationName(tool);
  const envKeys = dedupeStrings([
    ...extractEnvKeys(tool.input),
    ...extractEnvKeys(tool.output),
  ]);
  let status = extractStatus(tool.output) || extractStatus(tool.input);
  const type = typeof tool.type === "string" ? tool.type.toLowerCase() : "";
  if (!status && type.includes("added-environment-variables")) {
    status = "Miljövariabler tillagda";
  }
  if (!status && type.includes("added-integration")) {
    status = "Integration tillagd";
  }

  if (!name && envKeys.length === 0 && !status) return null;
  return {
    name: name || undefined,
    envKeys: envKeys.length > 0 ? envKeys : undefined,
    status: status || undefined,
  };
}

function getIntegrationCardData(
  tool: Partial<ToolUIPart> & { input?: unknown; output?: unknown; type?: string },
): IntegrationCardData | null {
  const summary = getToolIntegrationSummary(tool);
  const output = tool.output && typeof tool.output === "object" ? (tool.output as Record<string, unknown>) : null;
  const intentRaw = typeof output?.intent === "string" ? output.intent : null;
  const intentLabel =
    intentRaw === "install"
      ? "Installera"
      : intentRaw === "connect"
        ? "Koppla"
        : intentRaw === "env_vars"
          ? "Konfigurera miljövariabler"
          : intentRaw === "configure"
            ? "Konfigurera"
            : undefined;
  const marketplaceUrl =
    (typeof output?.marketplaceUrl === "string" && output.marketplaceUrl) ||
    (typeof output?.installUrl === "string" && output.installUrl) ||
    null;
  const sourceEvent = typeof output?.sourceEvent === "string" ? output.sourceEvent : null;
  const name = summary?.name || (typeof output?.name === "string" ? output.name : null) || null;
  const envKeys = summary?.envKeys ?? [];
  const status =
    summary?.status || (typeof output?.status === "string" ? output.status : undefined);

  if (!name && envKeys.length === 0 && !marketplaceUrl && !intentLabel) return null;
  return {
    name: name || "Integration",
    status,
    intentLabel,
    envKeys,
    marketplaceUrl,
    sourceEvent,
  };
}

function extractIntegrationName(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const candidate =
      (typeof obj.integration === "string" && obj.integration) ||
      (typeof obj.provider === "string" && obj.provider) ||
      (typeof obj.service === "string" && obj.service) ||
      (typeof obj.name === "string" && obj.name) ||
      (typeof obj.title === "string" && obj.title) ||
      null;
    return candidate ? String(candidate) : null;
  }
  return null;
}

function extractEnvKeys(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    return looksLikeEnvKey(value) ? [value.trim()] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractEnvKeys(item));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const directKey = typeof obj.key === "string" ? obj.key : null;
    if (directKey) return [directKey];
    const containers = [
      obj.envVars,
      obj.environmentVariables,
      obj.variables,
      obj.vars,
      obj.keys,
      obj.env,
    ];
    return containers.flatMap((item) => extractEnvKeys(item));
  }
  return [];
}

function extractStatus(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const candidate =
    (typeof obj.status === "string" && obj.status) ||
    (typeof obj.state === "string" && obj.state) ||
    (typeof obj.result === "string" && obj.result) ||
    null;
  return candidate ? String(candidate) : null;
}

function looksLikeEnvKey(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[A-Z][A-Z0-9_]+$/.test(trimmed);
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function getToolStateLabel(state: ToolUIPart["state"]) {
  switch (state) {
    case "approval-requested":
      return "Behöver godkännande";
    case "input-streaming":
      return "Förbereder";
    case "input-available":
      return "Redo";
    case "output-available":
      return "Klart";
    case "output-error":
      return "Fel";
    case "output-denied":
      return "Nekad";
    case "approval-responded":
      return "Besvarad";
    default:
      return "Åtgärd";
  }
}

function openChatInV0(chatId: string | null) {
  if (!chatId) return;
  const url = `https://v0.app/chat/${encodeURIComponent(chatId)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function openIntegrationsPanel() {
  window.dispatchEvent(new CustomEvent("integrations-panel-open"));
}

function openProjectEnvVarsPanel(envKeys?: string[]) {
  const payload = Array.isArray(envKeys) && envKeys.length > 0 ? { envKeys } : undefined;
  window.dispatchEvent(new CustomEvent("project-env-vars-open", { detail: payload }));
}

type PostCheckSummary = {
  files: number | null;
  added: number | null;
  modified: number | null;
  removed: number | null;
  warnings: number | null;
  demoUrl: string | null;
  previousVersionId: string | null;
};

function getPostCheckSummary(output: unknown): PostCheckSummary | null {
  if (!output || typeof output !== "object") return null;
  const obj = output as Record<string, unknown>;
  const summary =
    obj.summary && typeof obj.summary === "object"
      ? (obj.summary as Record<string, unknown>)
      : null;
  const toNumber = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const toString = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  const warningsValue = summary?.warnings ?? obj.warnings;
  const warningsCount = Array.isArray(warningsValue)
    ? warningsValue.length
    : toNumber(warningsValue);

  const summaryData: PostCheckSummary = {
    files: toNumber(summary?.files ?? obj.files),
    added: toNumber(summary?.added ?? obj.added),
    modified: toNumber(summary?.modified ?? obj.modified),
    removed: toNumber(summary?.removed ?? obj.removed),
    warnings: warningsCount,
    demoUrl: toString(obj.demoUrl),
    previousVersionId: toString(obj.previousVersionId),
  };

  const hasAnyValue = Object.values(summaryData).some((value) => value !== null);
  return hasAnyValue ? summaryData : null;
}
