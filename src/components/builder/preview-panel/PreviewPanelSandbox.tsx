"use client";

import type { ReactNode, RefObject } from "react";
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PreviewPanelSandboxProps {
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

export function PreviewPanelSandbox({
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
}: PreviewPanelSandboxProps) {
  return (
    <div className="relative flex-1 overflow-hidden bg-gray-950">
      {isLoading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80">
          <div className="text-center">
            <Loader2 className="text-primary mx-auto mb-2 h-8 w-8 animate-spin" />
            <p className="text-muted-foreground text-sm">Laddar preview...</p>
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
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title="Preview"
      />

      {children}
    </div>
  );
}
