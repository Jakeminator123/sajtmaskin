import { useCallback, useEffect, useRef } from "react";
import { warnLog } from "@/lib/utils/debug";
import { STREAM_SAFETY_TIMEOUT_DEFAULT_MS } from "./constants";
import type { AutoFixPayload, V0ChatMessagingParams, V0ChatMessagingReturn } from "./types";
import { clearCreateChatLock } from "./helpers";
import { useCreateChat } from "./useCreateChat";
import { useSendMessage } from "./useSendMessage";
import { useAutoFix } from "./useAutoFix";

export function useV0ChatMessaging(params: V0ChatMessagingParams): V0ChatMessagingReturn {
  const { chatId, setMessages } = params;

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
        setMessages((prev) => {
          const timeoutNotice =
            "Varning: Stream timeout nåddes innan ett stabilt slut kom tillbaka. Försök igen eller kör reparera preview.";
          return prev.map((m) => {
            if (!m.isStreaming) return m;
            const content = m.content || "";
            if (content.includes("Stream timeout")) {
              return { ...m, isStreaming: false };
            }
            const nextContent = content.trim() ? `${content}\n\n${timeoutNotice}` : timeoutNotice;
            return { ...m, content: nextContent, isStreaming: false };
          });
        });
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

  const { sendMessage } = useSendMessage(params, { createNewChat, ...sharedDeps });

  const { autoFixHandlerRef: resolvedAutoFixRef } = useAutoFix(sendMessage);
  useEffect(() => {
    autoFixHandlerRef.current = resolvedAutoFixRef.current;
  });

  const cancelActiveGeneration = useCallback(() => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
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
