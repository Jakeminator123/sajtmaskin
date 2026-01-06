"use client";

/**
 * CodePreview Component
 * =====================
 *
 * PREVIEW ARCHITECTURE (prioritetsordning):
 *
 * 1. v0 API iframe (demoUrl) - PRIMÄR METOD
 *    - Körs på Vercels servrar med alla beroenden
 *    - Fungerar för komplexa mallar (Three.js, d3, etc.)
 *    - Tar 15-30 sekunder att generera
 *    - ANVÄNDS ALLTID när demoUrl finns
 *
 * 2. Sandpack (in-browser) - BACKUP/FALLBACK
 *    - Körs i webbläsaren via CDN
 *    - Fungerar INTE bra för stora projekt
 *    - Problem: långsam (30-60s), saknade beroenden, kraschar ofta
 *    - ANVÄNDS ENDAST om demoUrl saknas (sällan)
 *
 * 3. Screenshot - SISTA UTVÄG
 *    - Statisk bild om iframe misslyckas
 *
 * Se: info/more/extra_info.txt för fullständig teknisk analys
 */

import { HelpTooltip } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  convertV0FilesToSandpack,
  parseCodeToSandpackFiles,
} from "@/lib/utils/code-parser";
import { useBuilderStore } from "@/lib/data/store";

// Sandpack - ENDAST FALLBACK, används sällan i praktiken
// Behålls som backup om v0 API skulle misslyckas
import { QrShare } from "@/components/forms";
import {
  SandpackCodeEditor,
  SandpackPreview,
  SandpackProvider,
} from "@codesandbox/sandpack-react";
import {
  AlertTriangle,
  Check,
  Code,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Image as ImageIcon,
  Info,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DesignModeOverlay } from "./design-mode-overlay";
import { AdvancedInspectorOverlay } from "./advanced-inspector-overlay";

// Custom dark theme matching the app's design
const customTheme = {
  colors: {
    surface1: "#0a0a0a",
    surface2: "#18181b",
    surface3: "#27272a",
    clickable: "#71717a",
    base: "#fafafa",
    disabled: "#52525b",
    hover: "#3f3f46",
    accent: "#3b82f6",
    error: "#ef4444",
    errorSurface: "#7f1d1d",
  },
  syntax: {
    plain: "#e4e4e7",
    comment: { color: "#71717a", fontStyle: "italic" as const },
    keyword: "#60a5fa",
    tag: "#34d399",
    punctuation: "#a1a1aa",
    definition: "#fbbf24",
    property: "#a78bfa",
    static: "#f472b6",
    string: "#4ade80",
  },
  font: {
    body: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: '"Fira Code", "JetBrains Mono", monospace',
    size: "14px",
    lineHeight: "1.6",
  },
};

export function CodePreview() {
  const {
    currentCode,
    files,
    demoUrl,
    screenshotUrl,
    chatId,
    versionId,
    viewMode,
    deviceSize,
    isLoading,
    lastRefreshTimestamp,
    setViewMode,
    setDeviceSize,
    setDemoUrl,
    // Design Mode is controlled from ChatPanel toolbar
    isDesignModeActive,
    toggleDesignMode,
    inspectorMode,
  } = useBuilderStore();
  const [copied, setCopied] = useState(false);
  const [sandpackError, setSandpackError] = useState<string | null>(null);
  const [iframeError, setIframeError] = useState(false);
  const [preferScreenshot, setPreferScreenshot] = useState(false);
  const [showPreviewInfo, setShowPreviewInfo] = useState(() => {
    // Check localStorage for dismissed state
    if (typeof window !== "undefined") {
      return localStorage.getItem("hidePreviewApiBanner") !== "true";
    }
    return true;
  });

  // Track last logged URL to reduce console spam (only log when URL actually changes)
  const lastLoggedUrlRef = useRef<string | null>(null);

  // Calculate the best route to show based on available files
  // If no root page exists, navigate to first available route
  const effectiveDemoUrl = useMemo(() => {
    if (!demoUrl || !files || files.length === 0) return demoUrl;

    // Check if root page exists
    const hasRootPage = files.some(
      (f) =>
        f.name === "app/page.tsx" ||
        f.name === "app/page.jsx" ||
        f.name === "page.tsx" ||
        f.name === "page.jsx" ||
        f.name === "pages/index.tsx" ||
        f.name === "pages/index.jsx"
    );

    if (hasRootPage) return demoUrl;

    // No root page - find first available route
    const pageFiles = files.filter(
      (f) =>
        (f.name.includes("/page.tsx") || f.name.includes("/page.jsx")) &&
        f.name.startsWith("app/")
    );

    if (pageFiles.length === 0) return demoUrl;

    // Extract route from first page file (e.g., "app/dashboard/page.tsx" -> "/dashboard")
    const firstPage = pageFiles[0].name;
    const routeMatch = firstPage.match(/^app\/(.+)\/page\.[jt]sx?$/);

    if (routeMatch) {
      const route = "/" + routeMatch[1];
      console.log("[CodePreview] No root page, auto-navigating to:", route);

      // Append route to demoUrl
      const url = new URL(demoUrl);
      url.pathname = route;
      return url.toString();
    }

    return demoUrl;
  }, [demoUrl, files]);

  // Dismiss banner and remember choice
  const dismissPreviewInfo = () => {
    setShowPreviewInfo(false);
    localStorage.setItem("hidePreviewApiBanner", "true");
  };

  // Filter out WebGL errors from v0's generated code (harmless but noisy)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const originalError = console.error;
    const originalWarn = console.warn;

    // Filter function to suppress known harmless WebGL errors from v0's iframe
    const shouldSuppress = (args: unknown[]): boolean => {
      const message = String(args[0] || "");
      return (
        message.includes("GL_INVALID_FRAMEBUFFER_OPERATION") ||
        message.includes("Framebuffer is incomplete") ||
        message.includes("Attachment has zero size") ||
        message.includes("WebGL: too many errors")
      );
    };

    // Override console.error to filter WebGL errors
    console.error = (...args: unknown[]) => {
      if (!shouldSuppress(args)) {
        originalError.apply(console, args);
      }
    };

    // Override console.warn to filter WebGL warnings
    console.warn = (...args: unknown[]) => {
      if (!shouldSuppress(args)) {
        originalWarn.apply(console, args);
      }
    };

    // Cleanup: restore original console methods
    return () => {
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  // Log iframe URL changes only when effectiveDemoUrl or timestamp actually changes
  useEffect(() => {
    if (!effectiveDemoUrl) return;

    const urlKey = `${effectiveDemoUrl}-${lastRefreshTimestamp}`;
    if (lastLoggedUrlRef.current === urlKey) return;

    lastLoggedUrlRef.current = urlKey;
    console.log("[CodePreview] Iframe URL changed:", {
      effectiveDemoUrl,
      originalDemoUrl: demoUrl,
      timestamp: lastRefreshTimestamp,
    });
  }, [effectiveDemoUrl, demoUrl, lastRefreshTimestamp]);

  // Reset preview fallbacks when effectiveDemoUrl changes (new version = try live iframe again)
  useEffect(() => {
    setIframeError(false);
    setPreferScreenshot(false);
  }, [effectiveDemoUrl]);

  // Handle download
  const handleDownload = () => {
    if (chatId && versionId) {
      window.open(
        `/api/download?chatId=${chatId}&versionId=${versionId}`,
        "_blank"
      );
    }
  };

  // Handle manual reload of iframe
  const handleReloadPreview = () => {
    if (demoUrl) {
      // Reset error state so iframe can be attempted again
      setIframeError(false);
      // Force reload by updating timestamp
      setDemoUrl(demoUrl);
    }
  };

  const handleOpenPreviewInNewTab = () => {
    const urlToOpen = effectiveDemoUrl || demoUrl;
    if (!urlToOpen) return;
    window.open(urlToOpen, "_blank", "noopener,noreferrer");
  };

  // Convert files to Sandpack format (BACKUP only - primary is v0's demoUrl iframe)
  const sandpackFiles = useMemo(() => {
    try {
      // If we have structured files from v0-sdk, use them
      if (files && files.length > 0) {
        const result = convertV0FilesToSandpack(files);
        setSandpackError(null);
        return result;
      }

      // Fallback: parse single code string (for backward compatibility)
      const parsedFiles = parseCodeToSandpackFiles(currentCode || "");
      setSandpackError(null);
      return parsedFiles;
    } catch (error) {
      console.error("[CodePreview] Error parsing code:", error);
      setSandpackError(
        error instanceof Error ? error.message : "Failed to parse code"
      );
      return parseCodeToSandpackFiles(""); // Return default files
    }
  }, [currentCode, files]);

  const handleCopy = async () => {
    if (currentCode) {
      await navigator.clipboard.writeText(currentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Get container width based on device size
  const getPreviewWidth = () => {
    switch (deviceSize) {
      case "tablet":
        return "768px";
      case "mobile":
        return "375px";
      default:
        return "100%";
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header - v0-inspired with URL bar */}
      <div className="border-b border-gray-800 bg-black/30">
        {/* Navigation row with URL bar */}
        <div className="flex items-center gap-2 p-2 border-b border-gray-800/50">
          {/* Browser dots */}
          <div className="flex items-center gap-1.5 px-2">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <div className="w-3 h-3 rounded-full bg-green-500/70" />
          </div>

          {/* URL bar */}
          <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-gray-900/80 border border-gray-700/50 rounded-lg">
            <Eye className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
            <input
              type="text"
              readOnly
              value={demoUrl || "Din webbplats visas här..."}
              placeholder="Din webbplats visas här..."
              className="flex-1 bg-transparent text-xs text-gray-400 outline-none truncate"
            />
            {demoUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenPreviewInNewTab}
                className="h-5 w-5 p-0 text-gray-500 hover:text-white"
                title="Öppna i ny flik"
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            )}
          </div>

          <HelpTooltip text="Live-förhandsgranskning av din webbplats. Uppdateras automatiskt efter varje ändring." />
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between px-3 py-2">
          {/* Device size toggle */}
          <div className="flex items-center gap-1 p-1 bg-gray-800/50 rounded-lg">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeviceSize("desktop")}
              className={`h-7 px-2 rounded-md transition-all ${
                deviceSize === "desktop"
                  ? "bg-gray-700 text-white"
                  : "text-gray-500 hover:text-gray-300"
              }`}
              title="Desktop"
            >
              <Monitor className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeviceSize("tablet")}
              className={`h-7 px-2 rounded-md transition-all ${
                deviceSize === "tablet"
                  ? "bg-gray-700 text-white"
                  : "text-gray-500 hover:text-gray-300"
              }`}
              title="Tablet (768px)"
            >
              <Tablet className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeviceSize("mobile")}
              className={`h-7 px-2 rounded-md transition-all ${
                deviceSize === "mobile"
                  ? "bg-gray-700 text-white"
                  : "text-gray-500 hover:text-gray-300"
              }`}
              title="Mobil (375px)"
            >
              <Smartphone className="h-4 w-4" />
            </Button>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 p-1 bg-gray-800/50 rounded-lg">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("preview")}
              className={`h-7 px-3 gap-1.5 rounded-md transition-all ${
                viewMode === "preview"
                  ? "bg-gray-700 text-white"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("code")}
              className={`h-7 px-3 gap-1.5 rounded-md transition-all ${
                viewMode === "code"
                  ? "bg-gray-700 text-white"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <Code className="h-3.5 w-3.5" />
              Kod
            </Button>
          </div>

          {/* Design Mode toggle moved to ChatPanel toolbar for cleaner UI */}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center bg-black/50 p-4 overflow-hidden relative">
        {/* Preview view - Keep in DOM to prevent iframe reload */}
        <div
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
            viewMode === "preview"
              ? "opacity-100 z-10"
              : "opacity-0 z-0 pointer-events-none"
          }`}
        >
          <div
            className="bg-black border border-gray-800 h-full transition-all duration-300 overflow-hidden flex flex-col"
            style={{
              width: getPreviewWidth(),
              maxWidth: "100%",
            }}
          >
            {isLoading ? (
              // Loading state with beautiful animation
              <div className="flex-1 flex items-center justify-center p-8 bg-black">
                <div className="text-center space-y-6">
                  {/* Animated rings */}
                  <div className="relative w-20 h-20 mx-auto">
                    <div className="absolute inset-0 border-2 border-teal-500/30 animate-ping" />
                    <div
                      className="absolute inset-2 border-2 border-teal-500/40 animate-ping"
                      style={{ animationDelay: "0.2s" }}
                    />
                    <div
                      className="absolute inset-4 border-2 border-teal-500/50 animate-ping"
                      style={{ animationDelay: "0.4s" }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-10 h-10 bg-teal-600 flex items-center justify-center">
                        <Code className="h-5 w-5 text-white" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-gray-200 text-base font-medium">
                      Skapar din webbplats...
                    </p>
                    <p className="text-gray-500 text-sm">
                      AI:n designar och bygger din sida
                    </p>
                    <p className="text-amber-400 text-xs">
                      Kan ta upp till 3–5 minuter för större projekt. Lämna
                      fliken öppen så laddas preview automatiskt när den är
                      klar.
                    </p>
                  </div>
                  {/* Progress dots */}
                  <div className="flex justify-center gap-1.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="w-2 h-2 bg-teal-500 animate-pulse"
                        style={{ animationDelay: `${i * 100}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : demoUrl ? (
              /**
               * v0's hosted preview (iframe)
               * ============================
               * The demoUrl points to v0's servers (vusercontent.net) where v0 hosts
               * the generated code. This is NOT local - it's fully managed by v0.
               * Note: v0 is owned by Vercel but runs on its own infrastructure.
               *
               * CACHE-BUSTING STRATEGY:
               * Problem: v0 may return the same demoUrl after refine, but content changed.
               *          Browser/React won't re-render if URL is identical.
               * Solution:
               * 1. key={demoUrl}-{timestamp} - Forces React to unmount/remount iframe
               * 2. ?v={timestamp} in src - Bypasses browser HTTP cache
               *
               * lastRefreshTimestamp updates automatically in store when setDemoUrl() is called.
               *
               * WEBGL ERRORS (from v0's generated code):
               * If you see "GL_INVALID_FRAMEBUFFER_OPERATION: Attachment has zero size" errors,
               * this is caused by Three.js in v0's generated code initializing before the canvas
               * has a proper size. This is a known issue with v0-generated Three.js projects.
               * The errors are harmless and don't affect functionality - they're just console noise.
               * We try to mitigate by ensuring iframe has proper size before load, but v0's code
               * runs independently and may still initialize too early.
               *
               * THREE.JS MULTIPLE INSTANCES WARNING:
               * You may see "THREE.WARNING: Multiple instances of Three.js being imported" in console.
               * This is normal - sajtmaskin uses Three.js for the avatar component, and v0's generated
               * code also uses Three.js. They run in separate contexts (main app vs iframe), so this
               * warning is harmless and doesn't cause conflicts. Each context has its own Three.js instance.
               */
              <div className="flex-1 h-full overflow-hidden relative">
                {/* Design Mode Overlay - Simple mode (category picker) */}
                {inspectorMode === "simple" && (
                  <DesignModeOverlay
                    isActive={isDesignModeActive}
                    onToggle={() => toggleDesignMode()}
                    onElementSelect={(_selector, description) => {
                      // Send to chat panel via store
                      const { setDesignModeInput, toggleDesignMode: toggle } =
                        useBuilderStore.getState();
                      setDesignModeInput(`Ändra ${description}: `);
                      toggle(false); // Close design mode after selection
                    }}
                    onManualSelect={(prompt) => {
                      // Send to chat panel via store
                      const { setDesignModeInput, toggleDesignMode: toggle } =
                        useBuilderStore.getState();
                      setDesignModeInput(`${prompt}: `);
                      toggle(false); // Close design mode after selection
                    }}
                    iframeSrc={effectiveDemoUrl || demoUrl || undefined}
                  />
                )}

                {/* Advanced Inspector Overlay - Element picking mode */}
                {inspectorMode === "advanced" && (
                  <AdvancedInspectorOverlay
                    isActive={isDesignModeActive}
                    onToggle={() => toggleDesignMode()}
                    demoUrl={effectiveDemoUrl || demoUrl}
                    onElementSelect={(description) => {
                      // Input is already set by AdvancedInspectorOverlay
                      console.log(
                        "[CodePreview] Element selected:",
                        description
                      );
                    }}
                  />
                )}

                {/* Info banner about preview limitations */}
                {showPreviewInfo && (
                  <div className="absolute top-0 left-0 right-0 z-20 bg-amber-900/95 border-b border-amber-700 px-3 py-2 flex items-start gap-2 text-xs">
                    <Info className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 text-amber-100">
                      <span className="font-medium">Preview-begränsning:</span>{" "}
                      Templates med AI-funktioner (bildgenerering etc.) kan visa
                      fel i preview. Din exporterade kod fungerar med dina
                      API-nycklar.
                    </div>
                    <button
                      onClick={dismissPreviewInfo}
                      className="text-amber-400 hover:text-amber-200 flex-shrink-0"
                      aria-label="Stäng"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {screenshotUrl && (preferScreenshot || iframeError) ? (
                  // Screenshot view (manual toggle OR automatic fallback if iframe fails)
                  <div className="flex-1 h-full flex flex-col items-center justify-center p-4 bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={screenshotUrl}
                      alt="Preview"
                      className="max-w-full max-h-[70%] shadow-2xl border border-gray-700"
                    />
                    <p className="text-gray-400 text-sm mt-4">
                      {iframeError
                        ? "Live-förhandsgranskning kunde inte laddas, visar skärmdump"
                        : "Visar skärmdump (klicka på bilden-ikonen för live preview)"}
                    </p>
                  </div>
                ) : !iframeError ? (
                  <>
                    {/*
                      Build cache-busted URL without breaking fragment identifiers.
                      Query params must come before the #fragment, so we insert ?v=... prior to the hash.
                      FIX: Use indexOf to preserve fragment exactly (including edge cases like trailing #)
                    */}
                    {(() => {
                      // Use effectiveDemoUrl which auto-navigates to first route if no root page
                      const urlToUse = effectiveDemoUrl || demoUrl;
                      // Safer hash handling: preserve exact fragment including empty hash
                      const hashIndex = urlToUse.indexOf("#");
                      const base =
                        hashIndex >= 0
                          ? urlToUse.slice(0, hashIndex)
                          : urlToUse;
                      const hashPart =
                        hashIndex >= 0 ? urlToUse.slice(hashIndex) : "";
                      const separator = base.includes("?") ? "&" : "?";
                      const cacheBustedUrl = `${base}${separator}v=${lastRefreshTimestamp}${hashPart}`;

                      return (
                        <iframe
                          key={`${urlToUse}-${lastRefreshTimestamp}`}
                          src={cacheBustedUrl}
                          className="w-full h-full border-0"
                          style={{ minWidth: "100%", minHeight: "100%" }}
                          title="Website Preview"
                          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-presentation"
                          allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; payment; usb; xr-spatial-tracking"
                          referrerPolicy="no-referrer-when-downgrade"
                          loading="eager"
                          onError={() => setIframeError(true)}
                          onLoad={(e) => {
                            // Ensure iframe has proper size before WebGL initialization
                            // This helps prevent "Framebuffer is incomplete: Attachment has zero size" errors
                            const iframe = e.currentTarget;
                            if (iframe.contentWindow) {
                              // Multiple resize triggers to help Three.js detect canvas size
                              // v0's generated code may have Three.js scenes in hidden sections (#timeline, etc.)
                              // that initialize before they're visible, causing WebGL errors
                              const triggerResize = () => {
                                try {
                                  iframe.contentWindow?.dispatchEvent(
                                    new Event("resize")
                                  );
                                } catch {
                                  // Cross-origin restrictions may prevent this, that's OK
                                }
                              };

                              // Trigger resize at multiple intervals to catch late-initializing Three.js scenes
                              setTimeout(triggerResize, 100);
                              setTimeout(triggerResize, 500);
                              setTimeout(triggerResize, 1000);
                            }
                          }}
                        />
                      );
                    })()}
                    {/* Loading overlay during refine/generation */}
                    {isLoading && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4 z-10">
                        <div className="bg-gray-900/90 border border-teal-500/30 rounded-lg p-6 shadow-2xl">
                          <div className="flex flex-col items-center gap-3">
                            <div className="flex gap-1.5">
                              {[0, 1, 2, 3, 4].map((i) => (
                                <div
                                  key={i}
                                  className="w-2 h-2 bg-teal-500 rounded-full animate-pulse"
                                  style={{ animationDelay: `${i * 100}ms` }}
                                />
                              ))}
                            </div>
                            <p className="text-gray-200 text-sm font-medium">
                              Uppdaterar förhandsgranskning...
                            </p>
                            <p className="text-gray-400 text-xs">
                              AI:n arbetar med dina ändringar
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex-1 h-full flex items-center justify-center">
                    <p className="text-gray-500">
                      Förhandsgranskning kunde inte laddas
                    </p>
                  </div>
                )}

                {/* Floating download button */}
                {/* Action buttons */}
                <div className="absolute bottom-4 right-4 flex gap-2">
                  {/* Manual reload button */}
                  {demoUrl && (
                    <Button
                      onClick={handleReloadPreview}
                      className="gap-2 bg-gray-700 hover:bg-gray-600 shadow-lg"
                      size="sm"
                      title="Ladda om förhandsgranskning"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                  {demoUrl && (
                    <Button
                      onClick={handleOpenPreviewInNewTab}
                      className="gap-2 bg-gray-700 hover:bg-gray-600 shadow-lg"
                      size="sm"
                      title="Öppna preview i ny flik"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                  {demoUrl && screenshotUrl && (
                    <Button
                      onClick={() => setPreferScreenshot((v) => !v)}
                      className="gap-2 bg-gray-700 hover:bg-gray-600 shadow-lg"
                      size="sm"
                      title={
                        preferScreenshot || iframeError
                          ? "Visa live preview"
                          : "Visa skärmdump"
                      }
                    >
                      {preferScreenshot || iframeError ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <ImageIcon className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  {demoUrl && <QrShare url={demoUrl} title="Dela preview" />}
                  {chatId && versionId && (
                    <Button
                      onClick={handleDownload}
                      className="gap-2 bg-teal-600 hover:bg-teal-500 shadow-lg"
                      size="sm"
                    >
                      <Download className="h-4 w-4" />
                      Ladda ner ZIP
                    </Button>
                  )}
                </div>
              </div>
            ) : currentCode ? (
              // Fallback to Sandpack preview if no demoUrl
              <div
                className="flex-1 flex flex-col min-h-0"
                style={{ height: "100%" }}
              >
                {sandpackError ? (
                  // Error state
                  <div className="flex-1 flex items-center justify-center p-8">
                    <div className="text-center space-y-4">
                      <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
                      <p className="text-gray-400 text-sm">
                        Kunde inte rendera förhandsvisning
                      </p>
                      <p className="text-gray-600 text-xs max-w-xs">
                        {sandpackError}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setViewMode("code")}
                        className="mt-2"
                      >
                        Visa kod istället
                      </Button>
                    </div>
                  </div>
                ) : (
                  <SandpackProvider
                    template="react-ts"
                    theme={customTheme}
                    files={sandpackFiles}
                    customSetup={{
                      dependencies: {
                        // Base dependencies
                        "lucide-react": "^0.468.0",
                        "class-variance-authority": "^0.7.1",
                        clsx: "^2.1.1",
                        "tailwind-merge": "^2.6.0",

                        // Radix UI (för shadcn/ui komponenter)
                        "@radix-ui/react-slot": "^1.1.1",
                        "@radix-ui/react-dialog": "^1.1.4",
                        "@radix-ui/react-dropdown-menu": "^2.1.4",
                        "@radix-ui/react-tabs": "^1.1.2",
                        "@radix-ui/react-tooltip": "^1.1.6",
                        "@radix-ui/react-slider": "^1.2.2",
                        "@radix-ui/react-accordion": "^1.2.2",
                        "@radix-ui/react-popover": "^1.1.4",
                        "@radix-ui/react-select": "^2.1.4",
                        "@radix-ui/react-checkbox": "^1.1.3",
                        "@radix-ui/react-switch": "^1.1.2",
                        "@radix-ui/react-scroll-area": "^1.2.2",
                        "@radix-ui/react-separator": "^1.1.1",
                        "@radix-ui/react-label": "^2.1.1",
                        "@radix-ui/react-avatar": "^1.1.2",
                        "@radix-ui/react-progress": "^1.1.1",
                        "@radix-ui/react-navigation-menu": "^1.2.3",
                        "@radix-ui/react-toast": "^1.2.4",
                        "@radix-ui/react-toggle": "^1.1.1",
                        "@radix-ui/react-toggle-group": "^1.1.1",

                        // Charts & visualization
                        recharts: "^2.15.0",
                        d3: "^7.9.0",
                        "topojson-client": "^3.1.0",

                        // 3D
                        three: "^0.170.0",
                        "@react-three/fiber": "^8.17.0",
                        "@react-three/drei": "^9.117.0",

                        // UI libraries
                        cmdk: "^1.0.4",
                        sonner: "^1.7.0",
                        vaul: "^0.9.0",
                        "embla-carousel-react": "^8.5.0",
                        "framer-motion": "^11.15.0",
                        motion: "^11.15.0",

                        // Form & validation
                        zod: "^3.24.0",
                        "react-hook-form": "^7.54.0",
                        "@hookform/resolvers": "^3.10.0",

                        // Utils
                        "date-fns": "^4.1.0",
                        "next-themes": "^0.4.4",
                        "tailwindcss-animate": "^1.0.7",
                      },
                    }}
                    options={{
                      externalResources: ["https://cdn.tailwindcss.com"],
                      classes: {
                        "sp-wrapper": "!h-full",
                        "sp-layout": "!h-full !min-h-0",
                        "sp-stack": "!h-full !min-h-0",
                        "sp-preview-container": "!h-full !bg-white",
                        "sp-preview-iframe": "!h-full",
                      },
                    }}
                  >
                    <div className="h-full min-h-[500px] flex flex-col">
                      <SandpackPreview
                        showOpenInCodeSandbox={false}
                        showRefreshButton={true}
                        style={{
                          flex: 1,
                          height: "100%",
                          minHeight: "500px",
                          backgroundColor: "white",
                        }}
                      />
                    </div>
                  </SandpackProvider>
                )}
              </div>
            ) : (
              // Empty state with beautiful design
              <div className="flex-1 flex items-center justify-center p-8 bg-black/50">
                <div className="text-center space-y-6 max-w-md">
                  {/* Icon with gradient background */}
                  <div className="w-16 h-16 mx-auto bg-gray-900 border border-gray-800 flex items-center justify-center">
                    <Eye className="h-8 w-8 text-gray-500" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-medium text-gray-300">
                      Förhandsgranskning
                    </h3>
                    <p className="text-gray-500 text-sm">
                      Din webbplats visas här när AI:n har genererat den
                    </p>
                  </div>
                  {/* Decorative dots */}
                  <div className="flex justify-center gap-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="w-2 h-2 bg-gray-700" />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Code view - Keep in DOM alongside preview */}
        <div
          className={`absolute inset-0 transition-opacity duration-200 ${
            viewMode === "code"
              ? "opacity-100 z-10"
              : "opacity-0 z-0 pointer-events-none"
          }`}
        >
          <div className="w-full h-full bg-black border border-gray-800 overflow-hidden">
            {currentCode ? (
              <div className="h-full flex flex-col">
                {/* Code header */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-800/50">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewMode("preview")}
                      className="h-7 px-3 gap-1.5 text-gray-400 hover:text-white"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Tillbaka till Preview
                    </Button>
                    <span className="text-sm text-gray-400">App.tsx</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="h-7 gap-1.5 text-gray-400 hover:text-white"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-teal-500" />
                        Kopierat!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Kopiera
                      </>
                    )}
                  </Button>
                </div>
                {/* Code content with Sandpack editor */}
                <div className="flex-1 overflow-hidden">
                  <SandpackProvider
                    template="react-ts"
                    theme={customTheme}
                    files={sandpackFiles}
                    options={{
                      activeFile: "/App.tsx",
                    }}
                  >
                    <SandpackCodeEditor
                      showTabs={true}
                      showLineNumbers={true}
                      showInlineErrors={true}
                      wrapContent={false}
                      closableTabs={false}
                      style={{ height: "100%" }}
                    />
                  </SandpackProvider>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-gray-500 text-sm">
                  Ingen kod genererad ännu
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
