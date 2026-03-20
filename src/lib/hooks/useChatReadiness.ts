import { useCallback, useEffect } from "react";
import useSWR from "swr";
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

export const READINESS_INVALIDATE_EVENT = "sajtmaskin:readiness-invalidate";

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
  const paused = !versionId || (pauseWhileGenerating && isGenerating);

  const { data, error, isLoading, mutate } = useSWR(
    chatId ? `/api/v0/chats/${chatId}/readiness${query}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval: paused ? 0 : 10_000,
      dedupingInterval: 2000,
    },
  );

  const resolvedReadiness = (data?.readiness as ChatReadiness | undefined) ?? null;

  const invalidate = useCallback(() => {
    mutate();
  }, [mutate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => invalidate();
    window.addEventListener(READINESS_INVALIDATE_EVENT, handler);
    return () => window.removeEventListener(READINESS_INVALIDATE_EVENT, handler);
  }, [invalidate]);

  return {
    readiness: resolvedReadiness,
    isLoading,
    isError: error,
    mutate,
    invalidate,
  };
}
