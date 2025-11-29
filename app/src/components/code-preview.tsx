"use client";

import { useBuilderStore } from "@/lib/store";
import { HelpTooltip } from "@/components/help-tooltip";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Monitor,
  Tablet,
  Smartphone,
  Eye,
  Code,
  Copy,
  Check,
} from "lucide-react";
import { useState } from "react";

export function CodePreview() {
  const { currentCode, viewMode, deviceSize, setViewMode, setDeviceSize } =
    useBuilderStore();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (currentCode) {
      await navigator.clipboard.writeText(currentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
          <HelpTooltip text="Live-förhandsgranskning av din webbplats. Uppdateras automatiskt efter varje ändring." />
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
                  : "text-zinc-500"
              }`}
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
                  : "text-zinc-500"
              }`}
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
                  : "text-zinc-500"
              }`}
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
                  : "text-zinc-500"
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
                  : "text-zinc-500"
              }`}
            >
              <Code className="h-3.5 w-3.5" />
              Kod
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center bg-zinc-950/50 p-8 overflow-hidden">
        {viewMode === "preview" ? (
          <div
            className="bg-zinc-900 rounded-lg border border-zinc-800 h-full flex items-center justify-center transition-all duration-300 overflow-hidden"
            style={{
              width: getPreviewWidth(),
              maxWidth: "100%",
            }}
          >
            {currentCode ? (
              <div className="w-full h-full flex items-center justify-center p-8">
                <div className="text-center space-y-4">
                  <div className="text-6xl">🎨</div>
                  <p className="text-zinc-400 text-sm">
                    Live preview med Sandpack kommer i Fas 5
                  </p>
                  <p className="text-zinc-600 text-xs">
                    Kod genererad! Klicka på &quot;Kod&quot; för att se den.
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-4 p-8">
                <div className="flex justify-center gap-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="w-3 h-3 rounded-full bg-zinc-700 animate-pulse"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
                <p className="text-zinc-500 text-sm">Väntar på generering...</p>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
            {currentCode ? (
              <div className="h-full flex flex-col">
                {/* Code header */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-800/50">
                  <span className="text-sm text-zinc-400">page.tsx</span>
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
                {/* Code content */}
                <ScrollArea className="flex-1">
                  <pre className="p-4 text-sm text-zinc-300 font-mono">
                    <code>{currentCode}</code>
                  </pre>
                </ScrollArea>
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
