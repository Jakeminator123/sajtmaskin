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
              const contentTail = accumulatedContent.trim().slice(-300);
              const looksLikeQuestion =
                contentTail &&
                (contentTail.slice(-25).includes("?") || contentTail.length <= 100);
              const questionPreview = looksLikeQuestion
                ? contentTail
                : "AI väntar på ditt svar. Läs meddelandet ovan och svara i chatten.";
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
                  toolName: "Awaiting input",
                  toolCallId: `awaiting-input:${assistantMessageId}`,
                  state: "approval-requested",
                  output: {
                    question: questionPreview,
                    chatId: nextId,
                    messageId:
                      doneData.messageId ||
                      doneData.message_id ||
                      (doneData.latestVersion as Record<string, unknown> | undefined)?.messageId ||
                      null,
                    awaitingInput: true,
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
                    content:
                      "Jag behöver ditt svar på en följdfråga innan nästa preview kan genereras.",
                  };
                }),
              );
              toast("AI väntar på ditt svar för att fortsätta.");
            }

            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMessageId ? { ...m, isStreaming: false } : m)),
            );
            if (ctx.streamType === "create") {
              toast.success("Chat created!");
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
