"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { describePreviewDiagnosticCode } from "@/lib/gen/preview/diagnostics";
import { isTier2LivePreviewUrl } from "@/lib/gen/preview/preview-url-classifier";
import type { PreviewLifecycleState } from "@/lib/builder/preview-lifecycle";
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
  /**
   * VM/preview-session lifecycle from preview-session polling. Used to gate the
   * tier-2 (cross-origin VM) readiness clear so a still-booting VM is not marked
   * ready on the raw iframe `onLoad` (which also fires for the "Startar preview"
   * boot page). Optional: when undefined the legacy immediate-clear is kept.
   */
  previewLifecycle?: PreviewLifecycleState;
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
    previewLifecycle,
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
  // Whether the tier-2 iframe has fired at least one `onLoad` for the current
  // preview URL. Lets the lifecycle effect clear loading once the VM goes live
  // even if the final `onLoad` fired just before the "live" signal arrived.
  const tier2HasLoadedRef = useRef(false);

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
    tier2HasLoadedRef.current = false;
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

    if (previewUrl && isTier2LivePreviewUrl(previewUrl)) {
      // Tier-2 (cross-origin VM) preview: we cannot read the iframe document to
      // confirm real content, and the raw `onLoad` also fires for the
      // preview-host "Startar preview" boot page (served HTTP 200 + <meta
      // refresh>). Clearing loading here marks a still-booting VM as ready
      // (false-green). The iframe HAS reached the host, so resolve the
      // "never loaded" suspect timer, but withhold the ready-clear while the
      // preview-session lifecycle still reports a boot phase — the lifecycle
      // effect below clears loading once the VM is "live".
      if (tier2LoadTimerRef.current) {
        window.clearTimeout(tier2LoadTimerRef.current);
        tier2LoadTimerRef.current = null;
      }
      tier2HasLoadedRef.current = true;
      if (previewLifecycle === "bootstrapping" || previewLifecycle === "recovering") {
        return;
      }
      setIframeLoading(false);
      setIframeError(false);
      setIframeErrorMessage(null);
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
    isOwnEnginePreview,
    previewLifecycle,
    onPreviewSessionSuspect,
    reportOwnEngineRenderFailure,
    iframeRef,
  ]);

  // Tier-2 VM preview: clear the loading overlay only once preview-session
  // polling reports the VM is "live". Pairs with `handleIframeLoad`, which
  // withholds the clear while the VM is still booting so the "Startar preview"
  // boot page is never treated as ready.
  useEffect(() => {
    if (previewLifecycle !== "live") return;
    if (!previewUrl || !isTier2LivePreviewUrl(previewUrl)) return;
    if (!tier2HasLoadedRef.current) return;
    /* eslint-disable react-hooks/set-state-in-effect -- clear loading once the VM goes live after load */
    setIframeLoading(false);
    setIframeError(false);
    setIframeErrorMessage(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [previewLifecycle, previewUrl]);

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
