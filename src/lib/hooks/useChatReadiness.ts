import useSWR from "swr";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import type { ChatReadiness } from "@/lib/chat-readiness";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = (err && (err.error || err.message)) || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return res.json();
};

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
  const refreshInterval =
    !versionId
      ? 0
      : pauseWhileGenerating && isGenerating
        ? 0
        : isGenerating
          ? generatingRefreshIntervalMs
          : idleRefreshIntervalMs;
  const { data, error, isLoading, mutate } = useSWR(
    chatId ? `${engineChatBaseUrl(chatId)}/readiness${query}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval,
      dedupingInterval: 10000,
    },
  );

  return {
    readiness: (data?.readiness as ChatReadiness | undefined) ?? null,
    isLoading,
    isError: error,
    mutate,
  };
}
