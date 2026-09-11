"use client";

import {
  Conversation,
  ConversationContent,
  ConversationItem,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Sources, SourcesContent, SourcesTrigger, Source } from "@/components/ai-elements/sources";
import { Button } from "@/components/ui/button";
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
import { BuildPlanCard } from "@/components/builder/chat/BuildPlanCard";
import {
  CompactToolParts,
  StructuredToolParts,
  getLatestEnvRequirement as getLatestEnvRequirementFromTooling,
  getLatestPendingReply as getLatestPendingReplyFromTooling,
  hasUserMessageAfter as hasUserMessageAfterFromTooling,
  isActionableToolPart,
  buildAgentLogItems as buildAgentLogItemsFromTooling,
  getActiveAgentLogLabel,
} from "@/components/builder/BuilderMessageTooling";
import { openDossiersPanel } from "@/lib/builder/project-env-events";
import {
  F3_CONTINUATION_APPROVE_OPTION,
  F3_CONTINUATION_KIND,
} from "@/lib/gen/stream/f3-continuation";
import { GenerationSummary } from "@/components/builder/chat/GenerationSummary";
import { VersionFeedback } from "@/components/builder/chat/VersionFeedback";
import { Streamdown } from "streamdown";
import { STREAMDOWN_PLAIN_COMPONENTS } from "./message-markdown";
import { GenerationSurface } from "./GenerationSurface";
import { isGenerationReviewPart } from "./generation-surface-state";
import { code as streamdownCode } from "@streamdown/code";
import { toAIElementsFormat } from "@/lib/builder/message-adapter";
import type { MessagePart } from "@/lib/builder/message-adapter";
import {
  isAutoRepairPromptMessage,
  isF3KickPromptMessage,
  type ChatMessage,
} from "@/lib/builder/types";
import type { EngineVersionLifecycleStage } from "@/lib/db/engine-version-lifecycle";
import { ChevronDown, ChevronUp, Loader2, MessageSquare } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
  /**
   * True while a generation stream is running in this session. Gates the F3
   * auto-continue: a marker may only auto-approve after a stream has actually
   * run here (bugbot high på #460 — staged history hydration must never read
   * as "live" and burn credits on an unconfirmed integrations retry).
   */
  isStreaming?: boolean;
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
  isStreaming = false,
}: MessageListProps) => {
  const isIntegrations = lifecycleStage === "integrations";
  const messages = useMemo(() => externalMessages.map(toAIElementsFormat), [externalMessages]);
  const [pendingQuickReplyKey, setPendingQuickReplyKey] = useState<string | null>(null);
  // Owner beslut 2026-07-09: "Svar krävs för att fortsätta" ska ALDRIG vara
  // en blockerande dialog-overlay. Frågan renderas i stället inline i chatten
  // (samma mönster som F3-continuation nedan) och `pendingReplyBlockRef`
  // låter den flytande ankarknappen scrolla dit i stället för att öppna en
  // overlay. `firstPendingOptionRef` flyttar tangentbordsfokus till första
  // svarsalternativet när en NY fråga landar — tillgänglighetsersättning för
  // dialogens borttagna fokus-fälla.
  const pendingReplyBlockRef = useRef<HTMLDivElement | null>(null);
  const firstPendingOptionRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedPendingKeyRef = useRef<string | null>(null);
  const lastAutoOpenedEnvRequirementRef = useRef<string | null>(null);
  // Auto-continue plumbing for the F3-continuation marker (owner never wants
  // the "Svar krävs"-popup): any marker present in the FIRST non-empty
  // messages load is treated as reloaded history (never auto-fired); markers
  // that arrive LIVE after that auto-approve exactly once. The snapshot is
  // taken on the first non-empty load — not on mount — because the builder
  // fetches chat history asynchronously, so at mount `messages` is usually
  // still empty and a mount-time snapshot would misread reloaded history as
  // live. `undefined` = history snapshot not yet taken.
  const f3MountKeyRef = useRef<string | null | undefined>(undefined);
  const autoFiredF3KeyRef = useRef<string | null>(null);
  const [f3AutoContinueKey, setF3AutoContinueKey] = useState<string | null>(null);
  // Strong "live" signal (bugbot high på #460): staged hydration (cached
  // messages first, canonical server history — incl. an old marker — a beat
  // later) is indistinguishable from a live append by list shape alone. A
  // marker may therefore only auto-approve after a generation stream has
  // actually RUN in this session for this chat; reloads never stream before
  // the history lands, so late-hydrated old markers fall back to the inline
  // quick-replies instead of silently burning credits.
  const hasStreamedThisSessionRef = useRef(false);
  // Set when a generation stream ends on this chat (non-foreign). Consumed when
  // a NEW F3 marker arms the live gate — covers hydration lag where the marker
  // lands one tick after `isStreaming` clears (bugbot on A#2).
  const lastGenerationStreamEndRef = useRef(false);

  // Chat switch without remount: reset the auto-continue bookkeeping so a
  // marker in the NEXT chat's freshly loaded history is re-snapshotted as
  // history (and never mistaken for a live marker from the previous chat).
  //
  // Message restore is gated on `isAnyStreaming` (see usePersistedChatMessages),
  // so switching chats MID-STREAM keeps the PREVIOUS chat's streaming messages
  // mounted until that stream ends — meaning `isStreaming` here can still
  // describe the OLD chat for several renders after `chatId` flips. The old
  // `hasStreamedThisSessionRef.current = isStreaming` seeded the new chat's
  // "live" signal with that leftover `true`, letting a reloaded marker in the
  // new chat auto-fire and burn credits in the wrong chat. Fix: reset the
  // signal to `false` on switch, and — when a stream is still running at switch
  // time (it belongs to the previous chat) — defer crediting ANY stream to the
  // new chat until that foreign stream clears. `hasStreamedThisSessionRef` is
  // then armed below only once we are settled on this chat, so the per-render
  // `if (isStreaming)` can no longer re-arm it off the leaking foreign stream.
  const f3ChatIdRef = useRef(chatId);
  const f3AwaitingStreamSettleRef = useRef(false);
  const prevIsStreamingRef = useRef(isStreaming);
  if (f3ChatIdRef.current !== chatId) {
    f3ChatIdRef.current = chatId;
    f3MountKeyRef.current = undefined;
    autoFiredF3KeyRef.current = null;
    hasStreamedThisSessionRef.current = false;
    lastGenerationStreamEndRef.current = false;
    f3AwaitingStreamSettleRef.current = isStreaming;
    prevIsStreamingRef.current = isStreaming;
  }

  const sendQuickReply = useCallback(
    async (
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
    },
    [onQuickReply],
  );

  const pendingReply = useMemo(
    () => getLatestPendingReplyFromTooling(messages),
    [messages],
  );

  const tryArmF3LiveStreamGate = useCallback(
    (
      pending: ReturnType<typeof getLatestPendingReplyFromTooling> | null | undefined,
    ) => {
      const mountKey = f3MountKeyRef.current;
      if (!pending || pending.kind !== F3_CONTINUATION_KIND) return;
      if (mountKey === undefined || pending.key === mountKey) return;
      const parentVersionId = pending.parentVersionId?.trim() || null;
      const activeVersionId = versionId?.trim() || null;
      // Stale hydration after an unrelated follow-up: marker belongs to an older
      // design version than the one now active in the builder.
      if (parentVersionId && activeVersionId && parentVersionId !== activeVersionId) {
        return;
      }
      hasStreamedThisSessionRef.current = true;
      lastGenerationStreamEndRef.current = false;
    },
    [versionId],
  );

  // Arm the F3 "live stream" gate when a generation stream ENDS (with or without
  // the marker in the same render — hydration may lag). The live-vs-stale
  // discriminator is the MARKER itself (kind + key-not-at-mount +
  // parentVersionId === active version), NOT the prop `lifecycleStage`: a real
  // F3-continuation marker is only ever emitted by a tool-only/empty round that
  // creates NO new engine version, so `deployReadiness.lifecycleStage` stays
  // "design". Gating this on "integrations" therefore made live auto-continue
  // dead in prod (the gate could never be satisfied for an actual marker).
  useEffect(() => {
    if (f3AwaitingStreamSettleRef.current) {
      prevIsStreamingRef.current = isStreaming;
      // Foreign stream from the previous chat ended — never arm the new chat
      // off that transition (cross-chat credit-burn regression).
      if (!isStreaming) {
        f3AwaitingStreamSettleRef.current = false;
      }
      return;
    }
    const wasStreaming = prevIsStreamingRef.current;
    prevIsStreamingRef.current = isStreaming;
    if (!wasStreaming && isStreaming) {
      // A fresh stream started: close the previous stream-end window so a marker
      // can only ever be credited to THIS stream's end (avoids a sticky ref
      // arming an unrelated marker that hydrates much later).
      lastGenerationStreamEndRef.current = false;
    }
    if (wasStreaming && !isStreaming) {
      lastGenerationStreamEndRef.current = true;
      tryArmF3LiveStreamGate(getLatestPendingReplyFromTooling(messages));
    }
  }, [isStreaming, messages, tryArmF3LiveStreamGate]);

  // Marker arrived after stream-end (server restore / staged hydration beat).
  useEffect(() => {
    if (f3AwaitingStreamSettleRef.current) return;
    if (!lastGenerationStreamEndRef.current) return;
    tryArmF3LiveStreamGate(pendingReply);
  }, [pendingReply, tryArmF3LiveStreamGate]);

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

  const isF3Continuation = pendingReply?.kind === F3_CONTINUATION_KIND;

  // A11y: when a NEW pending question arrives (key change), move keyboard
  // focus to its first option button — once per question, so focus is never
  // re-stolen mid-typing on later re-renders. F3-continuation is excluded
  // (it auto-continues or renders calm inline replies).
  useEffect(() => {
    const key = pendingReply?.key ?? null;
    if (!key || isF3Continuation) {
      if (!key) lastFocusedPendingKeyRef.current = null;
      return;
    }
    if (lastFocusedPendingKeyRef.current === key) return;
    lastFocusedPendingKeyRef.current = key;
    firstPendingOptionRef.current?.focus();
  }, [pendingReply?.key, isF3Continuation]);

  // F3-continuation auto-approve (owner never wants the popup). A marker that
  // arrives LIVE (its key was not present at mount) auto-sends the approve
  // quick-reply exactly once; a marker already present at mount is reloaded
  // history and is left to the inline quick-replies. The server loop-breaker
  // caps repeats: round-3 closes terminally without a new marker, so at most
  // one auto-retry + one auto-loop-retry can fire.
  // NOTE: auto-approve consumes credits for the retry round — that is the
  // owner's explicit choice (see .cursor/plans/env-mock-dossier-flow).
  useEffect(() => {
    if (f3MountKeyRef.current === undefined) {
      // Take the history snapshot on the FIRST NON-EMPTY messages load (the
      // builder streams history in async — at mount the list is usually
      // empty). Whatever F3 marker exists in that first load is reloaded
      // history and must never be auto-fired.
      if (messages.length === 0) return;
      f3MountKeyRef.current =
        pendingReply?.kind === F3_CONTINUATION_KIND ? pendingReply.key : null;
    }
    if (!pendingReply || pendingReply.kind !== F3_CONTINUATION_KIND) return;
    const key = pendingReply.key;
    if (key === f3MountKeyRef.current) return; // reloaded marker → inline quick-replies
    // No stream has run in this session → the marker came from (possibly
    // staged) history hydration, not a live F3 round. Never auto-fire
    // (bugbot high på #460); the inline quick-replies render instead.
    if (!hasStreamedThisSessionRef.current) return;
    if (autoFiredF3KeyRef.current === key) return; // already auto-approved this marker
    if (!onQuickReply || quickReplyDisabled) return;
    autoFiredF3KeyRef.current = key;
    setF3AutoContinueKey(key);
    const approveIndex = Math.max(
      0,
      pendingReply.options.indexOf(F3_CONTINUATION_APPROVE_OPTION),
    );
    void sendQuickReply(
      pendingReply.messageId,
      approveIndex,
      F3_CONTINUATION_APPROVE_OPTION,
      { planMode: false },
    ).then(() => {
      // The auto-send has settled (VADE på PR #460). On success the
      // continuation stream has closed or produced a NEW marker (different
      // key), so clearing this key is a visual no-op. On failure — rejected
      // send OR a send that resolved without new content — this SAME marker
      // is still the latest pending reply: clearing the optimistic key drops
      // the perpetual spinner and lets the inline quick-replies render so the
      // user can continue manually. `autoFiredF3KeyRef` stays set on purpose:
      // no automatic retry loop. The `current === key`-guard avoids clobbering
      // a newer marker's spinner if the next F3 round already started.
      setF3AutoContinueKey((current) => (current === key ? null : current));
    });
  }, [messages, pendingReply, onQuickReply, quickReplyDisabled, sendQuickReply]);

  useEffect(() => {
    const requirement = latestEnvRequirement;
    if (!requirement) {
      lastAutoOpenedEnvRequirementRef.current = null;
      return;
    }
    // Byggblock-popovern är enda env-ytan (2026-07-22). Auto-öppning hålls
    // kvar till F3 så F2-chatten förblir tyst om env (env-flow-f2-mute).
    if (!isIntegrations) return;
    if (lastAutoOpenedEnvRequirementRef.current === requirement.key) return;
    lastAutoOpenedEnvRequirementRef.current = requirement.key;
    openDossiersPanel(requirement.envKeys);
  }, [latestEnvRequirement, isIntegrations]);

  const handlePendingReplyClick = async (option: string, optionIndex: number) => {
    if (!pendingReply) return;
    await sendQuickReply(pendingReply.messageId, optionIndex, option, {
      planMode: pendingReply.planMode,
    });
  };

  if (!chatId && messages.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center">
        <MessageSquare className="mb-3 h-10 w-10" />
        <p className="text-sm" suppressHydrationWarning>Ingen chat vald ännu</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center">
        <MessageSquare className="mb-3 h-10 w-10" />
        <p className="text-sm" suppressHydrationWarning>Inga meddelanden ännu</p>
      </div>
    );
  }

  return (
    <>
      {/* key={chatId}: remount the scroller per chat so anchor/scroll offset
          from the previous chat never leaks into the next one (messages can be
          swapped in place on chat switch without an empty intermediate state). */}
      <Conversation key={chatId ?? "no-chat"} className="h-full">
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
          const hasUserAfterCurrentMessage = hasUserMessageAfterFromTooling(messages, messageIndex);
          const compactToolParts = showStructuredParts
            ? []
            : toolParts.filter((part) => isActionableToolPart(part.tool) || isGenerationReviewPart(part));
          const reviewToolParts = compactToolParts.filter(isGenerationReviewPart);
          const actionToolParts = compactToolParts.filter((part) => !isGenerationReviewPart(part));
          const renderCompactTools = (parts: typeof compactToolParts) => parts.length > 0 ? (
            <CompactToolParts
              messageId={message.id}
              toolParts={parts}
              pendingReply={pendingReply}
              hasUserAfterCurrentMessage={hasUserAfterCurrentMessage}
              pendingQuickReplyKey={pendingQuickReplyKey}
              onQuickReply={sendQuickReply}
              quickReplyDisabled={quickReplyDisabled}
              lifecycleStage={lifecycleStage}
            />
          ) : null;
          const agentLogItems = showStructuredParts ? [] : buildAgentLogItemsFromTooling(toolParts);
          const measuredActiveAgentLogLabel = showStructuredParts || hasUserAfterCurrentMessage
            ? null
            : getActiveAgentLogLabel(toolParts, {
                includePipelineProgress: Boolean(message.isStreaming),
              });
          const latestFailedAgentLogLabel = message.isStreaming
            ? [...agentLogItems].reverse().find((item) => item.failed)?.label ?? null
            : null;
          const activeAgentLogLabel =
            measuredActiveAgentLogLabel ?? latestFailedAgentLogLabel;
          const currentTurnIsActive =
            !hasUserAfterCurrentMessage &&
            Boolean(message.isStreaming || activeAgentLogLabel);
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
          const hasVisibleTooling = toolParts.length > 0;
          const rawMessage = externalMessages[messageIndex];
          // Auto-repair prompts are a real "user" turn in the DB (see
          // isAutoRepairPromptMessage) but must never look like something the
          // user typed (Spår 03 Steg 4) — render them as a collapsed system
          // row instead of a user bubble.
          const isAutoRepairPrompt = Boolean(rawMessage && isAutoRepairPromptMessage(rawMessage));
          const isF3KickPrompt = Boolean(rawMessage && isF3KickPromptMessage(rawMessage));
          const isSyntheticSystemPrompt = isAutoRepairPrompt || isF3KickPrompt;
          const isRepairInProgress = Boolean(messages[messageIndex + 1]?.isStreaming);

          return (
            <ConversationItem
              key={message.id}
              messageId={message.id}
              scrollAnchor={message.role === "user"}
              liveScrollAnchor={
                message.role === "user" && isStreaming && !hasUserAfterCurrentMessage
              }
            >
              <Message from={isSyntheticSystemPrompt ? "system" : message.role}>
              <MessageContent className={message.role === "assistant" && !showStructuredParts ? "w-full max-w-full" : undefined}>
                {showStructuredParts && message.role === "assistant" && reasoningPart && (
                  <Reasoning isStreaming={Boolean(message.isStreaming && !textContent)}>
                    <ReasoningTrigger />
                    <ReasoningContent>
                      {/* OpenAI:s reasoning-summary kommer som markdown
                          (**rubriker**, stycken) och Anthropics thinking har
                          styckebrytningar — rå text kollapsade båda till en
                          klump med synliga asterisker. */}
                      <Streamdown
                        components={STREAMDOWN_PLAIN_COMPONENTS}
                        isAnimating={Boolean(message.isStreaming && !textContent)}
                      >
                        {reasoningPart.reasoning}
                      </Streamdown>
                    </ReasoningContent>
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
                  !showStructuredParts ? (
                    <GenerationSurface
                      content={textContent}
                      reasoning={reasoningPart?.reasoning}
                      isStreaming={Boolean(message.isStreaming)}
                      isActive={currentTurnIsActive}
                      activeLabel={activeAgentLogLabel}
                      awaitingReply={pendingReply?.messageId === message.id && f3AutoContinueKey !== pendingReply.key}
                      items={agentLogItems}
                      toolParts={toolParts}
                      reviews={renderCompactTools(reviewToolParts)}
                      actions={renderCompactTools(actionToolParts)}
                    />
                  ) : textContent ? (
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
                    <span className="text-muted-foreground text-sm">Startar own-engine-ström...</span>
                  ) : null
                ) : isAutoRepairPrompt ? (
                  <AutoRepairMessageRow content={textContent} isInProgress={isRepairInProgress} />
                ) : isF3KickPrompt ? (
                  <F3KickMessageRow content={textContent} />
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
            </ConversationItem>
          );
          })}

          {/* Owner beslut 2026-07-09: "Svar krävs" ska ALDRIG blockera med en
              dialog-overlay. Frågan renderas som SISTA elementet i
              konversationsflödet (inuti Conversation-scrollen, så den aldrig
              klipps av wrapperns overflow) och en icke-blockerande, flytande
              ankarknapp scrollar hit i stället för att öppna en overlay. */}
          {pendingReply && !isF3Continuation && (
            <ConversationItem messageId={`pending-reply-${pendingReply.key}`}>
            <div
              ref={pendingReplyBlockRef}
              className="mt-2 rounded-md border border-amber-500/60 bg-amber-500/10 p-3 text-xs"
              aria-live="polite"
            >
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-200">
                Svar krävs
              </p>
              <p className="text-foreground text-sm font-semibold">{pendingReply.question}</p>
              {pendingReply.options.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {pendingReply.options.map((option, optionIndex) => {
                    const replyKey = `${pendingReply.messageId}:${optionIndex}:${option}`;
                    const isPending = pendingQuickReplyKey === replyKey;
                    const canReply = Boolean(onQuickReply) && !quickReplyDisabled;
                    return (
                      <Button
                        key={replyKey}
                        ref={optionIndex === 0 ? firstPendingOptionRef : undefined}
                        size="sm"
                        variant="secondary"
                        disabled={!canReply || pendingQuickReplyKey !== null}
                        onClick={() => void handlePendingReplyClick(option, optionIndex)}
                      >
                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
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
            </ConversationItem>
          )}

          {/* F3-continuation: never a dialog. A live marker auto-continues with a
              calm status row; a reloaded marker shows inline quick-replies so the
              user can still choose (no auto-fire on old history). */}
          {pendingReply && isF3Continuation && (
            <ConversationItem messageId={`f3-continuation-${pendingReply.key}`}>
              {f3AutoContinueKey === pendingReply.key ? (
              <div
                className="text-muted-foreground bg-muted/40 mt-2 inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs"
                aria-live="polite"
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Integrationsbygget fortsätter automatiskt…</span>
              </div>
            ) : (
              <div className="border-border bg-card mt-2 rounded-md border p-3 text-xs">
                <p className="text-foreground text-sm font-semibold">{pendingReply.question}</p>
                {pendingReply.options.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
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
                          onClick={() => void handlePendingReplyClick(option, optionIndex)}
                        >
                          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          {option}
                        </Button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              )}
            </ConversationItem>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Flytande, icke-blockerande ankare: scrollar konversationen till
          frågan (blocket ligger INUTI scroll-containern, så scrollIntoView
          rullar Conversation-viewporten). */}
      {pendingReply && !isF3Continuation && (
        <Button
          type="button"
          variant="outline"
          className="fixed bottom-6 right-6 z-40 border-amber-500/60 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
          onClick={() =>
            pendingReplyBlockRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
          }
        >
          Svar krävs
        </Button>
      )}
    </>
  );
};

export const MessageList = memo(MessageListComponent);

/** The assistant surface owns repair progress; this row only identifies the
 * synthetic instruction, without a second spinner or guessed phase timer. */
function AutoRepairMessageRow({
  content,
  isInProgress,
}: {
  content: string;
  isInProgress: boolean;
}) {
  return (
    <SyntheticSystemPromptRow
      content={content}
      idleLabel={isInProgress ? "Automatisk reparation" : "Automatisk reparation kördes"}
    />
  );
}

/**
 * F3 auto-kick (M1): same collapsed system-row pattern as auto-repair.
 * The persisted content stays the synthetic prompt for F3-continuation
 * readers; only the visible copy is honest.
 */
function F3KickMessageRow({ content }: { content: string }) {
  return (
    <SyntheticSystemPromptRow
      content={content}
      idleLabel="Integrationsbygge startat utifrån den finaliserade designversionen."
    />
  );
}

function SyntheticSystemPromptRow({
  content,
  idleLabel,
}: {
  content: string;
  idleLabel: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const lineCount = content.split("\n").length;

  return (
    <div className="space-y-2">
      <div
        className="text-muted-foreground bg-muted/40 inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs"
        aria-live="polite"
      >
        <span>{idleLabel}</span>
      </div>
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
            Dölj den tekniska instruktionen
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsExpanded(true)}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
        >
          <ChevronDown className="h-3 w-3" />
          Visa den tekniska instruktionen ({lineCount} rader)
        </button>
      )}
    </div>
  );
}

/**
 * CollapsibleUserMessage - Truncates long user messages (especially shadcn/ui block prompts)
 * Shows first few lines with expand button for long technical messages.
 */
function CollapsibleUserMessage({ content }: { content: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const lineCount = content.split("\n").length;
  const charCount = content.length;

  // Check if this is a long technical message (shadcn block prompt pattern)
  const isTechnicalPrompt = content.includes("---") && content.includes("Registry files");

  // Only collapse if message is long (>500 chars or >10 lines) and contains technical content
  const shouldCollapse = isTechnicalPrompt && (charCount > 500 || lineCount > 10);

  if (!shouldCollapse) {
    // Declutter: a normal user prompt is echoed back only as a compact,
    // lighter bubble (smaller padding + text) so the chat keeps the
    // conversational record without a bulky blue block dominating the panel.
    return (
      <MessageResponse className="px-3 py-1.5 text-xs group-data-[role=user]:bg-brand-blue/85">
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
