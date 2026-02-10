import useSWR from "swr";

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
}

/**
 * Hook to fetch and manage chat versions.
 * Polling is controlled by isGenerating:
 * - When generating: poll every 5s to show progress
 * - When idle: poll every 15s for reasonable sync
 */
export function useVersions(chatId: string | null, options: UseVersionsOptions = {}) {
  const { isGenerating = false, pauseWhileGenerating = false, enabled = true } = options;

  // Poll every 5s during generation, 15s when idle
  const refreshInterval = pauseWhileGenerating && isGenerating ? 0 : isGenerating ? 5000 : 15000;

  const { data, error, isLoading, mutate } = useSWR(
    enabled && chatId ? `/api/v0/chats/${chatId}/versions` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      refreshInterval,
      // Dedupe requests within 2 seconds
      dedupingInterval: 2000,
    },
  );

  return {
    versions: data?.versions || [],
    isLoading,
    isError: error,
    mutate,
  };
}
