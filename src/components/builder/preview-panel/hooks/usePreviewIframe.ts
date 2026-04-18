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
const VM_BOOT_POLL_MS = 600;
const VM_BOOT_TIMEOUT_MS = 90_000;
/**
 * Efter ett iframe-load väntar vi kort så preview-hostens `preview-starting`-
 * postMessage hinner fram innan vi avgör om det var fallback eller riktig
 * Next.js. DOMContentLoaded (som skickar meddelandet) föregår `load`, men
 * vi lägger en liten marginal för att tåla varierande event-ordning i olika
 * browsers.
 */
const VM_CROSS_ORIGIN_GRACE_MS = 400;

/**
 * Är previewURL:en same-origin med buildern? Cross-origin-previews (t.ex.
 * `https://vm-fly-*.fly.dev`) gör att vi inte får läsa `contentDocument` utan
 * att Safari loggar säkerhetsöverträdelse — i de fallen förlitar vi oss helt
 * på postMessage-livscykel istället för DOM-polling.
 */
function isSameOriginPreviewUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (typeof window === "undefined") return false;
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Detektera preview-hostens fallback-sida ("Startar preview") så parent kan
 * behålla GenerationProgress-overlayn istället för att visa en nästan tom
 * iframe medan Next.js i VM:en fortfarande bootar. Vi känner igen sidan på
 * data-attributet som preview-host sätter på `<html>`. Endast användbart för
 * same-origin-iframes — cross-origin får vi aldrig läsa.
 */
function isVmFallbackDocument(doc: Document | null | undefined): boolean {
  if (!doc || !doc.documentElement) return false;
  return doc.documentElement.getAttribute("data-sajtmaskin-preview-state") === "starting";
}

/**
 * Detektera att tier-2 Next.js faktiskt renderat något substantiellt i
 * iframen. Används när preview-hosten inte aktivt postar `preview-ready` —
 * endast meningsfullt för same-origin-iframes.
 */
function isTier2DocumentReady(doc: Document | null | undefined): boolean {
  if (!doc || !doc.body) return false;
  if (isVmFallbackDocument(doc)) return false;
  if (doc.querySelector("#__next")) return true;
  if (doc.querySelector("[data-nextjs-scroll-focus-boundary]")) return true;
  if ((doc.body.querySelectorAll("*").length || 0) > 12) return true;
  return Boolean((doc.body.innerText || "").trim().length > 0);
}

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
  /**
   * `vmReady=true` betyder att iframen faktiskt renderar användarens sajt
   * (tier-2 Next.js eller own-engine-shim). Så länge den är `false` visar
   * parent GenerationProgress istället för iframen så att preview-hostens
   * fallback aldrig syns.
   */
  const [vmReady, setVmReady] = useState(false);

  const internalIframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframeRef = externalIframeRef ?? internalIframeRef;
  const previewReadyTimerRef = useRef<number | null>(null);
  const tier2LoadTimerRef = useRef<number | null>(null);
  const vmBootTimerRef = useRef<number | null>(null);
  const vmBootStartedAtRef = useRef<number>(0);
  /**
   * För cross-origin-previews räknar vi antalet `preview-starting`-signaler
   * från VM-fallbacken. När `sawStartingSinceLoadRef` är true när ett
   * iframe-load inträffar vet vi att iframen just renderade fallback-stubben
   * och väntar på nästa onLoad istället för att markera VM:en klar.
   */
  const sawStartingSinceLoadRef = useRef(false);
  const crossOriginGraceTimerRef = useRef<number | null>(null);

  const clearVmBootTimer = useCallback(() => {
    if (vmBootTimerRef.current) {
      window.clearTimeout(vmBootTimerRef.current);
      vmBootTimerRef.current = null;
    }
    if (crossOriginGraceTimerRef.current) {
      window.clearTimeout(crossOriginGraceTimerRef.current);
      crossOriginGraceTimerRef.current = null;
    }
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
    clearVmBootTimer();
  }, [clearVmBootTimer]);

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
    setVmReady(false);
    sawStartingSinceLoadRef.current = false;
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [chatId, versionId, previewUrl, clearPreviewReadyTimer]);

  const markVmReady = useCallback(() => {
    clearVmBootTimer();
    setVmReady(true);
  }, [clearVmBootTimer]);

  /**
   * Signaleras från telemetri-hooken när VM-fallbacken postar `preview-starting`.
   * Vi använder detta för att säkerställa att nästa iframe-load inte markeras
   * som redo, eftersom det bara är preview-hostens stub som precis renderats.
   */
  const notifyPreviewStarting = useCallback(() => {
    sawStartingSinceLoadRef.current = true;
  }, []);

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
            setVmReady(true);
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

    vmBootStartedAtRef.current = Date.now();

    // Tier-2 / VM-preview: onLoad triggas både av preview-hostens fallback-
    // sida och av den riktiga Next.js-dev-sajten. Vi låter vmReady flippa
    // först när vi faktiskt tror att användarens sajt är renderad.
    if (isSameOriginPreviewUrl(previewUrl)) {
      // Same-origin: vi får läsa iframens DOM och kan polla direkt.
      const pollVmReady = () => {
        vmBootTimerRef.current = null;
        const liveIframe = iframeRef.current;
        let doc: Document | null = null;
        try {
          doc = liveIframe?.contentDocument ?? null;
        } catch {
          doc = null;
        }
        if (isVmFallbackDocument(doc)) {
          // preview-host serverar fortfarande sin starting-stub; vänta.
        } else if (isTier2DocumentReady(doc)) {
          setVmReady(true);
          return;
        }
        if (Date.now() - vmBootStartedAtRef.current >= VM_BOOT_TIMEOUT_MS) {
          setVmReady(true);
          return;
        }
        vmBootTimerRef.current = window.setTimeout(pollVmReady, VM_BOOT_POLL_MS);
      };
      pollVmReady();
      return;
    }

    // Cross-origin (t.ex. https://vm-*.fly.dev från localhost): vi får inte
    // läsa iframens contentDocument utan att browsern loggar
    // säkerhetsöverträdelse. Istället avgör vi fallback vs riktig sajt via
    // postMessage-livscykel — preview-hostens stub postar `preview-starting`
    // på DOMContentLoaded före varje load.
    if (crossOriginGraceTimerRef.current) {
      window.clearTimeout(crossOriginGraceTimerRef.current);
      crossOriginGraceTimerRef.current = null;
    }
    crossOriginGraceTimerRef.current = window.setTimeout(() => {
      crossOriginGraceTimerRef.current = null;
      if (sawStartingSinceLoadRef.current) {
        // Detta var fallback-stubben — nollställ flaggan och vänta på att
        // nästa refresh laddar riktig Next.js (eller tills fail-open-timern
        // slår in nedan).
        sawStartingSinceLoadRef.current = false;
        if (Date.now() - vmBootStartedAtRef.current >= VM_BOOT_TIMEOUT_MS) {
          setVmReady(true);
        }
        return;
      }
      // Inga starting-signaler sedan senaste load → detta är användarens sajt.
      setVmReady(true);
    }, VM_CROSS_ORIGIN_GRACE_MS);
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
    vmReady,
    markVmReady,
    notifyPreviewStarting,
  };
}
