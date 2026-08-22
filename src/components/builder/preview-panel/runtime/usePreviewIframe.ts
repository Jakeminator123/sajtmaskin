"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { fetchPreviewStatus } from "@/lib/builder/preview-session/api";
import { describePreviewDiagnosticCode } from "@/lib/gen/preview/diagnostics";
import { isTier2LivePreviewUrl } from "@/lib/gen/preview/preview-url-classifier";
import { detectOwnEnginePreviewIssue, type PreviewIssuePayload } from "./iframe-diagnostics";

const PREVIEW_READY_TIMEOUT_MS = 45_000;
const PREVIEW_READY_POLL_MS = 250;
const TIER2_LOAD_TIMEOUT_MS = 30_000;
// Match the preview host's 4s starting-page refresh and leave ample room in
// the shared 60 requests/minute preview-status bucket (including other tabs
// and the recovery check that runs after a timeout).
const TIER2_STATUS_POLL_MS = 4_000;

export function usePreviewIframe(params: {
  previewUrl: string | null;
  refreshToken?: number;
  chatId: string | null;
  versionId: string | null;
  activePreviewSessionId?: string | null;
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
  const previewReadyTimerRef = useRef<number | null>(null);
  const tier2LoadTimerRef = useRef<number | null>(null);
  const tier2StatusPollTimerRef = useRef<number | null>(null);
  const tier2StatusAbortRef = useRef<AbortController | null>(null);
  const tier2LoadIdentityRef = useRef<string | null>(null);
  const tier2LoadedFrameIdentityRef = useRef<string | null>(null);
  const tier2ReadyReloadIdentityRef = useRef<string | null>(null);
  const tier2RecoveryRequestedIdentityRef = useRef<string | null>(null);

  const stopTier2StatusPolling = useCallback(() => {
    if (tier2StatusPollTimerRef.current) {
      window.clearTimeout(tier2StatusPollTimerRef.current);
      tier2StatusPollTimerRef.current = null;
    }
    tier2StatusAbortRef.current?.abort();
    tier2StatusAbortRef.current = null;
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
  }, [stopTier2StatusPolling]);

  const settleTier2Ready = useCallback(() => {
    setIframeLoading(false);
    setIframeError(false);
    setIframeErrorMessage(null);
    clearPreviewReadyTimer();
  }, [clearPreviewReadyTimer]);

  const startTier2StatusPolling = useCallback(
    (
      identity: string,
      previewSessionId: string,
      expectedChatId: string,
      expectedVersionId: string,
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
          status?.versionId === expectedVersionId && status.previewSessionId === previewSessionId;

        if (status?.status === "running" && receiptMatchesIdentity) {
          // A running receipt can arrive while the iframe still displays the
          // host's HTTP-200 starting document. Reload the exact current src now
          // that the runtime accepts traffic, and reveal only on that reload's
          // subsequent onLoad.
          stopTier2StatusPolling();
          tier2ReadyReloadIdentityRef.current = identity;
          const iframe = iframeRef.current;
          const currentSrc = iframe?.getAttribute("src") || iframe?.src || "";
          if (iframe && currentSrc) iframe.src = currentSrc;
          return;
        }

        if (status && !(status.status === "starting" && receiptMatchesIdentity)) {
          // Terminal/mismatched states belong to the existing recovery owner.
          // Keep the overlay covered while it acts, and avoid refetching this
          // terminal receipt every four seconds.
          stopTier2StatusPolling();
          tier2RecoveryRequestedIdentityRef.current = identity;
          onPreviewSessionSuspect?.();
          return;
        }

        tier2StatusPollTimerRef.current = window.setTimeout(
          () => void pollStatus(),
          TIER2_STATUS_POLL_MS,
        );
      };

      void pollStatus();
    },
    [iframeRef, onPreviewSessionSuspect, stopTier2StatusPolling],
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
  }, [chatId, versionId, previewUrl, activePreviewSessionId, clearPreviewReadyTimer]);

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
        previewUrl,
        refreshToken ?? 0,
      ]);
      tier2LoadIdentityRef.current = identity;
      tier2LoadTimerRef.current = window.setTimeout(() => {
        if (tier2LoadIdentityRef.current !== identity) return;
        tier2LoadTimerRef.current = null;
        stopTier2StatusPolling();
        // Invalidate the receipt before invoking recovery so a late onLoad
        // cannot restart an uncapped poll after this sole timeout has fired.
        tier2LoadIdentityRef.current = null;
        tier2ReadyReloadIdentityRef.current = null;
        setIframeLoading(false);
        if (tier2RecoveryRequestedIdentityRef.current !== identity) {
          tier2RecoveryRequestedIdentityRef.current = identity;
          onPreviewSessionSuspect?.();
        }
      }, TIER2_LOAD_TIMEOUT_MS);

      if (
        chatId &&
        versionId &&
        previewSessionId &&
        tier2LoadedFrameIdentityRef.current === frameIdentity
      ) {
        startTier2StatusPolling(identity, previewSessionId, chatId, versionId);
      }
    }
  }, [
    previewUrl,
    refreshToken,
    chatId,
    versionId,
    activePreviewSessionId,
    isOwnEnginePreview,
    onPreviewSessionSuspect,
    clearPreviewReadyTimer,
    startTier2StatusPolling,
    stopTier2StatusPolling,
  ]);

  const handleIframeLoad = useCallback(() => {
    if (!isOwnEnginePreview && previewUrl && isTier2LivePreviewUrl(previewUrl)) {
      const previewSessionId = activePreviewSessionId?.trim() ?? "";
      const frameIdentity = JSON.stringify([chatId ?? "", previewUrl, refreshToken ?? 0]);
      tier2LoadedFrameIdentityRef.current = frameIdentity;
      if (!chatId || !versionId || !previewSessionId) return;
      const identity = JSON.stringify([
        chatId,
        versionId,
        previewSessionId,
        previewUrl,
        refreshToken ?? 0,
      ]);
      if (tier2LoadIdentityRef.current !== identity) return;
      if (tier2ReadyReloadIdentityRef.current === identity) {
        settleTier2Ready();
        return;
      }
      startTier2StatusPolling(identity, previewSessionId, chatId, versionId);
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
            onPreviewSessionSuspect?.();
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
    isOwnEnginePreview,
    onPreviewSessionSuspect,
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
  };
}
