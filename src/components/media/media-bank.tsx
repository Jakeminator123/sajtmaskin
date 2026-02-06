"use client";

/**
 * MediaBank Component
 * ===================
 *
 * A "staging area" for generated and uploaded media during a session.
 * This is TEMPORARY storage that lives in React state.
 * For PERSISTENT storage, see MediaLibraryPanel and the media_library database table.
 *
 * Users can:
 * - See all generated images (from orchestrator)
 * - See uploaded files (images, videos, PDFs, text files, logos)
 * - Drag items to the prompt or click "Use in site"
 * - Copy URLs for manual use
 *
 * This prevents the need to regenerate code just to add a file.
 */

import { useState, useCallback } from "react";
import {
  Image as ImageIcon,
  Video,
  Trash2,
  Copy,
  Check,
  Plus,
  ChevronDown,
  ChevronUp,
  Wand2,
  Upload,
  GripVertical,
  FileText,
  FileType,
  Shapes,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/utils";

// ============================================================================
// TYPES
// ============================================================================

export type MediaFileType = "image" | "video" | "pdf" | "text" | "logo" | "other";

export interface MediaItem {
  id: string;
  type: MediaFileType;
  url: string; // Public URL (blob or local)
  base64?: string; // Fallback if no URL (for AI-generated images)
  prompt?: string; // What was used to generate it (for AI images)
  filename?: string;
  mimeType?: string;
  createdAt: Date;
  source: "generated" | "uploaded";
  description?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the appropriate icon component for a file type
 */
function getFileTypeIcon(type: MediaFileType) {
  switch (type) {
    case "image":
      return ImageIcon;
    case "video":
      return Video;
    case "pdf":
      return FileText;
    case "text":
      return FileType;
    case "logo":
      return Shapes;
    default:
      return FileText;
  }
}

/**
 * Determine file type from MIME type string
 */
function getFileTypeFromMime(mimeType: string): MediaFileType {
  if (mimeType.startsWith("image/")) {
    // SVG and icon files are typically logos
    if (mimeType.includes("svg") || mimeType.includes("icon")) {
      return "logo";
    }
    return "image";
  }
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/") || mimeType === "application/json") {
    return "text";
  }
  return "other";
}

// ============================================================================
// MEDIA BANK COMPONENT
// ============================================================================

interface MediaBankProps {
  items: MediaItem[];
  onRemove: (id: string) => void;
  onUseInPrompt: (item: MediaItem) => void;
  onAddToSite: (item: MediaItem) => void;
  disabled?: boolean;
  className?: string;
}

export function MediaBank({
  items,
  onRemove,
  onUseInPrompt,
  onAddToSite,
  disabled = false,
  className,
}: MediaBankProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [draggedItem, setDraggedItem] = useState<MediaItem | null>(null);

  const handleCopyUrl = useCallback((item: MediaItem) => {
    const url = item.url || `data:image/png;base64,${item.base64}`;
    navigator.clipboard.writeText(url);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, item: MediaItem) => {
    setDraggedItem(item);
    e.dataTransfer.setData("text/plain", item.url || "");
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        id: item.id,
        url: item.url,
        prompt: item.prompt,
        type: item.type,
        filename: item.filename,
        mimeType: item.mimeType,
      }),
    );
    e.dataTransfer.effectAllowed = "copy";
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
  }, []);

  // Separate items by source for grouped display
  const generatedItems = items.filter((i) => i.source === "generated");
  const uploadedItems = items.filter((i) => i.source === "uploaded");

  // Don't render if empty
  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className={cn("overflow-hidden rounded-lg border border-gray-800 bg-gray-900/50", className)}
    >
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-3 transition-colors hover:bg-gray-800/50"
      >
        <div className="flex items-center gap-2">
          <Wand2 className="text-brand-blue h-4 w-4" />
          <span className="text-sm font-medium text-white">Mediabank ({items.length})</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="space-y-3 p-3 pt-0">
          {/* Generated images section */}
          {generatedItems.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1 text-xs text-gray-500">
                <Wand2 className="h-3 w-3" />
                Genererade ({generatedItems.length})
              </p>
              <div className="grid grid-cols-3 gap-2">
                {generatedItems.map((item) => (
                  <MediaItemCard
                    key={item.id}
                    item={item}
                    onCopy={() => handleCopyUrl(item)}
                    onRemove={() => onRemove(item.id)}
                    onUseInPrompt={() => onUseInPrompt(item)}
                    onAddToSite={() => onAddToSite(item)}
                    isCopied={copiedId === item.id}
                    isDragging={draggedItem?.id === item.id}
                    onDragStart={(e) => handleDragStart(e, item)}
                    onDragEnd={handleDragEnd}
                    disabled={disabled}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Uploaded files section */}
          {uploadedItems.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1 text-xs text-gray-500">
                <Upload className="h-3 w-3" />
                Uppladdade ({uploadedItems.length})
              </p>
              <div className="grid grid-cols-3 gap-2">
                {uploadedItems.map((item) => (
                  <MediaItemCard
                    key={item.id}
                    item={item}
                    onCopy={() => handleCopyUrl(item)}
                    onRemove={() => onRemove(item.id)}
                    onUseInPrompt={() => onUseInPrompt(item)}
                    onAddToSite={() => onAddToSite(item)}
                    isCopied={copiedId === item.id}
                    isDragging={draggedItem?.id === item.id}
                    onDragStart={(e) => handleDragStart(e, item)}
                    onDragEnd={handleDragEnd}
                    disabled={disabled}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Help text */}
          <p className="px-1 text-left text-[10px] text-gray-600">
            Dra filer till prompten eller klicka för att använda
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MEDIA ITEM CARD COMPONENT
// ============================================================================

interface MediaItemCardProps {
  item: MediaItem;
  onCopy: () => void;
  onRemove: () => void;
  onUseInPrompt: () => void;
  onAddToSite: () => void;
  isCopied: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  disabled: boolean;
}

function MediaItemCard({
  item,
  onCopy,
  onRemove,
  onAddToSite,
  isCopied,
  isDragging,
  onDragStart,
  onDragEnd,
  disabled,
}: MediaItemCardProps) {
  const [showActions, setShowActions] = useState(false);

  // Get image source - prefer URL, fallback to base64 data URL
  const imageSrc = item.url || `data:image/png;base64,${item.base64}`;
  const hasUrl = !!item.url;
  const Icon = getFileTypeIcon(item.type);

  return (
    <div
      draggable={!disabled}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      className={cn(
        "relative aspect-square cursor-grab overflow-hidden rounded-lg border transition-all",
        isDragging ? "border-brand-blue opacity-50" : "border-gray-700 hover:border-gray-600",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {/* Preview based on file type */}
      {item.type === "image" || item.type === "logo" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt={item.prompt || item.filename || "Media"}
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : item.type === "video" ? (
        <div className="flex h-full w-full items-center justify-center bg-gray-800">
          <Video className="h-8 w-8 text-gray-500" />
        </div>
      ) : (
        // PDF, text, and other files show icon + filename
        <div className="flex h-full w-full flex-col items-center justify-center bg-gray-800 p-2">
          <Icon className="mb-1 h-8 w-8 text-gray-500" />
          <span className="w-full truncate px-2 text-left text-[10px] text-gray-500">
            {item.filename || "File"}
          </span>
        </div>
      )}

      {/* Drag handle indicator (top-left) */}
      <div className="absolute top-1 left-1 rounded bg-black/50 p-1">
        <GripVertical className="h-3 w-3 text-white/70" />
      </div>

      {/* Source badge (top-right) - AI generated or user uploaded */}
      <div
        className={cn(
          "absolute top-1 right-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
          item.source === "generated"
            ? "bg-brand-blue/80 text-white"
            : "bg-brand-teal/80 text-white",
        )}
      >
        {item.source === "generated" ? "AI" : "↑"}
      </div>

      {/* Warning badge if image has no persistent URL */}
      {!hasUrl && (
        <div className="bg-brand-amber/80 absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[10px] text-white">
          Ej sparad
        </div>
      )}

      {/* Actions overlay on hover */}
      {showActions && !disabled && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 p-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onAddToSite();
            }}
            className="hover:bg-brand-blue/90 h-6 w-full text-[10px] text-white"
          >
            <Plus className="mr-1 h-3 w-3" />
            Lägg till i sajten
          </Button>

          <div className="flex w-full gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onCopy();
              }}
              className="h-6 flex-1 text-[10px] text-white hover:bg-gray-700"
            >
              {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="h-6 flex-1 text-[10px] text-red-400 hover:bg-red-500/20"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MEDIA BANK HOOK
// ============================================================================

/**
 * Hook to manage media bank state (temporary session storage)
 * This is for items shown in the chat UI during a session.
 * For persistent storage, files should be uploaded via /api/media/upload
 */
export function useMediaBank() {
  const [items, setItems] = useState<MediaItem[]>([]);

  /**
   * Add an AI-generated image to the media bank
   */
  const addGeneratedImage = useCallback(
    (image: { base64: string; prompt: string; url?: string }) => {
      const newItem: MediaItem = {
        id: `gen-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: "image",
        url: image.url || "",
        base64: image.base64,
        prompt: image.prompt,
        createdAt: new Date(),
        source: "generated",
      };
      setItems((prev) => [...prev, newItem]);
      return newItem;
    },
    [],
  );

  /**
   * Add a user-uploaded file to the media bank
   */
  const addUploadedFile = useCallback(
    (file: {
      url: string;
      filename: string;
      mimeType: string;
      fileType?: MediaFileType;
      description?: string;
    }) => {
      // Determine file type from MIME or use provided type
      const type: MediaFileType = file.fileType || getFileTypeFromMime(file.mimeType);

      const newItem: MediaItem = {
        id: `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type,
        url: file.url,
        filename: file.filename,
        mimeType: file.mimeType,
        description: file.description,
        createdAt: new Date(),
        source: "uploaded",
      };
      setItems((prev) => [...prev, newItem]);
      return newItem;
    },
    [],
  );

  /**
   * Remove an item from the media bank by ID
   */
  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  /**
   * Clear all items from the media bank
   */
  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  return {
    items,
    addGeneratedImage,
    addUploadedFile,
    removeItem,
    clearAll,
  };
}
