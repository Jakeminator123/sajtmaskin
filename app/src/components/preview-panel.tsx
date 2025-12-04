"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  ExternalLink,
  Code,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Globe,
} from "lucide-react";

interface PreviewPanelProps {
  previewUrl?: string;
  lastUpdatedFile?: { path: string; content: string };
  generatedImage?: { base64: string; path: string };
  className?: string;
}

type ViewMode = "preview" | "code" | "image";

export function PreviewPanel({
  previewUrl,
  lastUpdatedFile,
  generatedImage,
  className,
}: PreviewPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(
    previewUrl ? "preview" : generatedImage ? "image" : "code"
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div
      className={cn(
        "flex flex-col bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden",
        isExpanded && "fixed inset-4 z-50",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-gray-900/80">
        <div className="flex items-center gap-2">
          {/* View mode tabs */}
          <div className="flex gap-0.5 bg-gray-800/50 p-0.5 rounded-md">
            {previewUrl && (
              <button
                onClick={() => setViewMode("preview")}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                  viewMode === "preview"
                    ? "bg-teal-500/20 text-teal-400"
                    : "text-gray-400 hover:text-gray-200"
                )}
              >
                <Globe className="h-3 w-3" />
                Preview
              </button>
            )}
            {lastUpdatedFile && (
              <button
                onClick={() => setViewMode("code")}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                  viewMode === "code"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "text-gray-400 hover:text-gray-200"
                )}
              >
                <Code className="h-3 w-3" />
                Kod
              </button>
            )}
            {generatedImage && (
              <button
                onClick={() => setViewMode("image")}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                  viewMode === "image"
                    ? "bg-pink-500/20 text-pink-400"
                    : "text-gray-400 hover:text-gray-200"
                )}
              >
                <ImageIcon className="h-3 w-3" />
                Bild
              </button>
            )}
          </div>

          {/* File path indicator */}
          {viewMode === "code" && lastUpdatedFile && (
            <span className="text-xs text-gray-500 font-mono">
              {lastUpdatedFile.path}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {viewMode === "preview" && previewUrl && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                className="h-7 w-7 p-0 text-gray-400 hover:text-white"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-gray-400 hover:text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </a>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 w-7 p-0 text-gray-400 hover:text-white"
          >
            {isExpanded ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {/* Preview iframe */}
        {viewMode === "preview" && previewUrl && (
          <iframe
            key={refreshKey}
            src={previewUrl}
            className="w-full h-full border-0 bg-white"
            title="Site preview"
          />
        )}

        {/* Code view */}
        {viewMode === "code" && lastUpdatedFile && (
          <div className="h-full overflow-auto p-4">
            <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
              <code>{lastUpdatedFile.content}</code>
            </pre>
          </div>
        )}

        {/* Image view */}
        {viewMode === "image" && generatedImage && (
          <div className="h-full flex items-center justify-center p-4 bg-[url('/grid-pattern.svg')] bg-repeat">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/png;base64,${generatedImage.base64}`}
              alt="Generated image"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
          </div>
        )}

        {/* Empty state */}
        {!previewUrl && !lastUpdatedFile && !generatedImage && (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center space-y-2">
              <Globe className="h-10 w-10 mx-auto opacity-30" />
              <p className="text-sm">Ingen preview tillgänglig</p>
              <p className="text-xs text-gray-600">
                Gör ändringar för att se preview
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
