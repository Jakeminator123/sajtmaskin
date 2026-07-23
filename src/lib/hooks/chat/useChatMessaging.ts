import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { warnLog } from "@/lib/utils/debug";
import { STREAM_SAFETY_TIMEOUT_DEFAULT_MS } from "./constants";
import type {
  AutoFixPayload,
  ChatMessagingParams,
  ChatMessagingReturn,
  MessageOptions,
} from "./types";
import { clearCreateChatLock } from "./helpers";
import { useCreateChat } from "./useCreateChat";
import { useSendMessage } from "./useSendMessage";
import { useAutoFix } from "./useAutoFix";

/**
 * Shared chat messaging hook — handles both the own engine (OpenAI direct)
 * and the v0 Platform API fallback.
 */
export function useChatMessaging(params: ChatMessagingParams): ChatMessagingReturn {
  const { chatId, setMessages } = params;

  // Live ref to the active chatId so a scheduled autofix can verify the user
  // hasn't switched chats before it streams (see useAutoFix getActiveChatId).
  const activeChatIdRef = useRef<string | null | undefined>(chatId);
  useEffect(() => {
    activeChatIdRef.current = chatId;
  }, [chatId]);
  const getActiveChatId = useCallback(() => activeChatIdRef.current, []);

  const streamAbortRef = useRef<AbortController | null>(null);
  const lastSentSystemPromptRef = useRef<string | null>(null);
  const autoFixHandlerRef = useRef<(payload: AutoFixPayload) => void>(() => {});
  const activeStreamTimeoutMsRef = useRef<number>(STREAM_SAFETY_TIMEOUT_DEFAULT_MS);
  const streamingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const touchStreamSafetyTimer = useCallback(
    (timeoutMs?: number) => {
      const resolvedTimeoutMs = timeoutMs ?? activeStreamTimeoutMsRef.current;
      if (streamingTimerRef.current) clearTimeout(streamingTimerRef.current);
      streamingTimerRef.current = setTimeout(() => {
        streamingTimerRef.current = null;
        warnLog("v0", "Stream safety timeout reached — force-clearing isStreaming");
        streamAbortRef.current?.abort();
        toast.error("Genereringen tog för lång tid. Försök igen eller kör reparera preview.", {
          duration: 8000,
        });
        setMessages((prev) =>
          prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
        );
      }, resolvedTimeoutMs);
    },
    [setMessages],
  );

  const startStreamSafetyTimer = useCallback(
    (timeoutMs?: number) => {
      activeStreamTimeoutMsRef.current = timeoutMs ?? STREAM_SAFETY_TIMEOUT_DEFAULT_MS;
      touchStreamSafetyTimer(activeStreamTimeoutMsRef.current);
    },
    [touchStreamSafetyTimer],
  );

  const clearStreamSafetyTimer = useCallback(() => {
    if (streamingTimerRef.current) {
      clearTimeout(streamingTimerRef.current);
      streamingTimerRef.current = null;
    }
    activeStreamTimeoutMsRef.current = STREAM_SAFETY_TIMEOUT_DEFAULT_MS;
  }, []);

  useEffect(() => {
    if (!chatId) {
      lastSentSystemPromptRef.current = null;
    }
  }, [chatId]);

  const buildBuilderParams = useCallback(
    (entries: Record<string, string | null | undefined>) => {
      const p = new URLSearchParams();
      Object.entries(entries).forEach(([key, value]) => {
        if (value) p.set(key, value);
      });
      if (params.buildIntent) p.set("buildIntent", params.buildIntent);
      if (params.buildMethod) p.set("buildMethod", params.buildMethod);
      return p;
    },
    [params.buildIntent, params.buildMethod],
  );

  const sharedDeps = {
    streamAbortRef,
    autoFixHandlerRef,
    lastSentSystemPromptRef,
    startStreamSafetyTimer,
    touchStreamSafetyTimer: touchStreamSafetyTimer as () => void,
    clearStreamSafetyTimer,
  };

  const {
    isCreatingChat,
    createNewChat,
    pendingCreateKeyRef,
    createChatInFlightRef,
    setIsCreatingChat,
  } = useCreateChat(params, { buildBuilderParams, ...sharedDeps });

  const { sendMessage: sendMessageRaw } = useSendMessage(params, { createNewChat, ...sharedDeps });

  // Fast-edit robustness (2026-07-23): a queued client autofix must never
  // collide with a generation the user just started. Two shared signals:
  //   - `generationActiveRef` is true for the whole lifetime of a send
  //     (fetch + SSE stream). useAutoFix consults it before scheduling AND
  //     right before firing, because an autofix `sendMessage` would abort the
  //     in-flight stream via `streamAbortRef` — the "versionen hoppar när jag
  //     editerar snabbt" failure mode.
  //   - a USER-initiated send cancels any still-pending scheduled autofix:
  //     the fix targeted a version the new generation supersedes anyway.
  const generationActiveRef = useRef(false);
  const cancelPendingAutoFixRef = useRef<() => void>(() => {});

  const sendMessage = useCallback(
    async (messageText: string, options: MessageOptions = {}) => {
      const isAutofixSend = options.promptSourceMeta?.sourceKind === "autofix";
      if (!isAutofixSend) {
        cancelPendingAutoFixRef.current();
      }
      generationActiveRef.current = true;
      try {
        await sendMessageRaw(messageText, options);
      } finally {
        generationActiveRef.current = false;
      }
    },
    [sendMessageRaw],
  );

  const isGenerationActive = useCallback(() => generationActiveRef.current, []);

  const { autoFixHandlerRef: resolvedAutoFixRef, cancelPendingAutoFix } = useAutoFix(
    sendMessage,
    getActiveChatId,
    isGenerationActive,
  );
  useEffect(() => {
    autoFixHandlerRef.current = resolvedAutoFixRef.current;
  });
  useEffect(() => {
    cancelPendingAutoFixRef.current = cancelPendingAutoFix;
  }, [cancelPendingAutoFix]);

  const cancelActiveGeneration = useCallback(() => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    generationActiveRef.current = false;
    // The user explicitly stopped — a queued autofix for the stopped/previous
    // version must not sneak in afterwards.
    cancelPendingAutoFixRef.current();
    clearStreamSafetyTimer();
    pendingCreateKeyRef.current = null;
    clearCreateChatLock();
    createChatInFlightRef.current = false;
    setIsCreatingChat(false);
    setMessages((prev) =>
      prev.map((message) =>
        message.isStreaming ? { ...message, isStreaming: false } : message,
      ),
    );
  }, [
    clearStreamSafetyTimer,
    setMessages,
    pendingCreateKeyRef,
    createChatInFlightRef,
    setIsCreatingChat,
  ]);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      clearStreamSafetyTimer();
    };
  }, [clearStreamSafetyTimer]);

  return { isCreatingChat, createNewChat, sendMessage, cancelActiveGeneration };
}
