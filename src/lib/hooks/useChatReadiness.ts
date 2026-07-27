import { useRef } from "react";
import useSWR from "swr";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { pollJsonFetcher, swrRefreshIntervalMs } from "@/lib/hooks/poll-backoff";
import type { ChatReadiness } from "@/lib/chat-readiness";

type UseChatReadinessOptions = {
  isGenerating?: boolean;
  pauseWhileGenerating?: boolean;
  generatingRefreshIntervalMs?: number;
  idleRefreshIntervalMs?: number;
};

export function useChatReadiness(
  chatId: string | null,
  versionId: string | null,
  options: UseChatReadinessOptions = {},
) {
  const {
    isGenerating = false,
    pauseWhileGenerating = false,
    generatingRefreshIntervalMs = 15000,
    idleRefreshIntervalMs = 30000,
  } = options;
  const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
  const baseRefreshInterval =
    !versionId
      ? 0
      : pauseWhileGenerating && isGenerating
        ? 0
        : isGenerating
          ? generatingRefreshIntervalMs
          : idleRefreshIntervalMs;
  // A2: consecutive failures stretch the cadence instead of hammering a
  // starved endpoint at the healthy interval. Reset on the first success.
  const consecutiveErrorsRef = useRef(0);
  const lastErrorRef = useRef<unknown>(null);
  const { data, error, isLoading, mutate } = useSWR(
    chatId ? `${engineChatBaseUrl(chatId)}/readiness${query}` : null,
    pollJsonFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      onSuccess: () => {
        consecutiveErrorsRef.current = 0;
        lastErrorRef.current = null;
      },
      onError: (err: unknown) => {
        consecutiveErrorsRef.current += 1;
        lastErrorRef.current = err;
      },
      refreshInterval: (): number =>
        swrRefreshIntervalMs(
          baseRefreshInterval,
          consecutiveErrorsRef.current,
          lastErrorRef.current,
        ),
      dedupingInterval: 10000,
    },
  );

  const payload = data as { readiness?: ChatReadiness } | undefined;

  return {
    readiness: payload?.readiness ?? null,
    isLoading,
    isError: error,
    mutate,
  };
}
