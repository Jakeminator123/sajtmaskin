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
};

export function useChatReadiness(
  chatId: string | null,
  versionId: string | null,
  options: UseChatReadinessOptions = {},
) {
  const { isGenerating = false, pauseWhileGenerating = false } = options;
  const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
  const shouldPause = pauseWhileGenerating && isGenerating;
  const refreshInterval = !versionId || shouldPause ? 0 : 10000;
  const swrKey = chatId && versionId && !shouldPause
    ? `${engineChatBaseUrl(chatId)}/readiness${query}`
    : null;
  const { data, error, isLoading, mutate } = useSWR(
    swrKey,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval,
      dedupingInterval: 2000,
    },
  );

  return {
    readiness: (data?.readiness as ChatReadiness | undefined) ?? null,
    isLoading,
    isError: error,
    mutate,
  };
}
