"use client";

import type { ReactNode, RefObject } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Mascot } from "@/components/mascot/Mascot";
import { cn } from "@/lib/utils";

function PreviewLoadingSkeleton() {
  return (
    <div className="flex w-full max-w-md flex-col gap-3 px-8" aria-hidden>
      <div className="h-2.5 w-2/3 rounded-full bg-muted motion-safe:animate-pulse" />
      <div className="h-2.5 w-full rounded-full bg-muted/80 motion-safe:animate-pulse motion-safe:[animation-delay:75ms]" />
      <div className="mt-2 h-40 w-full rounded-[var(--radius)] border border-border bg-muted/50 motion-safe:animate-pulse motion-safe:[animation-delay:150ms]" />
      <div className="flex gap-2">
        <div className="h-2 w-16 rounded-full bg-muted/70 motion-safe:animate-pulse" />
        <div className="h-2 w-12 rounded-full bg-muted/60 motion-safe:animate-pulse motion-safe:[animation-delay:50ms]" />
      </div>
    </div>
  );
}

function PreviewReloadIndicator() {
  return (
    <div
      className="pointer-events-none absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background/90 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="h-3 w-3 animate-spin text-primary/70" />
      <span>Uppdaterar</span>
    </div>
  );
}

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
  deviceMode?: "desktop" | "tablet" | "mobile";
  /**
   * True after the iframe has rendered at least once successfully. While false
   * we show the full Apple-ish loading skeleton; once true we only show a tiny
   * top-right spinner for subsequent reloads/navigations.
   */
  hasEverLoaded?: boolean;
  children?: ReactNode;
}

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
  deviceMode = "desktop",
  hasEverLoaded = false,
  children,
}: PreviewPanelFrameProps) {
  const isMobileFrame = deviceMode === "mobile";
  const isTabletFrame = deviceMode === "tablet";
  const isConstrainedFrame = isMobileFrame || isTabletFrame;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-muted/25">
      {isLoading && !hasEverLoaded ? (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/85 transition-opacity duration-200"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <Mascot
            slot="listening"
            size={120}
            decorative
            className="mb-4 motion-safe:animate-pulse motion-reduce:animate-none"
          />
          <PreviewLoadingSkeleton />
          <p className="mt-6 text-xs text-muted-foreground">Laddar…</p>
        </div>
      ) : isLoading ? (
        <PreviewReloadIndicator />
      ) : null}

      {iframeError ? (
        <div className="absolute inset-0 z-10 flex max-h-full flex-col items-center justify-center overflow-y-auto bg-background/95 p-4" role="alert" aria-live="assertive">
          <Mascot slot="error" size={120} decorative className="mb-4 shrink-0" />
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
              Öppna i ny flik eller be AI:n försöka igen om felet kvarstår.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={handleOpenInNewTab}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Öppna i ny flik
            </Button>
            {onFixPreview ? (
              <Button variant="outline" onClick={onFixPreview} disabled={isLoading}>
                Be AI:n försöka igen
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "relative min-h-0 flex-1 p-2 sm:p-3",
          isConstrainedFrame && "flex items-start justify-center overflow-auto pt-3 pb-4",
        )}
      >
        <div
          className={cn(
            "relative flex min-h-0 flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-sm ring-1 ring-border/40 transition-[max-width] duration-300 ease-out",
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
            style={{ backgroundColor: "#fafafa" }}
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="Preview"
          />
          {children}
        </div>
      </div>
    </div>
  );
}
