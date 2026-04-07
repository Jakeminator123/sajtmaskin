import useSWR from "swr";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = (err && (err.error || err.message)) || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return res.json();
};

interface UseVersionsOptions {
  /** Enable frequent polling (e.g., during generation). Default: false */
  isGenerating?: boolean;
  /** Pause polling entirely while generating (relies on SSE + mutate). */
  pauseWhileGenerating?: boolean;
  /** Set to false to disable fetching entirely (e.g. when data comes from parent). Default: true */
  enabled?: boolean;
  /** Polling interval while generating in ms. Default: 10000 */
  generatingRefreshIntervalMs?: number;
  /** Polling interval while idle in ms. Default: 60000 */
  idleRefreshIntervalMs?: number;
}

/**
 * Hook to fetch and manage chat versions.
 * Polling is controlled by isGenerating:
 * - When generating: poll every 10s to show progress
 * - When idle: poll every 60s to reduce background churn
 */
export function useVersions(chatId: string | null, options: UseVersionsOptions = {}) {
  const {
    isGenerating = false,
    pauseWhileGenerating = false,
    enabled = true,
    generatingRefreshIntervalMs = 10000,
    idleRefreshIntervalMs = 60000,
  } = options;

  // Poll every 10s during generation, 60s when idle
  const refreshInterval =
    pauseWhileGenerating && isGenerating
      ? 0
      : isGenerating
        ? generatingRefreshIntervalMs
        : idleRefreshIntervalMs;

  const { data, error, isLoading, mutate } = useSWR(
    enabled && chatId ? `${engineChatBaseUrl(chatId)}/versions` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval,
      // Keep repeated UI triggers from stampeding the same endpoint.
      dedupingInterval: 10000,
    },
  );

  return {
    versions: data?.versions || [],
    isLoading,
    isError: error,
    mutate,
  };
}
