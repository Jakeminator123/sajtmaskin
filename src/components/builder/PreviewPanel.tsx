"use client";

import { AlertCircle, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface PreviewPanelProps {
  demoUrl: string | null;
  isLoading?: boolean;
}

export function PreviewPanel({ demoUrl, isLoading: externalLoading }: PreviewPanelProps) {
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);

  const handleIframeLoad = () => {
    setIframeLoading(false);
    setIframeError(false);
  };

  const handleIframeError = () => {
    setIframeLoading(false);
    setIframeError(true);
  };

  const handleRefresh = () => {
    setIframeLoading(true);
    setIframeError(false);
    const iframe = document.getElementById("preview-iframe") as HTMLIFrameElement | null;
    if (iframe) {
      iframe.src = iframe.src;
    }
  };

  const handleOpenInNewTab = () => {
    if (demoUrl) {
      window.open(demoUrl, "_blank", "noopener,noreferrer");
    }
  };

  if (!demoUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-black/20 text-gray-500">
        <AlertCircle className="h-12 w-12 mb-4" />
        <p className="text-lg font-medium mb-2">Ingen förhandsvisning ännu</p>
        <p className="text-sm">
          {externalLoading ? "AI tänker... preview kommer strax" : "Skapa något för att se preview"}
        </p>
      </div>
    );
  }

  const isLoading = externalLoading || iframeLoading;

  return (
    <div className="flex h-full flex-col bg-black/40">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2">
        <h3 className="font-semibold text-white">Preview</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isLoading}
            title="Uppdatera preview"
            className="text-gray-400 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenInNewTab}
            title="Öppna i ny flik"
            className="text-gray-400 hover:text-white"
          >
            <ExternalLink className="h-4 w-4 mr-1" />
            Öppna
          </Button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Laddar preview...</p>
            </div>
          </div>
        )}

        {iframeError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10 p-4">
            <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
            <p className="text-sm text-gray-400 mb-4 text-center">
              Preview kunde inte laddas i iframe. Öppna i ny flik istället.
            </p>
            <Button onClick={handleOpenInNewTab}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Öppna i ny flik
            </Button>
          </div>
        )}

        <iframe
          id="preview-iframe"
          src={demoUrl}
          className="h-full w-full border-0"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          title="Preview"
        />
      </div>
    </div>
  );
}
