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
  Loader2,
} from "lucide-react";

interface PreviewPanelProps {
  previewUrl?: string;
  lastUpdatedFile?: { path: string; content: string };
  generatedImage?: { base64: string; path: string };
  projectFiles?: { path: string; content: string }[];
  isLoading?: boolean;
  className?: string;
  projectId?: string; // For regenerating preview
  onPreviewGenerated?: (demoUrl: string) => void; // Callback when new preview is ready
}

type ViewMode = "preview" | "code" | "image" | "files";

export function PreviewPanel({
  previewUrl,
  lastUpdatedFile,
  generatedImage,
  projectFiles = [],
  isLoading = false,
  className,
  projectId,
  onPreviewGenerated,
}: PreviewPanelProps) {
  // Default to "code" view when there are files but no live preview URL
  // This ensures users see their AI changes immediately instead of stale v0 preview
  const initialViewMode: ViewMode = previewUrl
    ? "preview"
    : generatedImage
    ? "image"
    : projectFiles.length > 0 || lastUpdatedFile
    ? "code"
    : "preview";

  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [isExpanded, setIsExpanded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | undefined>(
    previewUrl
  );

  // Use local preview URL if we've regenerated, otherwise use prop
  const activePreviewUrl = localPreviewUrl || previewUrl;

  // Get the file to display - either the last updated one or selected from project files
  const displayFile =
    lastUpdatedFile ||
    (projectFiles.length > 0 ? projectFiles[selectedFileIndex] : undefined);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  // Regenerate live preview using v0 API
  const handleRegeneratePreview = async () => {
    if (!projectId || isRegenerating) return;

    setIsRegenerating(true);
    setRegenerateError(null);

    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/preview`,
        {
          method: "POST",
        }
      );

      const data = await response.json();

      if (data.success && data.demoUrl) {
        setLocalPreviewUrl(data.demoUrl);
        setViewMode("preview");
        setRefreshKey((prev) => prev + 1);
        onPreviewGenerated?.(data.demoUrl);
      } else {
        setRegenerateError(data.error || "Kunde inte generera preview");
      }
    } catch (error) {
      setRegenerateError(
        error instanceof Error ? error.message : "Nätverksfel"
      );
    } finally {
      setIsRegenerating(false);
    }
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
            {activePreviewUrl && (
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
            {(displayFile || projectFiles.length > 0) && (
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
            {projectFiles.length > 1 && (
              <button
                onClick={() => setViewMode("files")}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                  viewMode === "files"
                    ? "bg-blue-500/20 text-blue-400"
                    : "text-gray-400 hover:text-gray-200"
                )}
              >
                <Code className="h-3 w-3" />
                Filer ({projectFiles.length})
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
          {viewMode === "code" && displayFile && (
            <span className="text-xs text-gray-500 font-mono">
              {displayFile.path}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Single refresh/regenerate button */}
          {projectId && projectFiles.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={
                activePreviewUrl ? handleRefresh : handleRegeneratePreview
              }
              disabled={isRegenerating}
              className="h-7 w-7 p-0 text-gray-400 hover:text-white"
              title={activePreviewUrl ? "Ladda om preview" : "Generera preview"}
            >
              {isRegenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
          {activePreviewUrl && (
            <a
              href={activePreviewUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-gray-400 hover:text-white"
                title="Öppna i ny flik"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </a>
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

      {/* Regenerate error message */}
      {regenerateError && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-xs text-red-400">
          {regenerateError}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {/* Loading state */}
        {isLoading && (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center space-y-2">
              <div className="animate-spin h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto" />
              <p className="text-sm">Laddar projektfiler...</p>
            </div>
          </div>
        )}

        {/* Preview iframe */}
        {!isLoading && viewMode === "preview" && activePreviewUrl && (
          <iframe
            key={refreshKey}
            src={activePreviewUrl}
            className="w-full h-full border-0 bg-white"
            title="Site preview"
          />
        )}

        {/* Code view */}
        {!isLoading && viewMode === "code" && displayFile && (
          <div className="h-full overflow-auto p-4">
            <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
              <code>{displayFile.content}</code>
            </pre>
          </div>
        )}

        {/* Files list view */}
        {!isLoading && viewMode === "files" && projectFiles.length > 0 && (
          <div className="h-full overflow-auto">
            <div className="divide-y divide-gray-800">
              {projectFiles.map((file, index) => (
                <button
                  key={file.path}
                  onClick={() => {
                    setSelectedFileIndex(index);
                    setViewMode("code");
                  }}
                  className={cn(
                    "w-full px-4 py-3 text-left hover:bg-gray-800/50 transition-colors",
                    selectedFileIndex === index && "bg-gray-800/30"
                  )}
                >
                  <p className="text-sm text-gray-300 font-mono">{file.path}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {file.content.length} tecken
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Image view */}
        {!isLoading && viewMode === "image" && generatedImage && (
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
        {!isLoading &&
          !activePreviewUrl &&
          !displayFile &&
          !generatedImage &&
          projectFiles.length === 0 && (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center space-y-2">
                <Globe className="h-10 w-10 mx-auto opacity-30" />
                <p className="text-sm">Inga filer hittades</p>
                <p className="text-xs text-gray-600">
                  Projektet verkar vara tomt
                </p>
              </div>
            </div>
          )}

        {/* Show hint to generate preview when only code is visible */}
        {!isLoading &&
          !activePreviewUrl &&
          projectFiles.length > 0 &&
          viewMode === "code" &&
          projectId && (
            <div className="absolute bottom-4 left-4 right-4 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
              <div className="flex items-center justify-between">
                <p className="text-xs text-purple-300">
                  Generera en live preview för att se resultatet
                </p>
                <Button
                  size="sm"
                  onClick={handleRegeneratePreview}
                  disabled={isRegenerating}
                  className="h-7 gap-1 bg-purple-600 hover:bg-purple-500 text-white text-xs"
                >
                  {isRegenerating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Generera
                </Button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
