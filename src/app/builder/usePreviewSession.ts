"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPreviewStatus } from "@/lib/builder/preview-session/api";
import { logPreviewLifecycleTelemetry } from "@/lib/gen/preview/lifecycle-telemetry";
import { isTier2LivePreviewUrl, normalizePreviewUrl } from "@/lib/gen/preview/preview-url-classifier";
import type { VersionMismatchOverlayPayload } from "@/lib/gen/preview/preview-host-client";

export type UsePreviewSessionParams = {
  chatId: string | null;
  activeVersionId: string | null;
  currentPreviewUrl: string | null;
  activePreviewSessionMeta: { previewSessionId: string; versionId: string } | null;
  setCurrentPreviewUrl: (url: string) => void;
  bumpPreviewRefreshToken: () => void;
  setPreviewSessionRecovering: (v: boolean) => void;
  previewBootstrapDoneKeysRef: MutableRefObject<Set<string>>;
  setForcedPreviewRestartKey: (key: string | null) => void;
  setPreviewBootstrapRetryNonce: Dispatch<SetStateAction<number>>;
  onRecoverFailed?: (params: {
    chatId: string;
    versionId: string;
    reason: "max_attempts" | "status_unavailable";
  }) => void;
  /**
   * Overridable clock for tests. `Date.now` in production. Lets the
   * mismatch-payload `msSinceMismatch` be deterministic in vitest.
   */
  now?: () => number;
};

/**
 * Server-driven preview session checks: status fetch, URL resync, recover bootstrap.
 *
 * Also owns the `versionMismatchPayload` state surfaced to the preview
 * iframe via `<VersionMismatchOverlay>`. The server already emits
 * `status: "version_mismatch"` from `/api/engine/chats/[chatId]/preview-status`
 * when the active VM session is bound to a different versionId than the
 * one the user has selected — this hook just observes that signal during
 * the existing reactive recover-suspect cycle and translates it into the
 * overlay payload contract. No extra polling loop.
 */
export function usePreviewSession(params: UsePreviewSessionParams) {
  const {
    chatId,
    activeVersionId,
    currentPreviewUrl,
    activePreviewSessionMeta,
    setCurrentPreviewUrl,
    bumpPreviewRefreshToken,
    setPreviewSessionRecovering,
    previewBootstrapDoneKeysRef,
    setForcedPreviewRestartKey,
    setPreviewBootstrapRetryNonce,
    onRecoverFailed,
    now: nowParam,
  } = params;

  const now: () => number = nowParam ?? (() => Date.now());

  const lastPreviewRecoverAtRef = useRef(0);
  const previewRecoverAttemptsRef = useRef(0);
  const statusUnavailableCountRef = useRef(0);
  // First moment we observed status==="version_mismatch" for the current
  // (chatId, expectedVersionId) pair. Used to compute `msSinceMismatch`
  // in the overlay payload. Reset whenever the active version changes so
  // a stale pin from a prior mismatch can't carry over.
  const mismatchObservedAtRef = useRef<number | null>(null);
  const [versionMismatchPayload, setVersionMismatchPayload] =
    useState<VersionMismatchOverlayPayload | null>(null);

  useEffect(() => {
    previewRecoverAttemptsRef.current = 0;
    statusUnavailableCountRef.current = 0;
    lastPreviewRecoverAtRef.current = 0;
    mismatchObservedAtRef.current = null;
    setVersionMismatchPayload(null);
  }, [chatId, activeVersionId]);

  const handlePreviewSessionSuspect = useCallback(async () => {
    const versionId = activeVersionId;
    if (!chatId || !versionId) return;
    const demo = normalizePreviewUrl(currentPreviewUrl);
    if (!demo || !isTier2LivePreviewUrl(demo)) return;

    const tNow = now();
    if (tNow - lastPreviewRecoverAtRef.current < 12_000) return;
    lastPreviewRecoverAtRef.current = tNow;

    const statusPayload = await fetchPreviewStatus({
      chatId,
      versionId,
      previewSessionId: activePreviewSessionMeta?.previewSessionId ?? null,
    });
    if (!statusPayload) {
      statusUnavailableCountRef.current += 1;
      logPreviewLifecycleTelemetry({
        kind: "recover",
        phase: "failed",
        chatId,
        versionId,
        detail: "status_unavailable",
      });
      if (statusUnavailableCountRef.current >= 3) {
        setPreviewSessionRecovering(false);
        onRecoverFailed?.({
          chatId,
          versionId,
          reason: "status_unavailable",
        });
      }
      return;
    }
    statusUnavailableCountRef.current = 0;

    if (statusPayload.status === "starting") {
      logPreviewLifecycleTelemetry({
        kind: "preview_status",
        chatId,
        versionId,
        status: "starting",
      });
      return;
    }

    if (statusPayload.status === "version_mismatch") {
      // Server says the active VM session is bound to a different versionId
      // than the one the user has selected (typical: app finalized a new
      // version, VM is still booting/running the previous one). Surface
      // as overlay payload so the iframe doesn't sit white for the ~5–10s
      // restart window without explanation.
      const observedAt = mismatchObservedAtRef.current ?? now();
      mismatchObservedAtRef.current = observedAt;
      const payload: VersionMismatchOverlayPayload = {
        chatId,
        expectedVersionId: versionId,
        currentVersionId: statusPayload.versionId ?? null,
        msSinceMismatch: Math.max(0, now() - observedAt),
      };
      setVersionMismatchPayload(payload);
      return;
    }

    if (statusPayload.status === "running") {
      // Mismatch resolved (server now reports a running session bound to
      // *this* version) — drop the overlay and reset the observation
      // anchor so a future mismatch starts a fresh `msSinceMismatch`.
      const serverVid = statusPayload.versionId ?? null;
      if (serverVid && serverVid === versionId) {
        if (mismatchObservedAtRef.current !== null) {
          mismatchObservedAtRef.current = null;
          setVersionMismatchPayload(null);
        }
      }
      const serverUrl = statusPayload.previewUrl?.trim() ?? "";
      if (serverUrl) {
        const cur = normalizePreviewUrl(currentPreviewUrl);
        const next = normalizePreviewUrl(serverUrl);
        if (next && next !== cur) {
          logPreviewLifecycleTelemetry({
            kind: "preview_url_resync",
            chatId,
            versionId,
            detail: "status_running_mismatch",
          });
          setCurrentPreviewUrl(serverUrl);
          bumpPreviewRefreshToken();
        }
      }
      return;
    }

    if (previewRecoverAttemptsRef.current >= 5) {
      logPreviewLifecycleTelemetry({
        kind: "recover",
        phase: "failed",
        chatId,
        versionId,
        detail: "max_attempts",
      });
      setPreviewSessionRecovering(false);
      onRecoverFailed?.({
        chatId,
        versionId,
        reason: "max_attempts",
      });
      return;
    }
    previewRecoverAttemptsRef.current += 1;

    logPreviewLifecycleTelemetry({
      kind: "recover",
      phase: "started",
      chatId,
      versionId,
      detail: statusPayload.status,
    });

    setPreviewSessionRecovering(true);
    const key = `${chatId}:${versionId}`;
    previewBootstrapDoneKeysRef.current.delete(key);
    setForcedPreviewRestartKey(key);
    setPreviewBootstrapRetryNonce((n) => n + 1);
  }, [
    chatId,
    activeVersionId,
    activePreviewSessionMeta,
    currentPreviewUrl,
    setCurrentPreviewUrl,
    bumpPreviewRefreshToken,
    setPreviewSessionRecovering,
    previewBootstrapDoneKeysRef,
    setForcedPreviewRestartKey,
    setPreviewBootstrapRetryNonce,
    onRecoverFailed,
    now,
  ]);

  const resetRecoverAttempts = useCallback(() => {
    previewRecoverAttemptsRef.current = 0;
    statusUnavailableCountRef.current = 0;
  }, []);

  return { handlePreviewSessionSuspect, resetRecoverAttempts, versionMismatchPayload };
}
