import { consumeSseResponse } from "@/lib/builder/sse";
import { isPromptAssistOff, resolvePromptAssistProvider } from "@/lib/builder/promptAssist";
import type { AutoFixPayload, SetMessages, StreamQualitySignal } from "./types";
import { toast } from "sonner";
import {
  appendModelInfoPart,
  appendToolPartToMessage,
  buildStreamErrorMessage,
  coerceIntegrationSignals,
  coerceUiParts,
  finalizeStreamStats,
  initStreamStats,
  integrationSignalToToolPart,
  mergeStreamingText,
  mergeUiParts,
  recordStreamParts,
  recordStreamText,
} from "./helpers";
import { runPostGenerationChecks, triggerImageMaterialization } from "./post-checks";

export type StreamContext = {
  streamType: "create" | "send";
  assistantMessageId: string;
  selectedModelTier: string;
  chatId: string | null;
  setMessages: SetMessages;
  touchStreamSafetyTimer: () => void;

  setChatId?: (id: string | null) => void;
  chatIdParam?: string | null;
  buildBuilderParams?: (entries: Record<string, string | null | undefined>) => URLSearchParams;
  router?: { replace: (href: string) => void };
  appProjectId?: string | null;
  pendingCreateKeyRef?: React.MutableRefObject<string | null>;
  onV0ProjectId?: (projectId: string) => void;

  setCurrentDemoUrl: (url: string | null) => void;
  onPreviewRefresh?: () => void;
  onGenerationComplete?: (data: { chatId: string; versionId?: string; demoUrl?: string }) => void;
  mutateVersions: () => void;
  enableImageMaterialization: boolean;
  autoFixHandlerRef: React.MutableRefObject<(payload: AutoFixPayload) => void>;
  promptAssistModel?: string | null;
  promptAssistDeep?: boolean;
};

import { updateCreateChatLockChatId } from "./helpers";

export async function handleSseStream(
  response: Response,
  ctx: StreamContext,
  signal: AbortSignal,
): Promise<{ streamQuality: StreamQualitySignal; chatIdFromStream: string | null }> {
  let chatIdFromStream: string | null = null;
  let versionIdFromStream: string | null = null;
  let v0ProjectIdFromStream: string | null = null;
  let accumulatedThinking = "";
  let accumulatedContent = "";
  let progressivePreviewFired = false;
  let didReceiveDone = false;
  const postCheckQueue: Array<{ chatId: string; versionId: string; demoUrl?: string | null }> = [];
  const materializeQueue: Array<{ chatId: string; versionId: string }> = [];
  let streamQuality: StreamQualitySignal = { hasCriticalAnomaly: false, reasons: [] };
  const streamStats = initStreamStats(ctx.streamType, ctx.assistantMessageId);

  const {
    assistantMessageId,
    selectedModelTier,
    setMessages,
    touchStreamSafetyTimer,
    setChatId,
    chatIdParam,
    buildBuilderParams,
    router,
    appProjectId,
    pendingCreateKeyRef,
    onV0ProjectId,
    setCurrentDemoUrl,
    onPreviewRefresh,
    onGenerationComplete,
    mutateVersions,
    enableImageMaterialization,
    autoFixHandlerRef,
  } = ctx;

  const effectiveChatId = ctx.chatId;

  try {
    await consumeSseResponse(
      response,
      (event, data) => {
        touchStreamSafetyTimer();
        switch (event) {
          case "meta": {
            const meta = typeof data === "object" && data ? (data as Record<string, unknown>) : {};
            const paModel = ctx.promptAssistModel ?? null;
            appendModelInfoPart(setMessages, assistantMessageId, {
              modelId: (meta.modelId as string) ?? selectedModelTier,
              modelTier:
                (typeof meta.modelTier === "string" && meta.modelTier) || selectedModelTier || null,
              thinking: typeof meta.thinking === "boolean" ? meta.thinking : null,
              imageGenerations:
                typeof meta.imageGenerations === "boolean" ? meta.imageGenerations : null,
              chatPrivacy: typeof meta.chatPrivacy === "string" ? meta.chatPrivacy : null,
              promptAssistProvider: paModel
                ? (isPromptAssistOff(paModel) ? "off" : resolvePromptAssistProvider(paModel))
                : null,
              promptAssistModel: paModel,
              promptAssistDeep: ctx.promptAssistDeep ?? null,
              scaffoldId: typeof meta.scaffoldId === "string" ? meta.scaffoldId : null,
              scaffoldFamily: typeof meta.scaffoldFamily === "string" ? meta.scaffoldFamily : null,
              scaffoldLabel: typeof meta.scaffoldLabel === "string" ? meta.scaffoldLabel : null,
              capabilities: meta.capabilities && typeof meta.capabilities === "object" ? meta.capabilities as Record<string, boolean> : null,
            });

            if (!chatIdFromStream && typeof meta.chatId === "string" && meta.chatId) {
              const id = meta.chatId;
              chatIdFromStream = id;
              setChatId?.(id);
              if (chatIdParam !== id && buildBuilderParams && router) {
                const params = buildBuilderParams({
                  chatId: id,
                  project: appProjectId ?? undefined,
                });
                router.replace(`/builder?${params.toString()}`);
              }
              if (pendingCreateKeyRef?.current) {
                updateCreateChatLockChatId(pendingCreateKeyRef.current, id);
              }
            }
            if (!versionIdFromStream && typeof meta.versionId === "string" && meta.versionId) {
              versionIdFromStream = meta.versionId;
            }
            break;
          }
          case "thinking": {
            const thinkingText =
              typeof data === "string"
                ? data
                : (data as Record<string, unknown>)?.text ||
                  (data as Record<string, unknown>)?.thinking ||
                  (data as Record<string, unknown>)?.reasoning ||
                  null;
            if (thinkingText) {
              const incoming = String(thinkingText);
              const previous = accumulatedThinking;
              const mergedThought = mergeStreamingText(previous, incoming);
              recordStreamText(streamStats, "thinking", previous, mergedThought, incoming.length);
              if (mergedThought !== accumulatedThinking) {
                accumulatedThinking = mergedThought;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, thinking: accumulatedThinking, isStreaming: true }
                      : m,
                  ),
                );
              }
            }
            break;
          }
          case "content": {
            const contentText =
              typeof data === "string"
                ? data
                : (data as Record<string, unknown>)?.content ||
                  (data as Record<string, unknown>)?.text ||
                  (data as Record<string, unknown>)?.delta ||
                  null;
            if (contentText) {
              const incoming = String(contentText);
              const previous = accumulatedContent;
              const merged = mergeStreamingText(previous, incoming);
              recordStreamText(streamStats, "content", previous, merged, incoming.length);
              accumulatedContent = merged;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, content: accumulatedContent, isStreaming: true }
                    : m,
                ),
              );

              if (!progressivePreviewFired && accumulatedContent.includes("\n```\n")) {
                const fileBlockCount = (accumulatedContent.match(/```\w+\s+file="[^"]+"/g) || []).length;
                const closedBlockCount = (accumulatedContent.match(/\n```\n/g) || []).length;
                if (fileBlockCount >= 2 && closedBlockCount >= 2) {
                  progressivePreviewFired = true;
                  onPreviewRefresh?.();
                }
              }
            }
            break;
          }
          case "parts": {
            const nextParts = coerceUiParts(data);
            if (nextParts.length > 0) {
              recordStreamParts(streamStats, nextParts.length);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, uiParts: mergeUiParts(m.uiParts, nextParts), isStreaming: true }
                    : m,
                ),
              );
            }
            break;
          }
          case "integration": {
            const signals = coerceIntegrationSignals(data);
            if (signals.length > 0) {
              const integrationParts = signals.map((s, i) =>
                integrationSignalToToolPart(s, `${assistantMessageId}:${i}`),
              );
              recordStreamParts(streamStats, integrationParts.length);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        uiParts: mergeUiParts(m.uiParts, integrationParts),
                        isStreaming: true,
                      }
                    : m,
                ),
              );
            }
            break;
          }
          case "tool-call": {
            const toolData = typeof data === "object" && data ? (data as Record<string, unknown>) : {};
            const toolName = typeof toolData.toolName === "string" ? toolData.toolName : "";
            const toolCallId = typeof toolData.toolCallId === "string"
              ? toolData.toolCallId
              : `tool-${Date.now()}`;
            const toolArgs = (toolData.args as Record<string, unknown>) ?? {};

            if (toolName === "askClarifyingQuestion") {
              const questionText = typeof toolArgs.question === "string" ? toolArgs.question : "";
              const options = Array.isArray(toolArgs.options) ? (toolArgs.options as string[]) : [];
              const part = {
                type: "tool:awaiting-input",
                toolName: "Klargörande fråga",
                toolCallId,
                state: "approval-requested",
                output: {
                  question: questionText,
                  options: options.length > 0 ? options : undefined,
                  kind: typeof toolArgs.kind === "string" ? toolArgs.kind : "unclear",
                  awaitingInput: true,
                },
              } as Parameters<typeof appendToolPartToMessage>[2];
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, uiParts: mergeUiParts(m.uiParts, [part]) }
                    : m,
                ),
              );
            } else if (toolName === "emitPlanArtifact") {
              const planPart = {
                type: "plan" as const,
                plan: {
                  title: (typeof toolArgs.goal === "string" ? toolArgs.goal : "Plan") as string,
                  description: Array.isArray(toolArgs.scope)
                    ? (toolArgs.scope as string[]).join(", ")
                    : "",
                  steps: Array.isArray(toolArgs.steps)
                    ? (toolArgs.steps as Array<Record<string, unknown>>).map((s) => ({
                        title: String(s.title ?? ""),
                        description: String(s.description ?? ""),
                        status: String(s.phase ?? "build"),
                      }))
                    : [],
                  raw: toolArgs,
                },
              };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, uiParts: mergeUiParts(m.uiParts, [planPart]) }
                    : m,
                ),
              );
            }
            break;
          }
          case "progress": {
            const progressData = typeof data === "object" && data ? (data as Record<string, unknown>) : {};
            const step = typeof progressData.step === "string" ? progressData.step : "";
            const phase = typeof progressData.phase === "string" ? progressData.phase : "";
            if (step && phase) {
              const progressPart = {
                type: `tool:engine-${step}` as const,
                toolName: step === "autofix" ? "Autofix" : step === "validation" ? "Validering" : step,
                toolCallId: `progress:${step}:${Date.now()}`,
                state: phase === "passed" ? "output-available" : phase === "error" || phase === "gave-up" ? "output-error" : "input-streaming",
                output: progressData,
              } as Parameters<typeof appendToolPartToMessage>[2];
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, uiParts: mergeUiParts(m.uiParts, [progressPart]) }
                    : m,
                ),
              );
            }
            break;
          }
          case "chatId": {
            const nextChatId =
              typeof data === "string"
                ? data
                : (data as Record<string, unknown>)?.id ||
                  (data as Record<string, unknown>)?.chatId ||
                  null;
            if (nextChatId && !chatIdFromStream) {
              const id = String(nextChatId);
              chatIdFromStream = id;
              streamStats.chatId = id;
              setChatId?.(id);
              if (chatIdParam !== id && buildBuilderParams && router) {
                const params = buildBuilderParams({
                  chatId: id,
                  project: appProjectId ?? undefined,
                });
                router.replace(`/builder?${params.toString()}`);
              }
              if (pendingCreateKeyRef?.current) {
                updateCreateChatLockChatId(pendingCreateKeyRef.current, id);
              }
            }
            break;
          }
          case "projectId": {
            const nextV0ProjectId =
              typeof data === "string"
                ? data
                : (data as Record<string, unknown>)?.v0ProjectId ||
                  (data as Record<string, unknown>)?.v0_project_id ||
                  null;
            if (nextV0ProjectId && !v0ProjectIdFromStream) {
              const id = String(nextV0ProjectId);
              v0ProjectIdFromStream = id;
              onV0ProjectId?.(id);
            }
            break;
          }
          case "done": {
            didReceiveDone = true;
            streamStats.didReceiveDone = true;
            const doneData =
              typeof data === "object" && data ? (data as Record<string, unknown>) : {};
            const doneV0ProjectId = doneData.v0ProjectId || doneData.v0_project_id || null;
            if (doneV0ProjectId && !v0ProjectIdFromStream) {
              v0ProjectIdFromStream = String(doneV0ProjectId);
              onV0ProjectId?.(v0ProjectIdFromStream);
            }
            if (doneData.demoUrl) {
              setCurrentDemoUrl(doneData.demoUrl as string);
            }
            onPreviewRefresh?.();
            const resolvedChatId =
              doneData.chatId || doneData.id || chatIdFromStream || effectiveChatId || null;
            const resolvedVersionId =
              doneData.versionId ||
              doneData.version_id ||
              (doneData.latestVersion as Record<string, unknown> | undefined)?.id ||
              (doneData.latestVersion as Record<string, unknown> | undefined)?.versionId ||
              versionIdFromStream ||
              null;
            const awaitingInput = Boolean(doneData.awaitingInput);

            if (!resolvedChatId) {
              throw new Error("No chat ID returned from stream");
            }
            const nextId = String(resolvedChatId);
            streamStats.chatId = nextId;
            streamStats.versionId = resolvedVersionId ? String(resolvedVersionId) : null;

            if (!chatIdFromStream && setChatId) {
              chatIdFromStream = nextId;
              setChatId(nextId);
              if (chatIdParam !== nextId && buildBuilderParams && router) {
                const params = buildBuilderParams({
                  chatId: nextId,
                  project: appProjectId ?? undefined,
                });
                router.replace(`/builder?${params.toString()}`);
              }
            }
            if (pendingCreateKeyRef?.current) {
              updateCreateChatLockChatId(pendingCreateKeyRef.current, nextId);
            }

            if (awaitingInput) {
              const planBlockers = (() => {
                const pa = doneData.planArtifact as Record<string, unknown> | undefined;
                if (!pa || !Array.isArray(pa.blockers)) return null;
                const arr = pa.blockers as Array<Record<string, unknown>>;
                return arr.length > 0 ? arr : null;
              })();

              const questionPreview = (() => {
                if (planBlockers) {
                  return planBlockers
                    .map((b) => String(b.question ?? ""))
                    .filter(Boolean)
                    .join("\n") || "Planen kräver dina svar för att fortsätta.";
                }
                const contentTail = accumulatedContent.trim().slice(-300);
                const looksLikeQuestion =
                  contentTail &&
                  (contentTail.slice(-25).includes("?") || contentTail.length <= 100);
                return looksLikeQuestion
                  ? contentTail
                  : "AI väntar på ditt svar. Läs meddelandet ovan och svara i chatten.";
              })();

              const quickOptions = planBlockers
                ? planBlockers.flatMap((b) =>
                    Array.isArray(b.options)
                      ? (b.options as string[]).slice(0, 4)
                      : [],
                  )
                : [];

              setMessages((prev) => {
                const assistantMsg = prev.find((m) => m.id === assistantMessageId);
                const hasApprovalRequested = (assistantMsg?.uiParts ?? []).some(
                  (p) =>
                    (p as { state?: string; type?: string }).state === "approval-requested" ||
                    (p as { type?: string }).type === "tool:awaiting-input",
                );
                if (hasApprovalRequested) return prev;
                const part = {
                  type: "tool:awaiting-input",
                  toolName: planBlockers ? "Plan: svar krävs" : "Awaiting input",
                  toolCallId: `awaiting-input:${assistantMessageId}`,
                  state: "approval-requested",
                  output: {
                    question: questionPreview,
                    options: quickOptions.length > 0 ? quickOptions : undefined,
                    chatId: nextId,
                    messageId:
                      doneData.messageId ||
                      doneData.message_id ||
                      (doneData.latestVersion as Record<string, unknown> | undefined)?.messageId ||
                      null,
                    awaitingInput: true,
                    planBlockers: planBlockers ?? undefined,
                  },
                } as Parameters<typeof appendToolPartToMessage>[2];
                return prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, uiParts: mergeUiParts(m.uiParts, [part]) }
                    : m,
                );
              });
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantMessageId || (m.content || "").trim()) return m;
                  return {
                    ...m,
                    content: planBlockers
                      ? "Planen innehåller frågor som måste besvaras innan byggfasen kan starta."
                      : "Jag behöver ditt svar på en följdfråga innan nästa preview kan genereras.",
                  };
                }),
              );
              toast(planBlockers ? "Planen kräver dina svar." : "AI väntar på ditt svar för att fortsätta.");
            }

            const planArtifact = doneData.planArtifact as Record<string, unknown> | undefined;
            if (planArtifact && typeof planArtifact === "object") {
              const planPart = {
                type: "plan" as const,
                plan: {
                  title: (typeof planArtifact.goal === "string" ? planArtifact.goal : "Plan") as string,
                  description: Array.isArray(planArtifact.scope)
                    ? (planArtifact.scope as string[]).join(", ")
                    : "",
                  steps: Array.isArray(planArtifact.steps)
                    ? (planArtifact.steps as Array<Record<string, unknown>>).map((s) => ({
                        title: String(s.title ?? ""),
                        description: String(s.description ?? ""),
                        status: String(s.phase ?? "build"),
                      }))
                    : [],
                  blockers: Array.isArray(planArtifact.blockers) ? planArtifact.blockers : [],
                  assumptions: Array.isArray(planArtifact.assumptions) ? planArtifact.assumptions : [],
                  raw: planArtifact,
                },
              };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, uiParts: mergeUiParts(m.uiParts, [planPart]) }
                    : m,
                ),
              );
            }

            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m)),
            );
            if (ctx.streamType === "create") {
              toast.success(planArtifact ? "Plan skapad!" : "Chat created!");
            }
            mutateVersions();
            onGenerationComplete?.({
              chatId: nextId,
              versionId: resolvedVersionId ? String(resolvedVersionId) : undefined,
              demoUrl: doneData.demoUrl as string | undefined,
            });
            if (resolvedChatId && resolvedVersionId) {
              materializeQueue.push({
                chatId: String(resolvedChatId),
                versionId: String(resolvedVersionId),
              });
              postCheckQueue.push({
                chatId: String(resolvedChatId),
                versionId: String(resolvedVersionId),
                demoUrl: (doneData.demoUrl as string) ?? null,
              });
            }
            break;
          }
          case "error": {
            const errorData =
              typeof data === "object" && data
                ? (data as Record<string, unknown>)
                : { message: data };
            throw new Error(buildStreamErrorMessage(errorData));
          }
        }
      },
      { signal },
    );
  } finally {
    streamStats.chatId = streamStats.chatId ?? chatIdFromStream ?? effectiveChatId ?? null;
    streamStats.didReceiveDone = streamStats.didReceiveDone || didReceiveDone;
    streamQuality = finalizeStreamStats(streamStats);
  }

  if (!didReceiveDone) {
    throw new Error("Stream ended before completion. Please retry the prompt.");
  }
  if (ctx.streamType === "create" && !chatIdFromStream) {
    throw new Error("No chat ID returned from stream");
  }

  setMessages((prev) => {
    const msg = prev.find((m) => m.id === assistantMessageId);
    if (!msg?.isStreaming) return prev;
    return prev.map((m) =>
      m.id === assistantMessageId ? { ...m, isStreaming: false } : m,
    );
  });

  const latestMaterialize =
    materializeQueue.length > 0 ? materializeQueue[materializeQueue.length - 1] : null;
  if (latestMaterialize) {
    void triggerImageMaterialization({
      chatId: latestMaterialize.chatId,
      versionId: latestMaterialize.versionId,
      enabled: enableImageMaterialization,
    });
  }

  const latestPostCheck =
    postCheckQueue.length > 0 ? postCheckQueue[postCheckQueue.length - 1] : null;
  if (latestPostCheck) {
    void runPostGenerationChecks({
      chatId: latestPostCheck.chatId,
      versionId: latestPostCheck.versionId,
      demoUrl: latestPostCheck.demoUrl ?? null,
      assistantMessageId,
      setMessages,
      streamQuality,
      onAutoFix: (payload) => autoFixHandlerRef.current(payload),
    });
  }

  return { streamQuality, chatIdFromStream };
}
