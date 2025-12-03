"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, Loader2, Pause, Play } from "lucide-react";

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  demoUrl: string;
  templateName: string;
}

export function PreviewModal({
  isOpen,
  onClose,
  demoUrl,
  templateName,
}: PreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  // Auto-scroll function
  const startAutoScroll = useCallback(() => {
    if (!iframeRef.current?.contentWindow) return;

    setIsAutoScrolling(true);
    setIsPaused(false);

    const iframe = iframeRef.current;
    let scrollPosition = 0;
    const scrollSpeed = 2; // pixels per frame
    const totalDuration = 5000; // 5 seconds total
    const frameRate = 60;
    const totalFrames = (totalDuration / 1000) * frameRate;
    let currentFrame = 0;

    // Clear any existing interval
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
    }

    scrollIntervalRef.current = setInterval(() => {
      if (isPaused) return;

      try {
        const contentWindow = iframe.contentWindow;
        if (!contentWindow) return;

        // Try to scroll the iframe content
        contentWindow.postMessage(
          {
            type: "scroll",
            scrollTop: scrollPosition,
          },
          "*"
        );

        // Also try direct scroll (may work depending on same-origin)
        try {
          contentWindow.scrollTo({
            top: scrollPosition,
            behavior: "auto",
          });
        } catch {
          // Cross-origin restriction - use CSS transform fallback
        }

        scrollPosition += scrollSpeed;
        currentFrame++;

        // Stop after duration
        if (currentFrame >= totalFrames) {
          if (scrollIntervalRef.current) {
            clearInterval(scrollIntervalRef.current);
            scrollIntervalRef.current = null;
          }
          setIsAutoScrolling(false);
        }
      } catch (error) {
        console.error("[PreviewModal] Auto-scroll error:", error);
      }
    }, 1000 / frameRate);
  }, [isPaused]);

  // Stop auto-scroll on close
  useEffect(() => {
    if (!isOpen && scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
      setIsAutoScrolling(false);
    }
  }, [isOpen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
    };
  }, []);

  const handleIframeLoad = () => {
    setIsLoading(false);
    // Start auto-scroll after a short delay
    setTimeout(() => {
      startAutoScroll();
    }, 500);
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      {/* Modal container */}
      <div className="relative w-[90vw] h-[85vh] max-w-6xl bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl border border-zinc-700">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 h-14 bg-zinc-900/95 backdrop-blur border-b border-zinc-800 flex items-center justify-between px-4 z-10">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-white truncate">
              {templateName}
            </h3>
            {isAutoScrolling && (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                Auto-scrollar...
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Pause/Play button */}
            {isAutoScrolling && (
              <button
                onClick={togglePause}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                title={isPaused ? "Fortsätt" : "Pausa"}
              >
                {isPaused ? (
                  <Play className="h-5 w-5" />
                ) : (
                  <Pause className="h-5 w-5" />
                )}
              </button>
            )}

            {/* Restart scroll button */}
            {!isAutoScrolling && !isLoading && (
              <button
                onClick={startAutoScroll}
                className="px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Scrolla igen
              </button>
            )}

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 z-20">
            <Loader2 className="h-10 w-10 text-emerald-500 animate-spin mb-4" />
            <p className="text-zinc-400">Laddar preview...</p>
          </div>
        )}

        {/* Iframe container */}
        <div className="absolute top-14 left-0 right-0 bottom-0 overflow-hidden">
          <iframe
            ref={iframeRef}
            src={demoUrl}
            className="w-full h-full border-0"
            sandbox="allow-same-origin allow-scripts allow-forms allow-pointer-lock allow-popups"
            title={`Preview: ${templateName}`}
            onLoad={handleIframeLoad}
          />
        </div>

        {/* Gradient overlay at bottom for visual effect */}
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-zinc-900/50 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}

