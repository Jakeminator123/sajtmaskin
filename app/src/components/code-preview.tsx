"use client";

import { useBuilderStore } from "@/lib/store";
import {
  parseCodeToSandpackFiles,
  convertV0FilesToSandpack,
} from "@/lib/code-parser";
import { HelpTooltip } from "@/components/help-tooltip";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sandpack,
  SandpackProvider,
  SandpackPreview,
  SandpackCodeEditor,
} from "@codesandbox/sandpack-react";
import {
  Monitor,
  Tablet,
  Smartphone,
  Eye,
  Code,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";

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
    viewMode,
    deviceSize,
    isLoading,
    setViewMode,
    setDeviceSize,
  } = useBuilderStore();
  const [copied, setCopied] = useState(false);
  const [sandpackError, setSandpackError] = useState<string | null>(null);

  // Convert files to Sandpack format with error handling
  // Prefer using structured files from v0-sdk if available
  const sandpackFiles = useMemo(() => {
    try {
      // If we have structured files from v0-sdk, use them directly
      if (files && files.length > 0) {
        console.log("[CodePreview] Using v0-sdk files, count:", files.length);
        const result = convertV0FilesToSandpack(files);
        console.log(
          "[CodePreview] Converted files:",
          Object.keys(result).filter((k) => {
            const file = result[k];
            return typeof file === "string" || !file?.hidden;
          })
        );
        setSandpackError(null);
        return result;
      }

      // Fallback: parse single code string (for backward compatibility)
      console.log(
        "[CodePreview] Falling back to parseCodeToSandpackFiles, code length:",
        currentCode?.length || 0
      );
      const parsedFiles = parseCodeToSandpackFiles(currentCode || "");
      console.log("[CodePreview] Parsed files:", Object.keys(parsedFiles));
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

  // Log when currentCode changes
  useEffect(() => {
    if (currentCode) {
      console.log(
        "[CodePreview] currentCode updated, first 200 chars:",
        currentCode.substring(0, 200)
      );
    }
  }, [currentCode]);

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
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-zinc-500" />
          <span className="text-sm font-medium text-zinc-300">
            Förhandsgranskning
          </span>
          <HelpTooltip text="Live-förhandsgranskning av din webbplats. Uppdateras automatiskt efter varje ändring. Klicka på enhetsknapparna för att se hur den ser ut på olika skärmstorlekar." />
        </div>

        <div className="flex items-center gap-4">
          {/* Device size toggle */}
          <div className="flex items-center gap-1 p-1 bg-zinc-800/50 rounded-lg">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeviceSize("desktop")}
              className={`h-7 px-2 ${
                deviceSize === "desktop"
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Desktop"
            >
              <Monitor className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeviceSize("tablet")}
              className={`h-7 px-2 ${
                deviceSize === "tablet"
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Tablet (768px)"
            >
              <Tablet className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeviceSize("mobile")}
              className={`h-7 px-2 ${
                deviceSize === "mobile"
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
              title="Mobil (375px)"
            >
              <Smartphone className="h-4 w-4" />
            </Button>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 p-1 bg-zinc-800/50 rounded-lg">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("preview")}
              className={`h-7 px-3 gap-1.5 ${
                viewMode === "preview"
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("code")}
              className={`h-7 px-3 gap-1.5 ${
                viewMode === "code"
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Code className="h-3.5 w-3.5" />
              Kod
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center bg-zinc-950/50 p-4 overflow-hidden">
        {viewMode === "preview" ? (
          <div
            className="bg-zinc-900 rounded-lg border border-zinc-800 h-full transition-all duration-300 overflow-hidden flex flex-col"
            style={{
              width: getPreviewWidth(),
              maxWidth: "100%",
            }}
          >
            {isLoading ? (
              // Loading state
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center space-y-4">
                  <div className="flex justify-center gap-2">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </div>
                  <p className="text-zinc-400 text-sm">
                    AI:n genererar din webbplats...
                  </p>
                  <p className="text-zinc-600 text-xs">
                    Detta tar vanligtvis 15-30 sekunder
                  </p>
                </div>
              </div>
            ) : demoUrl ? (
              // v0's hosted preview (iframe) - most reliable
              <div className="flex-1 h-full overflow-hidden">
                <iframe
                  src={demoUrl}
                  className="w-full h-full border-0"
                  title="Website Preview"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-presentation"
                  allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; midi; payment; usb; xr-spatial-tracking"
                  referrerPolicy="no-referrer-when-downgrade"
                  loading="eager"
                />
              </div>
            ) : currentCode ? (
              // Fallback to Sandpack preview if no demoUrl
              <div className="flex-1 h-full overflow-hidden">
                {sandpackError ? (
                  // Error state
                  <div className="flex-1 flex items-center justify-center p-8">
                    <div className="text-center space-y-4">
                      <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
                      <p className="text-zinc-400 text-sm">
                        Kunde inte rendera förhandsvisning
                      </p>
                      <p className="text-zinc-600 text-xs max-w-xs">
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
                        "lucide-react": "^0.468.0",
                        "class-variance-authority": "^0.7.1",
                        clsx: "^2.1.1",
                        "tailwind-merge": "^2.6.0",
                      },
                    }}
                    options={{
                      externalResources: ["https://cdn.tailwindcss.com"],
                      classes: {
                        "sp-wrapper": "h-full",
                        "sp-layout": "h-full",
                        "sp-stack": "h-full",
                      },
                    }}
                  >
                    <SandpackPreview
                      showOpenInCodeSandbox={false}
                      showRefreshButton={true}
                      style={{ height: "100%", minHeight: "400px" }}
                    />
                  </SandpackProvider>
                )}
              </div>
            ) : (
              // Empty state
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center space-y-4">
                  <div className="flex justify-center gap-2">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="w-3 h-3 rounded-full bg-zinc-700 animate-pulse"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </div>
                  <p className="text-zinc-500 text-sm">
                    Väntar på generering...
                  </p>
                  <p className="text-zinc-600 text-xs">
                    Välj en kategori eller skriv en beskrivning
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          // Code view
          <div className="w-full h-full bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
            {currentCode ? (
              <div className="h-full flex flex-col">
                {/* Code header */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-800/50">
                  <span className="text-sm text-zinc-400">App.tsx</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="h-7 gap-1.5 text-zinc-400 hover:text-zinc-100"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-green-500" />
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
                <p className="text-zinc-500 text-sm">
                  Ingen kod genererad ännu
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
