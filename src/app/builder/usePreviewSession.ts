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
  /**
   * M#pv3: active version is terminally failed and has no own stored preview URL.
   * In this state we suppress the first auto-resync on `version_mismatch`
   * (session_newer) to avoid bounce-loops back to the failed version.
   */
  activeVersionFailedWithoutPreviewUrl?: boolean;
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
    activeVersionFailedWithoutPreviewUrl = false,
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

  const now = useCallback(
    () => (typeof nowParam === "function" ? nowParam() : Date.now()),
    [nowParam],
  );

  const lastPreviewRecoverAtRef = useRef(0);
  const previewRecoverAttemptsRef = useRef(0);
  const statusUnavailableCountRef = useRef(0);
  // First moment we observed status==="version_mismatch" for the current
  // (chatId, expectedVersionId) pair. Used to compute `msSinceMismatch`
  // in the overlay payload. Reset whenever the active version changes so
  // a stale pin from a prior mismatch can't carry over.
  const mismatchObservedAtRef = useRef<number | null>(null);
  // Loop-skydd (fas 4): en auto-resync per unik `${versionId}:${previewSessionId}`.
  // Nyckeln inkluderar den STALE preview-sessionens id så att en genuint ny
  // session (efter en forced restart) tillåts auto-resynca igen, medan SAMMA
  // fastnade session bara triggar ETT automatiskt försök innan overlay-fallback.
  const autoResyncAttemptsRef = useRef<Set<string>>(new Set());
  const [versionMismatchPayload, setVersionMismatchPayload] =
    useState<VersionMismatchOverlayPayload | null>(null);

  useEffect(() => {
    previewRecoverAttemptsRef.current = 0;
    statusUnavailableCountRef.current = 0;
    lastPreviewRecoverAtRef.current = 0;
    mismatchObservedAtRef.current = null;
    autoResyncAttemptsRef.current.clear();
  }, [chatId, activeVersionId]);

  const effectiveVersionMismatchPayload =
    versionMismatchPayload &&
    versionMismatchPayload.chatId === chatId &&
    versionMismatchPayload.expectedVersionId === activeVersionId
      ? versionMismatchPayload
      : null;

  // Delad forced-restart-primitiv (samma väg som `missing`/`stopped` och
  // env-restart): markera bootstrap-nyckeln som ej-klar, sätt forced key och
  // bumpa retry-nonce så `useBuilderVmPreview` POST:ar `/preview-session`
  // med `forceRestart:true` för den angivna versionen.
  const triggerForcedPreviewRestart = useCallback(
    (versionId: string) => {
      if (!chatId || !versionId) return;
      const key = `${chatId}:${versionId}`;
      setPreviewSessionRecovering(true);
      previewBootstrapDoneKeysRef.current.delete(key);
      setForcedPreviewRestartKey(key);
      setPreviewBootstrapRetryNonce((n) => n + 1);
    },
    [
      chatId,
      setPreviewSessionRecovering,
      previewBootstrapDoneKeysRef,
      setForcedPreviewRestartKey,
      setPreviewBootstrapRetryNonce,
    ],
  );

  // Explicit/manuell resync (overlay-knappen "Försök igen" + restore-flödet).
  // Bypassar auto-resync-loopskyddet: rensar attempt-nycklarna för versionen så
  // att en genuint ny stale-session kan auto-resynca igen, och tvingar en
  // omstart direkt. `versionIdOverride` används av restore (ny versionId hinner
  // ev. inte bli aktiv än); annars gäller aktiv version.
  const forcePreviewResync = useCallback(
    (versionIdOverride?: string) => {
      const vid = (versionIdOverride ?? activeVersionId ?? "").trim();
      if (!chatId || !vid) return;
      for (const k of [...autoResyncAttemptsRef.current]) {
        if (k.startsWith(`${vid}:`)) autoResyncAttemptsRef.current.delete(k);
      }
      mismatchObservedAtRef.current = null;
      setVersionMismatchPayload(null);
      logPreviewLifecycleTelemetry({
        kind: "recover",
        phase: "started",
        chatId,
        versionId: vid,
        detail: "manual_force_resync",
      });
      triggerForcedPreviewRestart(vid);
    },
    [chatId, activeVersionId, triggerForcedPreviewRestart],
  );

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
      const shouldSuppressAutoResyncBounce =
        activeVersionFailedWithoutPreviewUrl &&
        statusPayload.mismatchDirection === "session_newer";
      if (shouldSuppressAutoResyncBounce) {
        // M#pv3: failed version without own preview URL should not steal back
        // the VM session from a restored newer version.
        const observedAt = mismatchObservedAtRef.current ?? now();
        mismatchObservedAtRef.current = observedAt;
        const payload: VersionMismatchOverlayPayload = {
          chatId,
          expectedVersionId: versionId,
          currentVersionId: statusPayload.versionId ?? null,
          mismatchDirection: statusPayload.mismatchDirection ?? "unknown",
          msSinceMismatch: Math.max(0, now() - observedAt),
        };
        setVersionMismatchPayload(payload);
        return;
      }

      // Server says the active VM session is bound to a different versionId
      // than the one the user has selected (typical: app finalized/restored a
      // new version, VM is still booting/running the previous one).
      //
      // Fas 4: auto-resynca i stället för att bara visa overlay. Ett (1)
      // automatiskt forced-restart-försök per unik `${versionId}:${sessionId}`
      // (loop-skydd). Vid fortsatt mismatch faller vi tillbaka på dagens
      // overlay med manuell "Försök igen" (som via `forcePreviewResync`
      // bypassar loopskyddet). 12s-debouncen ovan garanterar dessutom att
      // försöken aldrig blir en restart-storm.
      const staleSessionId = statusPayload.previewSessionId ?? "unknown";
      const attemptKey = `${versionId}:${staleSessionId}`;
      if (!autoResyncAttemptsRef.current.has(attemptKey)) {
        autoResyncAttemptsRef.current.add(attemptKey);
        mismatchObservedAtRef.current = null;
        setVersionMismatchPayload(null);
        logPreviewLifecycleTelemetry({
          kind: "recover",
          phase: "started",
          chatId,
          versionId,
          detail: "version_mismatch_auto_resync",
        });
        triggerForcedPreviewRestart(versionId);
        return;
      }
      // Auto-resync redan förbrukat för denna (version, stale-session) →
      // visa overlay så användaren kan tvinga omstart manuellt.
      const observedAt = mismatchObservedAtRef.current ?? now();
      mismatchObservedAtRef.current = observedAt;
      const payload: VersionMismatchOverlayPayload = {
        chatId,
        expectedVersionId: versionId,
        currentVersionId: statusPayload.versionId ?? null,
        mismatchDirection: statusPayload.mismatchDirection ?? "unknown",
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

    triggerForcedPreviewRestart(versionId);
  }, [
    chatId,
    activeVersionId,
    activePreviewSessionMeta,
    currentPreviewUrl,
    setCurrentPreviewUrl,
    bumpPreviewRefreshToken,
    setPreviewSessionRecovering,
    triggerForcedPreviewRestart,
    onRecoverFailed,
    activeVersionFailedWithoutPreviewUrl,
    now,
  ]);

  const resetRecoverAttempts = useCallback(() => {
    previewRecoverAttemptsRef.current = 0;
    statusUnavailableCountRef.current = 0;
  }, []);

  return {
    handlePreviewSessionSuspect,
    forcePreviewResync,
    resetRecoverAttempts,
    versionMismatchPayload: effectiveVersionMismatchPayload,
  };
}
