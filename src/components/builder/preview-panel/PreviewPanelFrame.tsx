"use client";

import type { ReactNode, RefObject } from "react";
import { AlertCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  /** When mobile, iframe is inset with a phone-like max width. */
  deviceMode?: "desktop" | "mobile";
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
  children,
}: PreviewPanelFrameProps) {
  const isMobileFrame = deviceMode === "mobile";

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-muted/25">
      {isLoading ? (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/85 backdrop-blur-[2px] transition-opacity duration-200"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <PreviewLoadingSkeleton />
          <p className="mt-6 text-xs text-muted-foreground">Laddar…</p>
        </div>
      ) : null}

      {iframeError ? (
        <div className="absolute inset-0 z-10 flex max-h-full flex-col items-center justify-center overflow-y-auto bg-background/95 p-4">
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
          "relative min-h-0 flex-1 p-2 sm:p-3",
          isMobileFrame && "flex items-start justify-center overflow-auto pt-3 pb-4",
        )}
      >
        <div
          className={cn(
            "relative flex min-h-0 flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-sm ring-1 ring-border/40",
            isMobileFrame ? "h-[min(100%,720px)] w-full max-w-[390px] shadow-md" : "h-full w-full",
          )}
        >
          <iframe
            id="preview-iframe"
            ref={iframeRef}
            src={previewSrc}
            className="h-full min-h-0 w-full flex-1 border-0 bg-background"
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
