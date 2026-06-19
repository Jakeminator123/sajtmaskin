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
 * Polling cadence is intentionally light (default 4s). It stops once the
 * projection is STABLE — `done` AND its `eventCount` unchanged vs the
 * previous fetch — rather than on the first `done`. The client
 * product-postcheck flow runs *after* finalize and can emit a late
 * `version.degraded`, so stopping on the first `done` would miss it and
 * render a degraded version as solid green (Finding A, område 6-3). A
 * `failed` phase still stops immediately. Bumping `refreshNonce` forces
 * an immediate refetch from outside (e.g. after a user-triggered repair).
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
  // Finding A (område 6-3): the `eventCount` from the immediately
  // preceding fetch. We only stop polling a `done` projection once this
  // count holds steady, so a late `version.degraded` (which bumps the
  // count) is always observed before polling ends. `null` = no prior
  // fetch yet for this key.
  const prevEventCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (!chatId || !versionId) {
      lastKeyRef.current = null;
      return;
    }

    const key = `${chatId}:${versionId}:${refreshNonce}`;
    lastKeyRef.current = key;
    // Fresh stability tracking for each (chat, version, refresh) key.
    prevEventCountRef.current = null;
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
    // Safety cap: stop after at most this many `done` confirmation polls
    // even if `eventCount` never settles, so a projection whose count
    // keeps changing can never poll forever. Stability is normally
    // reached within 1–2 polls.
    const MAX_DONE_CONFIRM_POLLS = 5;
    let doneConfirmPolls = 0;

    // Finding A (område 6-3): decide whether to stop polling after a
    // fetch. A `done: true` projection is NOT necessarily final — the
    // client post-check flow runs after finalize and may emit a late
    // `version.degraded` (product-postcheck skipped/crashed). Stopping on
    // the first `done` would miss that and show solid green for a degraded
    // version (the false-green the område 6/7 invariant forbids). So we
    // stop only once the projection is STABLE (`done` + `eventCount`
    // unchanged vs the previous fetch) — guaranteeing a late degradation,
    // which bumps `eventCount`, is observed first. `failed` is an
    // immediate hard-stop: a failed version must never be grace-polled
    // into looking green.
    const shouldStopPolling = (s: VersionStatus | null): boolean => {
      if (s?.phase === "failed") return true;

      const prev = prevEventCountRef.current;
      const current = s?.eventCount ?? null;
      prevEventCountRef.current = current;

      if (s?.done !== true) {
        // Still in-flight (or a transient fetch error → null): keep
        // polling and restart the done-confirmation window.
        doneConfirmPolls = 0;
        return false;
      }

      doneConfirmPolls += 1;
      // Stable: `done` AND no new event since the previous fetch.
      if (prev !== null && current === prev) return true;
      // First `done` fetch (no prior to compare) or a late event just
      // bumped the count → not stable yet; keep polling within the cap.
      return doneConfirmPolls >= MAX_DONE_CONFIRM_POLLS;
    };

    void fetchOnce().then((status) => {
      if (cancelled || lastKeyRef.current !== key) return;
      if (pollIntervalMs <= 0) return;
      if (shouldStopPolling(status)) return;
      intervalId = window.setInterval(async () => {
        const next = await fetchOnce();
        if (shouldStopPolling(next) && intervalId !== undefined) {
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
