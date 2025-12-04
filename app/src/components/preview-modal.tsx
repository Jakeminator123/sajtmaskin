"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, Loader2, Pause, Play } from "lucide-react";

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  demoUrl: string;
  templateName: string;
  templateId: string;
  onScreenshotCaptured?: () => void;
}

export function PreviewModal({
  isOpen,
  onClose,
  demoUrl,
  templateName,
  templateId,
  onScreenshotCaptured,
}: PreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<string | null>(null);
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPausedRef = useRef(false); // Ref to track pause state in interval
  const captureTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const statusClearTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onScreenshotCapturedRef = useRef(onScreenshotCaptured);

  // Keep ref updated with latest callback
  useEffect(() => {
    onScreenshotCapturedRef.current = onScreenshotCaptured;
  }, [onScreenshotCaptured]);

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
    isPausedRef.current = false;

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
      if (isPausedRef.current) return;

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
  }, []);

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
      if (captureTimeoutRef.current) {
        clearTimeout(captureTimeoutRef.current);
      }
      if (statusClearTimeoutRef.current) {
        clearTimeout(statusClearTimeoutRef.current);
      }
    };
  }, []);

  // Capture screenshot 3 seconds after modal opens
  useEffect(() => {
    if (!isOpen || !demoUrl || !templateId) return;

    // Clear any existing timeout
    if (captureTimeoutRef.current) {
      clearTimeout(captureTimeoutRef.current);
    }

    // Wait 12 seconds then capture screenshot (ensures template content is fully loaded)
    captureTimeoutRef.current = setTimeout(async () => {
      setIsCapturing(true);
      setCaptureStatus("Sparar förhandsvisning...");

      try {
        const response = await fetch("/api/template/screenshot/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId, demoUrl }),
        });

        const data = await response.json();

        if (data.success) {
          setCaptureStatus("✓ Sparad!");
          onScreenshotCapturedRef.current?.();
          // Clear status after 2 seconds
          if (statusClearTimeoutRef.current) {
            clearTimeout(statusClearTimeoutRef.current);
          }
          statusClearTimeoutRef.current = setTimeout(
            () => setCaptureStatus(null),
            2000
          );
        } else {
          setCaptureStatus("Kunde inte spara");
          if (statusClearTimeoutRef.current) {
            clearTimeout(statusClearTimeoutRef.current);
          }
          statusClearTimeoutRef.current = setTimeout(
            () => setCaptureStatus(null),
            3000
          );
        }
      } catch (error) {
        console.error("[PreviewModal] Screenshot capture error:", error);
        setCaptureStatus("Fel vid sparning");
        if (statusClearTimeoutRef.current) {
          clearTimeout(statusClearTimeoutRef.current);
        }
        statusClearTimeoutRef.current = setTimeout(
          () => setCaptureStatus(null),
          3000
        );
      } finally {
        setIsCapturing(false);
      }
    }, 12000);

    return () => {
      if (captureTimeoutRef.current) {
        clearTimeout(captureTimeoutRef.current);
      }
      if (statusClearTimeoutRef.current) {
        clearTimeout(statusClearTimeoutRef.current);
      }
    };
  }, [isOpen, demoUrl, templateId]);

  const handleIframeLoad = () => {
    setIsLoading(false);
    // Start auto-scroll after a short delay
    setTimeout(() => {
      startAutoScroll();
    }, 500);
  };

  const togglePause = () => {
    const newPaused = !isPaused;
    setIsPaused(newPaused);
    isPausedRef.current = newPaused;
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
      <div className="relative w-[90vw] h-[85vh] max-w-6xl bg-black overflow-hidden shadow-2xl border border-gray-800">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 h-14 bg-black/95 backdrop-blur border-b border-gray-800 flex items-center justify-between px-4 z-10">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-white truncate">
              {templateName}
            </h3>
            {isAutoScrolling && (
              <span className="text-xs text-teal-400 flex items-center gap-1">
                <span className="w-2 h-2 bg-teal-400 animate-pulse" />
                Auto-scrollar...
              </span>
            )}
            {captureStatus && (
              <span className="text-xs text-teal-400 flex items-center gap-1">
                {isCapturing && (
                  <span className="w-2 h-2 bg-teal-400 animate-pulse" />
                )}
                {captureStatus}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Pause/Play button */}
            {isAutoScrolling && (
              <button
                onClick={togglePause}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
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
                className="px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 transition-colors"
              >
                Scrolla igen
              </button>
            )}

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-20">
            <Loader2 className="h-10 w-10 text-teal-500 animate-spin mb-4" />
            <p className="text-gray-400">Laddar preview...</p>
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
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}
