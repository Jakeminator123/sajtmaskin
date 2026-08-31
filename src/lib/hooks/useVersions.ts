import { useCallback, useEffect, useMemo, useRef } from "react";
import useSWR from "swr";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import {
  createPollErrorRetry,
  pollJsonFetcher,
  swrRefreshIntervalMs,
} from "@/lib/hooks/poll-backoff";

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
 * Aktivitets-burst (prod-observation 2026-08-31): buildern kändes "piggare"
 * med versions-panelen öppen — panelen råkar polla var 15:e sekund medan
 * grundcadensen är 60 s, så statusbyten (promoted/superseded/degraded) nådde
 * UI:t upp till en minut senare utan den. Konvergensen ska inte bero på
 * vilken panel som råkar vara öppen: efter att en generering avslutats eller
 * någon versionsrad bytt tillstånd pollas det snabbt i ett begränsat fönster,
 * därefter gäller viloläget igen. Fönstret är avsiktligt kort — permanent
 * 15 s-polling för varje öppen builder-flik vore ren serverlast.
 */
export const VERSIONS_ACTIVITY_BURST_WINDOW_MS = 3 * 60_000;
export const VERSIONS_ACTIVITY_BURST_INTERVAL_MS = 15_000;

/** Stabil radsignatur: ändras när en version tillkommer eller byter tillstånd. */
function versionsFingerprint(latest: unknown): string {
  const payload = latest as { versions?: unknown[] } | undefined;
  const rows = Array.isArray(payload?.versions) ? payload.versions : [];
  return rows
    .map((row) => {
      const r = (row ?? {}) as Record<string, unknown>;
      const id = r.id ?? r.versionId ?? "";
      return `${String(id)}:${String(r.verificationState ?? "")}:${String(r.releaseState ?? "")}`;
    })
    .join("|");
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

  // A2: consecutive failures stretch the cadence instead of hammering a
  // starved endpoint at the healthy interval. Reset on the first success.
  const consecutiveErrorsRef = useRef(0);
  const lastErrorRef = useRef<unknown>(null);
  // Aktivitets-burst: senaste tidpunkt då något faktiskt hände (generering
  // avslutades eller en versionsrad bytte tillstånd). 0 = ingen aktivitet än,
  // så en nyöppnad gammal chatt startar i viloläge, inte i burst.
  const lastActivityAtRef = useRef(0);
  const versionsFingerprintRef = useRef<string | null>(null);
  const prevIsGeneratingRef = useRef(isGenerating);

  useEffect(() => {
    // Generering → klar är exakt ögonblicket då promoted/superseded/degraded
    // börjar trilla in server-side; öppna burstfönstret då.
    if (prevIsGeneratingRef.current && !isGenerating) {
      lastActivityAtRef.current = Date.now();
    }
    prevIsGeneratingRef.current = isGenerating;
  }, [isGenerating]);
  // Polling cadence is decided per-tick based on the most recent payload's
  // `chatStatus`, not just the caller's `isGenerating` hint. This is what stops
  // the "polling forever on a versionless dead chat" bug — once the server
  // reports status=aborted+!hasVersion, the interval drops to 0 (off).
  //
  // Memoised because SWR keeps `refreshInterval` in its polling effect's
  // dependency list: a new identity per render restarts the timer before it
  // elapses, so a re-rendering builder would stop polling entirely.
  const resolveRefreshInterval = useCallback(
    (latest: unknown): number => {
      const chatStatus = (latest as { chatStatus?: ChatRunStatus } | undefined)?.chatStatus ?? null;
      if (shouldStopPolling(chatStatus)) return 0;
      if (pauseWhileGenerating && isGenerating) return 0;
      // Refs läses per tick — identiteten på callbacken påverkas inte (SWR
      // river annars polling-timern på varje re-render, se swr-poll-config).
      const withinBurst =
        lastActivityAtRef.current > 0 &&
        Date.now() - lastActivityAtRef.current < VERSIONS_ACTIVITY_BURST_WINDOW_MS;
      const base = isGenerating
        ? generatingRefreshIntervalMs
        : withinBurst
          ? Math.min(VERSIONS_ACTIVITY_BURST_INTERVAL_MS, idleRefreshIntervalMs)
          : idleRefreshIntervalMs;
      return swrRefreshIntervalMs(base, consecutiveErrorsRef.current, lastErrorRef.current);
    },
    [isGenerating, pauseWhileGenerating, generatingRefreshIntervalMs, idleRefreshIntervalMs],
  );
  // SWR skips interval-driven revalidation while the cache holds an error and
  // uses this lane instead, so the backoff (and the server's `Retry-After`)
  // has to be applied here to have any effect after a degraded 503.
  const onErrorRetry = useMemo(
    () => createPollErrorRetry(isGenerating ? generatingRefreshIntervalMs : idleRefreshIntervalMs),
    [isGenerating, generatingRefreshIntervalMs, idleRefreshIntervalMs],
  );
  const { data, error, isLoading, mutate } = useSWR(
    enabled && chatId ? `${engineChatBaseUrl(chatId)}/versions` : null,
    pollJsonFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      onSuccess: (latest: unknown) => {
        consecutiveErrorsRef.current = 0;
        lastErrorRef.current = null;
        // Radbyte (ny version eller nytt verifierings-/release-tillstånd)
        // öppnar burstfönstret. Första lyckade hämtningen sätter bara
        // baslinjen — en nyladdad sida ska inte bursta på gammal historik.
        const fingerprint = versionsFingerprint(latest);
        if (
          versionsFingerprintRef.current !== null &&
          versionsFingerprintRef.current !== fingerprint
        ) {
          lastActivityAtRef.current = Date.now();
        }
        versionsFingerprintRef.current = fingerprint;
      },
      onError: (err: unknown) => {
        consecutiveErrorsRef.current += 1;
        lastErrorRef.current = err;
      },
      refreshInterval: resolveRefreshInterval,
      onErrorRetry,
      // Keep repeated UI triggers from stampeding the same endpoint.
      dedupingInterval: 10000,
    },
  );

  const payload = data as
    | { versions?: unknown[]; chatStatus?: ChatRunStatus }
    | undefined;
  const chatStatus: ChatRunStatus | null = payload?.chatStatus ?? null;

  return {
    versions: payload?.versions || [],
    chatStatus,
    isLoading,
    isError: error,
    mutate,
  };
}
