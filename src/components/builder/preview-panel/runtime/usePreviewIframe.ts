"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { fetchPreviewStatus } from "@/lib/builder/preview-session/api";
import { describePreviewDiagnosticCode } from "@/lib/gen/preview/diagnostics";
import {
  isSameTier2PreviewSession,
  isTier2LivePreviewUrl,
} from "@/lib/gen/preview/preview-url-classifier";
import { detectOwnEnginePreviewIssue, type PreviewIssuePayload } from "./iframe-diagnostics";

const PREVIEW_READY_TIMEOUT_MS = 45_000;
const PREVIEW_READY_POLL_MS = 250;
// Match the preview host's 4s starting-page refresh and leave ample room in
// the shared 60 requests/minute preview-status bucket (including other tabs
// and the bounded recovery window that can run after a timeout).
const TIER2_STATUS_POLL_MS = 4_000;
// `/preview-status` legally reports `starting` for a 90s boot grace. Allow two
// complete poll intervals beyond that boundary before failing closed.
const TIER2_LOAD_TIMEOUT_MS = 90_000 + TIER2_STATUS_POLL_MS * 2;
// A matching running receipt starts a same-src reload. That reload has its own
// bounded recovery window and must not inherit the nearly-expired boot timer.
const TIER2_READY_RELOAD_TIMEOUT_MS = 15_000;
// The normal timeout still reports the suspect session to the controller. A
// short, read-only status window then gives that exact session time to finish
// starting without creating another restart loop or an unbounded poller.
const TIER2_LATE_RECOVERY_WINDOW_MS = 30_000;
// After the 30s late-recovery window the red banner can still sit on a
// healthy site (prod 2026-08-31, chat 47607bca): Fly finished after both
// the 98s boot deadline and the 30s tail. Keep a sparse, read-only poll
// (~12s) so a later matching running receipt can reuse ready-reload.
// 12s ≈ 5 req/min from this tab; together with the 4s boot/late polls
// and other tabs this stays inside the shared 60 req/min bucket.
const TIER2_SELF_HEAL_POLL_MS = 12_000;
// The boot-deadline's final status check must itself be bounded: a hung
// /preview-status request may otherwise suppress the failure state forever.
const TIER2_FINAL_CHECK_TIMEOUT_MS = 5_000;

export function usePreviewIframe(params: {
  previewUrl: string | null;
  refreshToken?: number;
  chatId: string | null;
  versionId: string | null;
  activePreviewSessionId?: string | null;
  /** Exact rendered host lifecycle; undefined means identity is not hydrated yet. */
  activePreviewLifecycleToken: string | null | undefined;
  isOwnEnginePreview: boolean;
  onPreviewSessionSuspect?: () => void;
  reportOwnEngineRenderFailure: (payload: PreviewIssuePayload) => void;
  /** When set, this ref is used for the iframe element instead of an internal ref (shared with telemetry). */
  iframeRef?: MutableRefObject<HTMLIFrameElement | null>;
}) {
  const {
    previewUrl,
    refreshToken,
    chatId,
    versionId,
    activePreviewSessionId,
    activePreviewLifecycleToken,
    isOwnEnginePreview,
    onPreviewSessionSuspect,
    reportOwnEngineRenderFailure,
    iframeRef: externalIframeRef,
  } = params;

  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const [iframeErrorMessage, setIframeErrorMessage] = useState<string | null>(null);
  const [iframeDiagnosticCode, setIframeDiagnosticCode] = useState<string | null>(null);

  const internalIframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframeRef = externalIframeRef ?? internalIframeRef;
  // Rotorsak prod 2026-08-31 (chattar 18e55beb, 757d2def): callbacken kom via
  // en inline-funktion i sidkontrollern och bytte identitet på varje render.
  // Identiteten kaskadade genom failTier2Ready → startTier2StatusPolling →
  // huvudeffekten, som då startade om kvitto-kedjan på VARJE builder-render —
  // varje omstart avbröt den pågående /preview-status-frågan (kancellerings-
  // stormen i DevTools), "running"-kvittot observerades aldrig, och en frisk
  // sajt dömdes ut med preview_ready_timeout efter 98 s. Callbacken hålls
  // därför i en ref: förälderns render-brus kan aldrig mer riva kedjan.
  const onPreviewSessionSuspectRef = useRef(onPreviewSessionSuspect);
  useLayoutEffect(() => {
    onPreviewSessionSuspectRef.current = onPreviewSessionSuspect;
  }, [onPreviewSessionSuspect]);
  const previewReadyTimerRef = useRef<number | null>(null);
  const tier2LoadTimerRef = useRef<number | null>(null);
  const tier2StatusPollTimerRef = useRef<number | null>(null);
  const tier2LateRecoveryDeadlineTimerRef = useRef<number | null>(null);
  const tier2StatusAbortRef = useRef<AbortController | null>(null);
  const tier2LoadIdentityRef = useRef<string | null>(null);
  const tier2LoadedFrameIdentityRef = useRef<string | null>(null);
  const tier2ReadyReloadIdentityRef = useRef<string | null>(null);
  const tier2RecoveryRequestedIdentityRef = useRef<string | null>(null);
  const tier2LateRecoveryIdentityRef = useRef<string | null>(null);
  const tier2SelfHealIdentityRef = useRef<string | null>(null);

  const stopTier2StatusPolling = useCallback(() => {
    if (tier2StatusPollTimerRef.current) {
      window.clearTimeout(tier2StatusPollTimerRef.current);
      tier2StatusPollTimerRef.current = null;
    }
    if (tier2LateRecoveryDeadlineTimerRef.current) {
      window.clearTimeout(tier2LateRecoveryDeadlineTimerRef.current);
      tier2LateRecoveryDeadlineTimerRef.current = null;
    }
    tier2StatusAbortRef.current?.abort();
    tier2StatusAbortRef.current = null;
    tier2SelfHealIdentityRef.current = null;
  }, []);

  const clearPreviewReadyTimer = useCallback(() => {
    if (previewReadyTimerRef.current) {
      window.clearTimeout(previewReadyTimerRef.current);
      previewReadyTimerRef.current = null;
    }
    if (tier2LoadTimerRef.current) {
      window.clearTimeout(tier2LoadTimerRef.current);
      tier2LoadTimerRef.current = null;
    }
    stopTier2StatusPolling();
    tier2LoadIdentityRef.current = null;
    tier2ReadyReloadIdentityRef.current = null;
    tier2RecoveryRequestedIdentityRef.current = null;
    tier2LateRecoveryIdentityRef.current = null;
    tier2SelfHealIdentityRef.current = null;
  }, [stopTier2StatusPolling]);

  const settleTier2Ready = useCallback(() => {
    setIframeLoading(false);
    setIframeError(false);
    setIframeErrorMessage(null);
    clearPreviewReadyTimer();
  }, [clearPreviewReadyTimer]);

  const failTier2Ready = useCallback(
    (identity: string) => {
      if (tier2LoadIdentityRef.current !== identity) return;
      if (tier2LoadTimerRef.current) {
        window.clearTimeout(tier2LoadTimerRef.current);
        tier2LoadTimerRef.current = null;
      }
      stopTier2StatusPolling();
      // Invalidate the receipt before invoking recovery so a late onLoad
      // cannot settle or restart polling after this timeout has fired.
      tier2LoadIdentityRef.current = null;
      tier2ReadyReloadIdentityRef.current = null;
      setIframeLoading(false);
      setIframeError(true);
      setIframeDiagnosticCode("preview_ready_timeout");
      setIframeErrorMessage(describePreviewDiagnosticCode("preview_ready_timeout"));
      if (tier2RecoveryRequestedIdentityRef.current !== identity) {
        tier2RecoveryRequestedIdentityRef.current = identity;
        onPreviewSessionSuspectRef.current?.();
      }
    },
    [stopTier2StatusPolling],
  );

  const startTier2ReadyReload = useCallback(
    (identity: string, expectedPreviewUrl: string) => {
      const iframe = iframeRef.current;
      const currentSrc = iframe?.getAttribute("src") || iframe?.src || "";
      if (
        !iframe ||
        !currentSrc ||
        !isSameTier2PreviewSession(expectedPreviewUrl, currentSrc)
      ) {
        // Never reload a frame that has drifted to another origin/chat-session
        // while the status request was in flight.
        tier2LoadIdentityRef.current = identity;
        failTier2Ready(identity);
        return;
      }

      stopTier2StatusPolling();
      if (tier2LoadTimerRef.current) {
        window.clearTimeout(tier2LoadTimerRef.current);
        tier2LoadTimerRef.current = null;
      }
      tier2LateRecoveryIdentityRef.current = null;
      tier2LoadIdentityRef.current = identity;
      tier2ReadyReloadIdentityRef.current = identity;
      setIframeLoading(true);
      setIframeError(false);
      setIframeDiagnosticCode(null);
      setIframeErrorMessage(null);
      iframe.src = currentSrc;
      tier2LoadTimerRef.current = window.setTimeout(
        () => failTier2Ready(identity),
        TIER2_READY_RELOAD_TIMEOUT_MS,
      );
    },
    [failTier2Ready, iframeRef, stopTier2StatusPolling],
  );

  const startTier2SelfHealPolling = useCallback(
    (
      identity: string,
      previewSessionId: string,
      expectedLifecycleToken: string | null,
      expectedChatId: string,
      expectedVersionId: string,
      expectedPreviewUrl: string,
    ) => {
      stopTier2StatusPolling();
      tier2SelfHealIdentityRef.current = identity;

      const pollStatus = async () => {
        if (tier2SelfHealIdentityRef.current !== identity) return;
        const abortController = new AbortController();
        tier2StatusAbortRef.current = abortController;
        const status = await fetchPreviewStatus({
          chatId: expectedChatId,
          versionId: expectedVersionId,
          previewSessionId,
          signal: abortController.signal,
        });
        if (
          abortController.signal.aborted ||
          tier2SelfHealIdentityRef.current !== identity
        ) {
          return;
        }

        tier2StatusAbortRef.current = null;
        const receiptMatchesIdentity =
          status?.versionId === expectedVersionId &&
          status.previewSessionId === previewSessionId &&
          (status.lifecycleToken ?? null) === expectedLifecycleToken &&
          isSameTier2PreviewSession(status.previewUrl, expectedPreviewUrl);
        if (status?.status === "running" && receiptMatchesIdentity) {
          tier2SelfHealIdentityRef.current = null;
          startTier2ReadyReload(identity, expectedPreviewUrl);
          return;
        }

        // Starting, mismatch, or a dropped request: keep the banner and
        // keep reading. Never notify the controller again from this path.
        tier2StatusPollTimerRef.current = window.setTimeout(() => {
          tier2StatusPollTimerRef.current = null;
          void pollStatus();
        }, TIER2_SELF_HEAL_POLL_MS);
      };

      tier2StatusPollTimerRef.current = window.setTimeout(() => {
        tier2StatusPollTimerRef.current = null;
        void pollStatus();
      }, TIER2_SELF_HEAL_POLL_MS);
    },
    [startTier2ReadyReload, stopTier2StatusPolling],
  );
  const startTier2SelfHealPollingRef = useRef(startTier2SelfHealPolling);
  useLayoutEffect(() => {
    startTier2SelfHealPollingRef.current = startTier2SelfHealPolling;
  }, [startTier2SelfHealPolling]);

  const startTier2StatusPolling = useCallback(
    (
      identity: string,
      previewSessionId: string,
      expectedLifecycleToken: string | null,
      expectedChatId: string,
      expectedVersionId: string,
      expectedPreviewUrl: string,
    ) => {
      if (
        tier2LoadIdentityRef.current !== identity ||
        tier2ReadyReloadIdentityRef.current === identity ||
        tier2RecoveryRequestedIdentityRef.current === identity
      ) {
        return;
      }

      stopTier2StatusPolling();
      const abortController = new AbortController();
      tier2StatusAbortRef.current = abortController;

      const pollStatus = async () => {
        if (abortController.signal.aborted || tier2LoadIdentityRef.current !== identity) return;
        const status = await fetchPreviewStatus({
          chatId: expectedChatId,
          versionId: expectedVersionId,
          previewSessionId,
          signal: abortController.signal,
        });
        if (abortController.signal.aborted || tier2LoadIdentityRef.current !== identity) return;

        const receiptMatchesIdentity =
          status?.versionId === expectedVersionId &&
          status.previewSessionId === previewSessionId &&
          (status.lifecycleToken ?? null) === expectedLifecycleToken &&
          isSameTier2PreviewSession(status.previewUrl, expectedPreviewUrl);

        if (status?.status === "running" && receiptMatchesIdentity) {
          // A running receipt can arrive while the iframe still displays the
          // host's HTTP-200 starting document. Reload the exact current src now
          // that the runtime accepts traffic, and reveal only on that reload's
          // subsequent onLoad.
          startTier2ReadyReload(identity, expectedPreviewUrl);
          return;
        }

        if (status && !(status.status === "starting" && receiptMatchesIdentity)) {
          // Terminal/mismatched states belong to the existing recovery owner.
          // Keep the overlay covered while it acts, and avoid refetching this
          // terminal receipt every four seconds.
          stopTier2StatusPolling();
          tier2RecoveryRequestedIdentityRef.current = identity;
          onPreviewSessionSuspectRef.current?.();
          return;
        }

        tier2StatusPollTimerRef.current = window.setTimeout(
          () => void pollStatus(),
          TIER2_STATUS_POLL_MS,
        );
      };

      void pollStatus();
    },
    [startTier2ReadyReload, stopTier2StatusPolling],
  );

  const queueTier2LateRecoveryPolling = useCallback(
    (
      identity: string,
      previewSessionId: string,
      expectedLifecycleToken: string | null,
      expectedChatId: string,
      expectedVersionId: string,
      expectedPreviewUrl: string,
    ) => {
      if (tier2RecoveryRequestedIdentityRef.current !== identity) return;

      stopTier2StatusPolling();
      tier2LateRecoveryIdentityRef.current = identity;
      tier2LateRecoveryDeadlineTimerRef.current = window.setTimeout(() => {
        if (tier2LateRecoveryIdentityRef.current !== identity) return;
        tier2LateRecoveryIdentityRef.current = null;
        stopTier2StatusPolling();
        // Banner stays up after the 30s tail. A later matching running
        // receipt (prod 2026-08-31, chat 47607bca) must still be able
        // to take the existing ready-reload path — no new restart loop.
        startTier2SelfHealPollingRef.current(
          identity,
          previewSessionId,
          expectedLifecycleToken,
          expectedChatId,
          expectedVersionId,
          expectedPreviewUrl,
        );
      }, TIER2_LATE_RECOVERY_WINDOW_MS);

      const pollStatus = async () => {
        if (tier2LateRecoveryIdentityRef.current !== identity) return;
        const abortController = new AbortController();
        tier2StatusAbortRef.current = abortController;
        const status = await fetchPreviewStatus({
          chatId: expectedChatId,
          versionId: expectedVersionId,
          previewSessionId,
          signal: abortController.signal,
        });
        if (
          abortController.signal.aborted ||
          tier2LateRecoveryIdentityRef.current !== identity
        ) {
          return;
        }

        tier2StatusAbortRef.current = null;
        const receiptMatchesIdentity =
          status?.versionId === expectedVersionId &&
          status.previewSessionId === previewSessionId &&
          (status.lifecycleToken ?? null) === expectedLifecycleToken &&
          isSameTier2PreviewSession(status.previewUrl, expectedPreviewUrl);
        if (status?.status === "running" && receiptMatchesIdentity) {
          tier2LateRecoveryIdentityRef.current = null;
          startTier2ReadyReload(identity, expectedPreviewUrl);
          return;
        }

        if (status && !(status.status === "starting" && receiptMatchesIdentity)) {
          // A terminal or mismatched receipt ends the late window immediately.
          // The controller already received exactly one suspect notification,
          // so this path cannot trigger another restart or callback.
          tier2LateRecoveryIdentityRef.current = null;
          stopTier2StatusPolling();
          return;
        }

        tier2StatusPollTimerRef.current = window.setTimeout(() => {
          tier2StatusPollTimerRef.current = null;
          void pollStatus();
        }, TIER2_STATUS_POLL_MS);
      };

      tier2StatusPollTimerRef.current = window.setTimeout(() => {
        tier2StatusPollTimerRef.current = null;
        void pollStatus();
      }, TIER2_STATUS_POLL_MS);
    },
    [startTier2ReadyReload, stopTier2StatusPolling],
  );

  /**
   * The boot deadline alone is not proof of failure: the running receipt can
   * be seconds late (slow Fly boot, rate-limited /preview-status) while the
   * site below already renders. Prod 2026-08-31 (chat a3346e1e): the red
   * `preview_ready_timeout` banner covered a working v2. Do one final
   * read-only status check at the deadline — a matching running receipt goes
   * to the normal ready-reload with no banner; anything else fails exactly
   * like before (banner + one suspect report + bounded late recovery).
   */
  const confirmOrFailTier2Ready = useCallback(
    (
      identity: string,
      session: {
        previewSessionId: string;
        lifecycleToken: string | null;
        chatId: string;
        versionId: string;
        previewUrl: string;
      } | null,
    ) => {
      if (tier2LoadIdentityRef.current !== identity) return;
      const failAndQueueLateRecovery = () => {
        failTier2Ready(identity);
        if (!session) return;
        queueTier2LateRecoveryPolling(
          identity,
          session.previewSessionId,
          session.lifecycleToken,
          session.chatId,
          session.versionId,
          session.previewUrl,
        );
      };
      if (!session) {
        failAndQueueLateRecovery();
        return;
      }
      stopTier2StatusPolling();
      const abortController = new AbortController();
      tier2StatusAbortRef.current = abortController;
      const guardTimer = window.setTimeout(() => {
        if (tier2LoadIdentityRef.current !== identity) return;
        abortController.abort();
        failAndQueueLateRecovery();
      }, TIER2_FINAL_CHECK_TIMEOUT_MS);
      void (async () => {
        const status = await fetchPreviewStatus({
          chatId: session.chatId,
          versionId: session.versionId,
          previewSessionId: session.previewSessionId,
          signal: abortController.signal,
        });
        window.clearTimeout(guardTimer);
        if (abortController.signal.aborted || tier2LoadIdentityRef.current !== identity) return;
        const receiptMatchesIdentity =
          status?.versionId === session.versionId &&
          status.previewSessionId === session.previewSessionId &&
          (status.lifecycleToken ?? null) === session.lifecycleToken &&
          isSameTier2PreviewSession(status.previewUrl, session.previewUrl);
        if (status?.status === "running" && receiptMatchesIdentity) {
          startTier2ReadyReload(identity, session.previewUrl);
          return;
        }
        failAndQueueLateRecovery();
      })();
    },
    [
      failTier2Ready,
      queueTier2LateRecoveryPolling,
      startTier2ReadyReload,
      stopTier2StatusPolling,
    ],
  );

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- clear diagnostic when error clears */
    if (!iframeError) setIframeDiagnosticCode(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [iframeError]);

  useEffect(() => {
    return () => clearPreviewReadyTimer();
  }, [clearPreviewReadyTimer]);

  useEffect(() => {
    // Session metadata may arrive after the iframe's first load, so retain the
    // loaded receipt across session-id changes but never across frame identity.
    tier2LoadedFrameIdentityRef.current = null;
  }, [chatId, previewUrl, refreshToken]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reset iframe error state when preview identity changes */
    clearPreviewReadyTimer();
    setIframeError(false);
    setIframeErrorMessage(null);
    setIframeDiagnosticCode(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [
    chatId,
    versionId,
    previewUrl,
    activePreviewSessionId,
    activePreviewLifecycleToken,
    clearPreviewReadyTimer,
  ]);

  useEffect(() => {
    if (!previewUrl) return;
    clearPreviewReadyTimer();
    /* eslint-disable react-hooks/set-state-in-effect -- loading state when URL or refresh token changes */
    setIframeLoading(true);
    setIframeError(false);
    setIframeErrorMessage(null);
    /* eslint-enable react-hooks/set-state-in-effect */

    if (!isOwnEnginePreview && isTier2LivePreviewUrl(previewUrl)) {
      const previewSessionId = activePreviewSessionId?.trim() ?? "";
      const frameIdentity = JSON.stringify([chatId ?? "", previewUrl, refreshToken ?? 0]);
      const identity = JSON.stringify([
        chatId ?? "",
        versionId ?? "",
        previewSessionId,
        activePreviewLifecycleToken !== undefined,
        activePreviewLifecycleToken ?? null,
        previewUrl,
        refreshToken ?? 0,
      ]);
      tier2LoadIdentityRef.current = identity;
      tier2LoadTimerRef.current = window.setTimeout(() => {
        confirmOrFailTier2Ready(
          identity,
          chatId && versionId && previewSessionId && activePreviewLifecycleToken !== undefined
            ? {
                previewSessionId,
                lifecycleToken: activePreviewLifecycleToken,
                chatId,
                versionId,
                previewUrl,
              }
            : null,
        );
      }, TIER2_LOAD_TIMEOUT_MS);

      if (
        chatId &&
        versionId &&
        previewSessionId &&
        activePreviewLifecycleToken !== undefined &&
        tier2LoadedFrameIdentityRef.current === frameIdentity
      ) {
        startTier2StatusPolling(
          identity,
          previewSessionId,
          activePreviewLifecycleToken,
          chatId,
          versionId,
          previewUrl,
        );
      }
    }
  }, [
    previewUrl,
    refreshToken,
    chatId,
    versionId,
    activePreviewSessionId,
    activePreviewLifecycleToken,
    isOwnEnginePreview,
    clearPreviewReadyTimer,
    confirmOrFailTier2Ready,
    startTier2StatusPolling,
  ]);

  const reloadControlledPreview = useCallback(() => {
    const iframe = iframeRef.current;
    const controlledSrc = iframe?.getAttribute("src");
    if (!iframe || !controlledSrc) return false;

    clearPreviewReadyTimer();
    setIframeLoading(true);
    setIframeError(false);
    setIframeErrorMessage(null);
    setIframeDiagnosticCode(null);

    if (!isOwnEnginePreview && previewUrl && isTier2LivePreviewUrl(previewUrl)) {
      const previewSessionId = activePreviewSessionId?.trim() ?? "";
      const identity = JSON.stringify([
        chatId ?? "",
        versionId ?? "",
        previewSessionId,
        activePreviewLifecycleToken !== undefined,
        activePreviewLifecycleToken ?? null,
        previewUrl,
        refreshToken ?? 0,
      ]);
      tier2LoadedFrameIdentityRef.current = null;
      tier2LoadIdentityRef.current = identity;
      tier2LoadTimerRef.current = window.setTimeout(() => {
        confirmOrFailTier2Ready(
          identity,
          chatId && versionId && previewSessionId && activePreviewLifecycleToken !== undefined
            ? {
                previewSessionId,
                lifecycleToken: activePreviewLifecycleToken,
                chatId,
                versionId,
                previewUrl,
              }
            : null,
        );
      }, TIER2_LOAD_TIMEOUT_MS);
    }

    // A controlled URL is often unchanged after SPA navigation. React will
    // therefore not write the src again, so explicitly reload the exact
    // decorated URL (including viewer/refresh parameters).
    iframe.src = controlledSrc;
    return true;
  }, [
    activePreviewLifecycleToken,
    activePreviewSessionId,
    chatId,
    clearPreviewReadyTimer,
    confirmOrFailTier2Ready,
    iframeRef,
    isOwnEnginePreview,
    previewUrl,
    refreshToken,
    versionId,
  ]);

  const handleIframeLoad = useCallback(() => {
    if (!isOwnEnginePreview && previewUrl && isTier2LivePreviewUrl(previewUrl)) {
      const previewSessionId = activePreviewSessionId?.trim() ?? "";
      const frameIdentity = JSON.stringify([chatId ?? "", previewUrl, refreshToken ?? 0]);
      tier2LoadedFrameIdentityRef.current = frameIdentity;
      if (
        !chatId ||
        !versionId ||
        !previewSessionId ||
        activePreviewLifecycleToken === undefined
      ) {
        return;
      }
      const identity = JSON.stringify([
        chatId,
        versionId,
        previewSessionId,
        true,
        activePreviewLifecycleToken,
        previewUrl,
        refreshToken ?? 0,
      ]);
      if (tier2LoadIdentityRef.current !== identity) return;
      if (tier2ReadyReloadIdentityRef.current === identity) {
        settleTier2Ready();
        return;
      }
      startTier2StatusPolling(
        identity,
        previewSessionId,
        activePreviewLifecycleToken,
        chatId,
        versionId,
        previewUrl,
      );
      return;
    }

    clearPreviewReadyTimer();

    const iframe = iframeRef.current;
    if (!iframe) {
      setIframeLoading(false);
      setIframeError(false);
      setIframeErrorMessage(null);
      return;
    }

    if (isOwnEnginePreview) {
      const startedAt = Date.now();
      const checkReady = () => {
        try {
          const doc = iframe.contentDocument;
          const previewIssue = detectOwnEnginePreviewIssue(doc);
          if (previewIssue) {
            setIframeLoading(false);
            setIframeError(false);
            setIframeErrorMessage(null);
            clearPreviewReadyTimer();
            reportOwnEngineRenderFailure(previewIssue);
            return;
          }
          const root = doc?.getElementById("root");
          const hasRootChildren = Boolean(root && root.childElementCount > 0);
          const hasBodyContent = Boolean((doc?.body?.innerText || "").trim().length > 0);
          const hasSubstantialDom = Boolean((doc?.body?.querySelectorAll("*").length || 0) > 12);
          if (hasRootChildren || hasBodyContent || hasSubstantialDom) {
            setIframeLoading(false);
            setIframeError(false);
            setIframeErrorMessage(null);
            clearPreviewReadyTimer();
            return;
          }
        } catch {
          setIframeLoading(false);
          setIframeError(true);
          setIframeDiagnosticCode("preview_document_unavailable");
          setIframeErrorMessage(describePreviewDiagnosticCode("preview_document_unavailable"));
          clearPreviewReadyTimer();
          reportOwnEngineRenderFailure({
            message: "Preview iframe document could not be read.",
            kind: "transport",
            code: "preview_document_unavailable",
            stage: "iframe",
            source: "preview-ready-poll",
          });
          return;
        }

        if (Date.now() - startedAt >= PREVIEW_READY_TIMEOUT_MS) {
          setIframeLoading(false);
          setIframeError(true);
          setIframeDiagnosticCode("preview_ready_timeout");
          setIframeErrorMessage(describePreviewDiagnosticCode("preview_ready_timeout"));
          clearPreviewReadyTimer();
          if (previewUrl && isTier2LivePreviewUrl(previewUrl)) {
            onPreviewSessionSuspectRef.current?.();
          }
          reportOwnEngineRenderFailure({
            message: `Preview remained blank after waiting ${PREVIEW_READY_TIMEOUT_MS}ms.`,
            kind: "transport",
            code: "preview_ready_timeout",
            stage: "iframe",
            source: "preview-ready-poll",
          });
          return;
        }

        previewReadyTimerRef.current = window.setTimeout(checkReady, PREVIEW_READY_POLL_MS);
      };

      previewReadyTimerRef.current = window.setTimeout(checkReady, PREVIEW_READY_POLL_MS);
      return;
    }

    if (tier2LoadTimerRef.current) {
      window.clearTimeout(tier2LoadTimerRef.current);
      tier2LoadTimerRef.current = null;
    }
    setIframeLoading(false);
    setIframeError(false);
    setIframeErrorMessage(null);
  }, [
    clearPreviewReadyTimer,
    previewUrl,
    refreshToken,
    chatId,
    versionId,
    activePreviewSessionId,
    activePreviewLifecycleToken,
    isOwnEnginePreview,
    reportOwnEngineRenderFailure,
    iframeRef,
    settleTier2Ready,
    startTier2StatusPolling,
  ]);

  return {
    iframeRef,
    iframeLoading,
    setIframeLoading,
    iframeError,
    setIframeError,
    iframeErrorMessage,
    setIframeErrorMessage,
    iframeDiagnosticCode,
    setIframeDiagnosticCode,
    clearPreviewReadyTimer,
    handleIframeLoad,
    reloadControlledPreview,
  };
}
