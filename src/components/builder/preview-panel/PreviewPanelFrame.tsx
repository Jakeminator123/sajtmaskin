"use client";

import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  /**
   * Viewport size picker ("desktop" | "tablet" | "mobile") — when set to
   * "tablet" or "mobile" the iframe is wrapped in a constrained Apple-style
   * card so preview matches the target device width. Defaults to "desktop"
   * which fills the available area edge-to-edge.
   */
  deviceMode?: "desktop" | "tablet" | "mobile";
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
  versionMismatchPayload = null,
  onForceRestart,
  deviceMode = "desktop",
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

  const isMobileFrame = deviceMode === "mobile";
  const isTabletFrame = deviceMode === "tablet";
  const isConstrainedFrame = isMobileFrame || isTabletFrame;

  return (
    <div className="relative h-full overflow-hidden bg-muted/25">
      {topBarVisible ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-transparent"
        >
          <div className="bg-primary/70 h-full w-full animate-pulse rounded-full" />
        </div>
      ) : null}
      {overlayVisible ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/85 backdrop-blur-[1px] transition-opacity">
          <div className="text-center">
            <Loader2 className="text-primary mx-auto mb-2 h-6 w-6 animate-spin" />
            <p className="text-muted-foreground text-xs">Laddar...</p>
          </div>
        </div>
      ) : null}

      {iframeError ? (
        <div className="absolute inset-0 z-10 flex max-h-full flex-col items-center justify-center overflow-y-auto bg-background/95 p-4" role="alert" aria-live="assertive">
          <AlertCircle className="mb-4 h-12 w-12 shrink-0 text-destructive" />
          <p className="mb-2 max-w-lg text-center text-sm text-muted-foreground">
            {iframeErrorMessage || "Preview kunde inte laddas i iframe. Öppna i ny flik istället."}
          </p>
          {iframeDiagnosticCode ? (
            <p className="mb-2 font-mono text-[11px] text-muted-foreground/60">Kod: {iframeDiagnosticCode}</p>
          ) : null}
          {iframeRunbookLines.length > 0 ? (
            <ul className="mb-4 max-h-48 max-w-lg list-disc space-y-1.5 overflow-y-auto pl-5 text-left text-[11px] leading-snug text-muted-foreground/70">
              {iframeRunbookLines.map((line, idx) => (
                <li key={`${idx}-${line.slice(0, 48)}`}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-center text-xs text-muted-foreground/60">
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

      <div
        className={cn(
          "relative h-full w-full",
          isConstrainedFrame && "flex items-start justify-center overflow-auto p-3",
        )}
      >
        <div
          className={cn(
            "relative flex h-full min-h-0 flex-col overflow-hidden transition-[max-width] duration-300 ease-out",
            isConstrainedFrame
              ? "rounded-[var(--radius)] border border-border bg-card shadow-sm ring-1 ring-border/40"
              : "",
            isMobileFrame
              ? "h-[min(100%,720px)] w-full max-w-[390px] shadow-md"
              : isTabletFrame
                ? "h-[min(100%,900px)] w-full max-w-[768px] shadow-md"
                : "h-full w-full",
          )}
        >
          <iframe
            id="preview-iframe"
            ref={iframeRef}
            src={previewSrc}
            className="h-full min-h-0 w-full flex-1 border-0 bg-white"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            // allow-pointer-lock: required by R3F's OrbitControls + drei pointer-locking helpers.
            // allow-modals: lets generated apps use window.alert/confirm without silent failures.
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-modals"
            title="Preview"
          />
        </div>
      </div>

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
