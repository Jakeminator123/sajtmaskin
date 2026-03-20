"use client";

import { useState, useEffect } from "react";
import { X, ExternalLink, Loader2 } from "lucide-react";

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | null;
  title: string;
  /** If provided, shows a live iframe preview of the template */
  viewUrl?: string;
}

/**
 * PreviewModal
 * ------------
 * Shows a live iframe preview of the v0 template when viewUrl is provided.
 * Falls back to a static image preview when only imageUrl is available.
 */
export function PreviewModal({ isOpen, onClose, imageUrl, title, viewUrl }: PreviewModalProps) {
  const [iframeLoaded, setIframeLoaded] = useState(false);

  // Reset iframe loaded state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setIframeLoaded(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleOpenExternal = () => {
    if (viewUrl) {
      window.open(viewUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="relative flex h-[90vh] w-[90vw] max-w-6xl flex-col border border-gray-800 bg-black shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-4 py-3">
          <h3 className="truncate font-semibold text-white">{title}</h3>
          <div className="flex items-center gap-2">
            {viewUrl && (
              <button
                onClick={handleOpenExternal}
                className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
                aria-label="Oppna i nytt fonster"
              >
                <ExternalLink className="h-4 w-4" />
                <span className="hidden sm:inline">Oppna</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
              aria-label="Stang preview"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="relative min-h-0 flex-1">
          {viewUrl ? (
            <>
              {/* Loading spinner */}
              {!iframeLoaded && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black">
                  <Loader2 className="text-brand-teal h-8 w-8 animate-spin" />
                  <p className="text-sm text-gray-400">Laddar mall...</p>
                </div>
              )}
              {/* Live iframe preview */}
              <iframe
                src={viewUrl}
                title={title}
                className="h-full w-full border-0 bg-white"
                onLoad={() => setIframeLoaded(true)}
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              />
            </>
          ) : imageUrl ? (
            <div className="flex h-full items-center justify-center bg-black/80 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={title}
                className="max-h-full w-auto rounded border border-gray-800 shadow-xl"
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-center text-sm text-gray-400">
                Ingen forhandsbild finns annu for den har mallen.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
