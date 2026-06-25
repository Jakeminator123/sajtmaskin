"use client";

import { useCallback, useEffect, useState, type ReactNode, type RefObject } from "react";
import { AlertCircle, ExternalLink, Loader2, MousePointerClick } from "lucide-react";
import { Button } from "@/components/ui/button";

import type { VersionMismatchOverlayPayload } from "@/lib/gen/preview/preview-host-client";
import { VersionMismatchOverlay } from "./VersionMismatchOverlay";

export interface PreviewPanelFrameProps {
  isLoading: boolean;
  iframeError: boolean;
  iframeErrorMessage: string | null;
  iframeDiagnosticCode: string | null;
  iframeRunbookLines: string[];
  handleOpenInNewTab: () => void;
  onFixPreview?: (() => void) | null;
  previewSrc: string;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  handleIframeLoad: () => void;
  handleIframeError: () => void;
  /**
   * P25b-rest: when the app and the preview-VM disagree on which version is
   * live, the dispatch pipeline can populate this prop to render the
   * non-blocking `VersionMismatchOverlay` over the iframe. Default `null`
   * = no overlay. The overlay component is the *consumer* — wiring up the
   * dispatch (poll/SSE that detects the mismatch) is a separate concern;
   * see `VersionMismatchOverlayPayload` JSDoc in `preview-host-client.ts`.
   */
  versionMismatchPayload?: VersionMismatchOverlayPayload | null;
  /**
   * Optional retry handler forwarded to `VersionMismatchOverlay`. Wire to
   * the same callback as the iframe-reload button so users can force a
   * restart if the mismatch lingers beyond the expected window.
   */
  onForceRestart?: () => void;
  children?: ReactNode;
}

// Visa full-screen-overlayen bara om laddningen tar längre än
// LOADING_OVERLAY_DEBOUNCE_MS. Snabba navigeringar (klick på sidonav i
// builder, intern route-byte) hinner ofta bli klara inom några hundra ms
// och då gör flimrande overlay mer skada än nytta.
const LOADING_OVERLAY_DEBOUNCE_MS = 350;

// Hard-cap: defensiv backup om iframens onLoad aldrig fyrar (cross-origin
// sandbox, HMR-WS-fel som blockerar load-event, eller cold-boot-VM som
// tar längre än normal). Tvingar bort overlayen efter denna tid oavsett
// state — det är bättre att visa innehållet (även halvfärdig preview)
// än att låta spinnern hänga kvar för evigt.
const LOADING_OVERLAY_HARD_CAP_MS = 6_000;

// Hur länge "klicka för att fokusera"-ledtråden visas innan den auto-göms,
// om användaren inte klickar i previewn. Kort nog att inte vara påträngande,
// långt nog att hinna läsas. Ledtråden göms direkt när iframen får fokus.
const FOCUS_HINT_TIMEOUT_MS = 7_000;

export function PreviewPanelFrame({
  isLoading,
  iframeError,
  iframeErrorMessage,
  iframeDiagnosticCode,
  iframeRunbookLines,
  handleOpenInNewTab,
  onFixPreview,
  previewSrc,
  iframeRef,
  handleIframeLoad,
  handleIframeError,
  versionMismatchPayload = null,
  onForceRestart,
  children,
}: PreviewPanelFrameProps) {
  // Track timer outcomes rather than "what to show" directly. Visibility is
  // derived from `isLoading` + these flags during render, which keeps the
  // effect body free of synchronous setState calls (react-hooks/set-state-in-effect).
  const [debounceElapsed, setDebounceElapsed] = useState(false);
  const [hardCapReached, setHardCapReached] = useState(false);

  useEffect(() => {
    if (!isLoading) return;
    const debounceId = window.setTimeout(() => {
      setDebounceElapsed(true);
    }, LOADING_OVERLAY_DEBOUNCE_MS);
    const hardCapId = window.setTimeout(() => {
      setHardCapReached(true);
    }, LOADING_OVERLAY_HARD_CAP_MS);
    // Cleanup handles both (a) isLoading → false and (b) unmount. Resetting
    // the flags here — rather than in the effect body — prepares for the
    // next rising edge without cascading renders on the current one.
    return () => {
      window.clearTimeout(debounceId);
      window.clearTimeout(hardCapId);
      setDebounceElapsed(false);
      setHardCapReached(false);
    };
  }, [isLoading]);

  const topBarVisible = isLoading && !hardCapReached;
  const overlayVisible = isLoading && debounceElapsed && !hardCapReached;

  // Tangentbordsspel (t.ex. snake) lyssnar på `window` inne i iframen och får
  // aldrig piltangenter förrän iframen har fokus. Inget i buildern fokuserar
  // iframen, så användaren måste klicka i spelytan först — utan ledtråd om det.
  // Vi fokuserar iframen vid klick i preview-ytan och visar en icke-blockerande
  // ledtråd tills iframen fått fokus.
  const [previewFocused, setPreviewFocused] = useState(false);
  const [focusHintExpired, setFocusHintExpired] = useState(false);

  const focusPreviewIframe = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      iframe.focus({ preventScroll: true });
    } catch {
      /* focus() kan kasta i vissa äldre webbläsare — icke-fatalt */
    }
    try {
      // window.focus() är tillåtet cross-origin; guarda ändå defensivt.
      iframe.contentWindow?.focus();
    } catch {
      /* cross-origin guard */
    }
  }, [iframeRef]);

  // Detektera när iframen tagit fokus: parent-fönstret får då `blur` och
  // document.activeElement blir iframe-elementet. Då kan ledtråden gömmas.
  useEffect(() => {
    const handleWindowBlur = () => {
      if (document.activeElement === iframeRef.current) {
        setPreviewFocused(true);
      }
    };
    window.addEventListener("blur", handleWindowBlur);
    return () => window.removeEventListener("blur", handleWindowBlur);
  }, [iframeRef]);

  // Auto-göm ledtråden efter en stund — men arma timern FÖRST när previewn
  // faktiskt är interaktiv (`!isLoading && !iframeError`) och iframen inte
  // redan fått fokus. Annars hinner en kall preview-host-boot (>7s) "förbruka"
  // timern medan ledtråden ändå är dold av isLoading, så användaren aldrig
  // ser den — exakt de långsamma bootarna där hjälpen behövs mest.
  useEffect(() => {
    if (!previewSrc || isLoading || iframeError || previewFocused) return;
    const id = window.setTimeout(() => setFocusHintExpired(true), FOCUS_HINT_TIMEOUT_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, [previewSrc, isLoading, iframeError, previewFocused]);

  // Återställ ledtråds-state vid reload (ny `previewSrc`). Görs i cleanup —
  // inte synkront i effekt-kroppen — för att undvika cascading-render-varningen
  // (samma mönster som debounce/hard-cap-effekten ovan). Cleanup körs när
  // `previewSrc` ändras, då fokus återgår till parent och ledtråden ska kunna
  // visas igen för den nya previewn.
  useEffect(() => {
    return () => {
      setFocusHintExpired(false);
      setPreviewFocused(false);
    };
  }, [previewSrc]);

  const showFocusHint =
    Boolean(previewSrc) && !focusHintExpired && !previewFocused && !isLoading && !iframeError;

  return (
    <div
      className="relative h-full overflow-hidden bg-gray-950"
      onMouseDown={focusPreviewIframe}
    >
      {topBarVisible ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-transparent"
        >
          <div className="bg-primary/70 h-full w-full animate-pulse rounded-full" />
        </div>
      ) : null}
      {overlayVisible ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-[1px] transition-opacity">
          <div className="text-center">
            <Loader2 className="text-primary mx-auto mb-2 h-6 w-6 animate-spin" />
            <p className="text-muted-foreground text-xs">Laddar...</p>
          </div>
        </div>
      ) : null}

      {iframeError ? (
        <div className="absolute inset-0 z-10 flex max-h-full flex-col items-center justify-center overflow-y-auto bg-black/85 p-4">
          <AlertCircle className="mb-4 h-12 w-12 shrink-0 text-red-400" />
          <p className="mb-2 max-w-lg text-center text-sm text-gray-300">
            {iframeErrorMessage || "Preview kunde inte laddas i iframe. Öppna i ny flik istället."}
          </p>
          {iframeDiagnosticCode ? (
            <p className="mb-2 font-mono text-[11px] text-zinc-500">Kod: {iframeDiagnosticCode}</p>
          ) : null}
          {iframeRunbookLines.length > 0 ? (
            <ul className="mb-4 max-h-48 max-w-lg list-disc space-y-1.5 overflow-y-auto pl-5 text-left text-[11px] leading-snug text-zinc-400">
              {iframeRunbookLines.map((line, idx) => (
                <li key={`${idx}-${line.slice(0, 48)}`}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-center text-xs text-gray-500">
              Öppna i ny flik eller försök reparera previewn om felet kvarstår.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={handleOpenInNewTab}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Öppna i ny flik
            </Button>
            {onFixPreview ? (
              <Button variant="outline" onClick={onFixPreview} disabled={isLoading}>
                Försök reparera preview
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <iframe
        id="preview-iframe"
        ref={iframeRef}
        src={previewSrc}
        className="h-full w-full border-0"
        onLoad={handleIframeLoad}
        onError={handleIframeError}
        onMouseDown={focusPreviewIframe}
        // allow-pointer-lock: required by R3F's OrbitControls + drei pointer-locking helpers.
        // allow-modals: lets generated apps use window.alert/confirm without silent failures.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-modals"
        title="Preview"
      />

      {showFocusHint ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/70 px-3 py-1.5 text-[11px] text-zinc-200 shadow-lg backdrop-blur-sm">
            <MousePointerClick className="text-primary h-3.5 w-3.5" />
            Klicka i previewn för att styra med tangentbordet
          </div>
        </div>
      ) : null}

      {/*
        Suppress the version-mismatch overlay when the iframe itself is in
        an error state — the error overlay (z-10) carries the actionable
        diagnostic, and stacking the mismatch overlay (z-30) on top would
        falsely tell the user "preview is restarting" while the real state
        is "iframe failed to load". Error wins.
      */}
      {versionMismatchPayload && !iframeError ? (
        <VersionMismatchOverlay
          payload={versionMismatchPayload}
          onForceRestart={onForceRestart}
        />
      ) : null}

      {children}
    </div>
  );
}
