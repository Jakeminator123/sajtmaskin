"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { describePreviewDiagnosticCode } from "@/lib/gen/preview/diagnostics";
import { isTier2LivePreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";
import {
  detectOwnEnginePreviewIssue,
  type PreviewIssuePayload,
} from "../iframe-diagnostics";

const PREVIEW_READY_TIMEOUT_MS = 45_000;
const PREVIEW_READY_POLL_MS = 250;
const TIER2_LOAD_TIMEOUT_MS = 30_000;

export function usePreviewIframe(params: {
  previewUrl: string | null;
  refreshToken?: number;
  chatId: string | null;
  versionId: string | null;
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
    isOwnEnginePreview,
    onPreviewSessionSuspect,
    reportOwnEngineRenderFailure,
    iframeRef: externalIframeRef,
  } = params;

  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const [iframeErrorMessage, setIframeErrorMessage] = useState<string | null>(null);
  const [iframeDiagnosticCode, setIframeDiagnosticCode] = useState<string | null>(null);
  const [hasEverLoaded, setHasEverLoaded] = useState(false);

  const internalIframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframeRef = externalIframeRef ?? internalIframeRef;
  const previewReadyTimerRef = useRef<number | null>(null);
  const tier2LoadTimerRef = useRef<number | null>(null);

  const clearPreviewReadyTimer = useCallback(() => {
    if (previewReadyTimerRef.current) {
      window.clearTimeout(previewReadyTimerRef.current);
      previewReadyTimerRef.current = null;
    }
    if (tier2LoadTimerRef.current) {
      window.clearTimeout(tier2LoadTimerRef.current);
      tier2LoadTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- clear diagnostic when error clears */
    if (!iframeError) setIframeDiagnosticCode(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [iframeError]);

  useEffect(() => {
    return () => clearPreviewReadyTimer();
  }, [clearPreviewReadyTimer]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reset iframe error state when preview identity changes */
    clearPreviewReadyTimer();
    setIframeError(false);
    setIframeErrorMessage(null);
    setIframeDiagnosticCode(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [chatId, versionId, previewUrl, clearPreviewReadyTimer]);

  useEffect(() => {
    if (!previewUrl) return;
    /* eslint-disable react-hooks/set-state-in-effect -- loading state when URL or refresh token changes */
    setIframeLoading(true);
    setIframeError(false);
    setIframeErrorMessage(null);
    /* eslint-enable react-hooks/set-state-in-effect */

    if (!isOwnEnginePreview && isTier2LivePreviewUrl(previewUrl)) {
      if (tier2LoadTimerRef.current) window.clearTimeout(tier2LoadTimerRef.current);
      tier2LoadTimerRef.current = window.setTimeout(() => {
        tier2LoadTimerRef.current = null;
        onPreviewSessionSuspect?.();
      }, TIER2_LOAD_TIMEOUT_MS);
    }
  }, [previewUrl, refreshToken, isOwnEnginePreview, onPreviewSessionSuspect]);

  const handleIframeLoad = useCallback(() => {
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
            setHasEverLoaded(true);
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
    setHasEverLoaded(true);
  }, [
    clearPreviewReadyTimer,
    previewUrl,
    isOwnEnginePreview,
    onPreviewSessionSuspect,
    reportOwnEngineRenderFailure,
    iframeRef,
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
    hasEverLoaded,
  };
}
