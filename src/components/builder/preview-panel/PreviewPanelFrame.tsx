"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  children,
}: PreviewPanelFrameProps) {
  const [showOverlay, setShowOverlay] = useState(false);
  const [showTopBar, setShowTopBar] = useState(false);
  const overlayTimerRef = useRef<number | null>(null);
  const hardCapTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (overlayTimerRef.current) {
      window.clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = null;
    }
    if (hardCapTimerRef.current) {
      window.clearTimeout(hardCapTimerRef.current);
      hardCapTimerRef.current = null;
    }
    if (!isLoading) {
      setShowOverlay(false);
      setShowTopBar(false);
      return;
    }
    setShowTopBar(true);
    overlayTimerRef.current = window.setTimeout(() => {
      overlayTimerRef.current = null;
      setShowOverlay(true);
    }, LOADING_OVERLAY_DEBOUNCE_MS);
    hardCapTimerRef.current = window.setTimeout(() => {
      hardCapTimerRef.current = null;
      setShowOverlay(false);
      setShowTopBar(false);
    }, LOADING_OVERLAY_HARD_CAP_MS);
    return () => {
      if (overlayTimerRef.current) {
        window.clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = null;
      }
      if (hardCapTimerRef.current) {
        window.clearTimeout(hardCapTimerRef.current);
        hardCapTimerRef.current = null;
      }
    };
  }, [isLoading]);

  return (
    <div className="relative h-full overflow-hidden bg-gray-950">
      {showTopBar ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-transparent"
        >
          <div className="bg-primary/70 h-full w-full animate-pulse rounded-full" />
        </div>
      ) : null}
      {showOverlay ? (
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
        // allow-pointer-lock: required by R3F's OrbitControls + drei pointer-locking helpers.
        // allow-modals: lets generated apps use window.alert/confirm without silent failures.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-modals"
        title="Preview"
      />

      {children}
    </div>
  );
}
