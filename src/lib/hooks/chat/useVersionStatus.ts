"use client";

import { useEffect, useRef, useState } from "react";
import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import type { VersionStatus } from "@/lib/logging/event-bus-types";

/**
 * Read-only client view of the OMTAG-06 server-side `selectVersionStatus`
 * projection. Polls `/api/engine/chats/[chatId]/version-status` so the
 * builder UI can derive its display state from the **bus stream**
 * directly, instead of inferring it from the parallel DB-helper path
 * (`resolveEngineVersionDisplayStatus` in
 * `src/lib/db/engine-version-lifecycle.ts`).
 *
 * Migration note: as of område 6-2 the builder's status surfaces read
 * the bus instead of the legacy DB resolver — `BuilderShellContent` via
 * this hook (live polling of the active version), and `VersionHistory`
 * via the server-enriched `busStatus` field on `/versions`.
 * Single-writer-per-surface: each surface has exactly one status
 * channel, no "halvt byte" between the two.
 *
 * Polling cadence is intentionally light (default 4s) and stops when
 * the bus reports `phase: "done"` so a finished version doesn't
 * generate background traffic. Bumping `refreshNonce` forces an
 * immediate refetch from outside (e.g. after a user-triggered repair).
 */

const DEFAULT_POLL_INTERVAL_MS = 4_000;

type FetchResponseOk = { ok: true; versionId: string; status: VersionStatus };
type FetchResponseErr = { ok: false; error: string };

type FetchState = {
  status: VersionStatus | null;
  loading: boolean;
  error: string | null;
};

export function useVersionStatus(params: {
  chatId: string | null;
  versionId: string | null;
  /**
   * Override poll interval. Set to `0` to disable polling — the hook
   * still does an initial fetch when the params are present.
   */
  pollIntervalMs?: number;
  /**
   * Bump a counter from the parent to force-refresh outside the
   * polling cadence (e.g. after a repair-triggered button press).
   */
  refreshNonce?: number;
}): FetchState {
  const { chatId, versionId, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS, refreshNonce = 0 } = params;
  const [state, setState] = useState<FetchState>({
    status: null,
    loading: false,
    error: null,
  });

  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!chatId || !versionId) {
      lastKeyRef.current = null;
      return;
    }

    const key = `${chatId}:${versionId}:${refreshNonce}`;
    lastKeyRef.current = key;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled && lastKeyRef.current === key) {
        setState((prev) => ({ ...prev, loading: true, error: null }));
      }
    });

    const url = `${engineChatBaseUrl(chatId)}/version-status?versionId=${encodeURIComponent(versionId)}`;

    async function fetchOnce(): Promise<VersionStatus | null> {
      try {
        const res = await fetch(url, { cache: "no-store" });
        const data = (await res.json()) as FetchResponseOk | FetchResponseErr;
        if (!res.ok || data.ok !== true) {
          if (!cancelled && lastKeyRef.current === key) {
            const message = "error" in data ? data.error : `HTTP ${res.status}`;
            setState({ status: null, loading: false, error: message });
          }
          return null;
        }
        if (!cancelled && lastKeyRef.current === key) {
          setState({ status: data.status, loading: false, error: null });
        }
        return data.status;
      } catch (err) {
        if (!cancelled && lastKeyRef.current === key) {
          setState({
            status: null,
            loading: false,
            error: err instanceof Error ? err.message : "Network error",
          });
        }
        return null;
      }
    }

    let intervalId: number | undefined;

    const isTerminal = (s: VersionStatus | null): boolean =>
      s?.done === true || s?.phase === "failed";

    void fetchOnce().then((status) => {
      if (cancelled || lastKeyRef.current !== key) return;
      if (pollIntervalMs <= 0) return;
      // Stop polling on a terminal projection — saves bandwidth on
      // finished versions while leaving the last-fetched status in
      // state. `failed` is terminal too: a version that reached
      // build-error / verifier-failed without a `version.done` won't
      // resolve itself by re-polling, so we'd otherwise poll forever.
      if (isTerminal(status)) return;
      intervalId = window.setInterval(async () => {
        const next = await fetchOnce();
        if (isTerminal(next) && intervalId !== undefined) {
          window.clearInterval(intervalId);
          intervalId = undefined;
        }
      }, pollIntervalMs);
    });

    return () => {
      cancelled = true;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [chatId, versionId, pollIntervalMs, refreshNonce]);

  if (!chatId || !versionId) {
    return { status: null, loading: false, error: null };
  }
  return state;
}
