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
 * Status of the chat's most recent generation/repair pass. Mirrors the
 * server-side `chatStatus` payload returned by GET /versions (see
 * `src/app/api/engine/chats/[chatId]/versions/route.ts`). Statuses follow
 * `generation-log-writer.resolveStatusDetails`.
 */
export type ChatRunStatus = {
  status:
    | "done"
    | "in_progress"
    | "aborted"
    | "failed"
    | "error_signal"
    | "awaiting_input"
    | "partial_file_output"
    | "empty_generation"
    | string;
  statusReason: string | null;
  hasVersion: boolean;
  updatedAt: string | null;
};

// P0 stream-abort recovery (2026-04-26). Polling stops the moment the
// chat reaches a transport-aborted state with no version. Failed runs
// (verifier rejected real content) are NOT in this set — the UI may still
// offer "repair" against the failed version. `done` doesn't need to be
// here because we cap polling via the idle interval anyway.
const POLLING_STOP_STATUSES = new Set(["aborted"]);

function shouldStopPolling(chatStatus: ChatRunStatus | null | undefined): boolean {
  if (!chatStatus) return false;
  if (chatStatus.hasVersion) return false;
  return POLLING_STOP_STATUSES.has(chatStatus.status);
}

/**
 * Hook to fetch and manage chat versions.
 * Polling is controlled by isGenerating:
 * - When generating: poll every 10s to show progress
 * - When idle: poll every 60s to reduce background churn
 * - When chat is aborted and versionless: polling stops entirely (P0)
 */
export function useVersions(chatId: string | null, options: UseVersionsOptions = {}) {
  const {
    isGenerating = false,
    pauseWhileGenerating = false,
    enabled = true,
    generatingRefreshIntervalMs = 10000,
    idleRefreshIntervalMs = 60000,
  } = options;

  const { data, error, isLoading, mutate } = useSWR(
    enabled && chatId ? `${engineChatBaseUrl(chatId)}/versions` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      // Polling cadence is decided per-tick based on the most recent
      // payload's `chatStatus`, not just the caller's `isGenerating` hint.
      // This is what stops the "polling forever on a versionless dead
      // chat" bug — once the server reports status=aborted+!hasVersion,
      // refreshInterval drops to 0 (off) on the next tick.
      refreshInterval: (latest) => {
        const chatStatus = (latest as { chatStatus?: ChatRunStatus } | undefined)?.chatStatus ?? null;
        if (shouldStopPolling(chatStatus)) return 0;
        if (pauseWhileGenerating && isGenerating) return 0;
        return isGenerating ? generatingRefreshIntervalMs : idleRefreshIntervalMs;
      },
      // Keep repeated UI triggers from stampeding the same endpoint.
      dedupingInterval: 10000,
    },
  );

  const chatStatus: ChatRunStatus | null = (data?.chatStatus as ChatRunStatus | undefined) ?? null;

  return {
    versions: data?.versions || [],
    chatStatus,
    isLoading,
    isError: error,
    mutate,
  };
}
