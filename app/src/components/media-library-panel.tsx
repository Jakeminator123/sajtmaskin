"use client";

/**
 * MediaLibraryPanel Component
 * ============================
 *
 * A comprehensive media library panel that allows users to:
 * - Upload files (images, videos, PDFs, text files, logos)
 * - Browse their media collection
 * - Drag files to chat or preview
 * - Delete files
 * - Filter by type
 *
 * LIMITS (per user):
 * - Max 10 images/logos
 * - Max 3 videos
 * - Text/PDF files don't count towards limits
 *
 * This is a PERSISTENT library stored in the database.
 * Users can only see their own files.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Upload as UploadIcon,
  Image as ImageIcon,
  Video,
  FileText,
  Shapes,
  Trash2,
  Loader2,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  GripVertical,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MediaFileType, MediaItem } from "./media-bank";
import { StockPhotoSearch } from "./stock-photo-search";

// ============================================================================
// CONSTANTS - User limits
// ============================================================================

const MAX_IMAGES = 10; // Includes images and logos
const MAX_VIDEOS = 3;

// ============================================================================
// TYPES
// ============================================================================

interface MediaLibraryPanelProps {
  projectId?: string;
  onFileSelect?: (item: MediaItem) => void;
  className?: string;
  collapsed?: boolean;
}

interface UploadedMediaItem {
  id: number;
  url: string;
  filename: string;
  mimeType: string;
  fileType: MediaFileType;
  size: number;
  description?: string;
  tags?: string[];
  createdAt: string;
}

interface MediaCounts {
  images: number; // Includes logos
  videos: number;
  other: number; // PDFs, text files - no limit
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getFileTypeIcon(type: MediaFileType) {
  switch (type) {
    case "image":
      return ImageIcon;
    case "video":
      return Video;
    case "logo":
      return Shapes;
    default:
      return ImageIcon;
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function MediaLibraryPanel({
  projectId,
  onFileSelect,
  className,
  collapsed = false,
}: MediaLibraryPanelProps) {
  const [isExpanded, setIsExpanded] = useState(!collapsed);
  const [items, setItems] = useState<UploadedMediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<MediaFileType | "all">("all");
  const [draggedItem, setDraggedItem] = useState<UploadedMediaItem | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate current counts for limit checking
  const counts: MediaCounts = {
    images: items.filter((i) => i.fileType === "image" || i.fileType === "logo")
      .length,
    videos: items.filter((i) => i.fileType === "video").length,
    other: items.filter(
      (i) =>
        i.fileType === "pdf" || i.fileType === "text" || i.fileType === "other"
    ).length,
  };

  /**
   * Load media library from API
   * Only loads the current user's files (enforced by API)
   */
  const loadMediaLibrary = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      // Note: projectId filter removed for security - API only returns user's own files
      if (filterType !== "all") params.append("fileType", filterType);

      const response = await fetch(`/api/media/upload?${params}`);
      const data = await response.json();

      if (data.success) {
        setItems(data.items);
      } else {
        setError(data.error || "Kunde inte ladda mediabiblioteket");
      }
    } catch (err) {
      console.error("[MediaLibrary] Failed to load:", err);
      setError("Kunde inte ladda mediabiblioteket");
    } finally {
      setIsLoading(false);
    }
  }, [filterType]);

  // Load on mount and when filter changes
  useEffect(() => {
    loadMediaLibrary();
  }, [loadMediaLibrary]);

  /**
   * Check if user can upload more files of a given type
   */
  const canUploadFileType = (
    mimeType: string
  ): { ok: boolean; reason?: string } => {
    if (mimeType.startsWith("image/")) {
      if (counts.images >= MAX_IMAGES) {
        return {
          ok: false,
          reason: `Max ${MAX_IMAGES} bilder/logos. Ta bort någon för att ladda upp fler.`,
        };
      }
    }
    if (mimeType.startsWith("video/")) {
      if (counts.videos >= MAX_VIDEOS) {
        return {
          ok: false,
          reason: `Max ${MAX_VIDEOS} videos. Ta bort någon för att ladda upp fler.`,
        };
      }
    }
    return { ok: true };
  };

  /**
   * Handle file upload
   */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadProgress("Förbereder...");
    setError(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Check limits before uploading
        const limitCheck = canUploadFileType(file.type);
        if (!limitCheck.ok) {
          setError(limitCheck.reason || "Gränsen är nådd");
          continue;
        }

        setUploadProgress(`Laddar upp ${i + 1}/${files.length}: ${file.name}`);

        const formData = new FormData();
        formData.append("file", file);
        if (projectId) formData.append("projectId", projectId);

        const response = await fetch("/api/media/upload", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (!data.success) {
          console.error("[MediaLibrary] Upload failed:", data.error);
          setError(`Kunde inte ladda upp ${file.name}: ${data.error}`);
          continue;
        }

        // Add to local state immediately for instant feedback
        setItems((prev) => [
          {
            id: data.media.id,
            url: data.media.url,
            filename: data.media.filename,
            mimeType: data.media.mimeType,
            fileType: data.media.fileType,
            size: data.media.size,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);

        // Notify parent if callback provided
        if (onFileSelect) {
          onFileSelect({
            id: `media-${data.media.id}`,
            type: data.media.fileType,
            url: data.media.url,
            filename: data.media.filename,
            mimeType: data.media.mimeType,
            createdAt: new Date(),
            source: "uploaded",
          });
        }
      }

      setUploadProgress("Klar!");
      setTimeout(() => setUploadProgress(""), 2000);
    } catch (err) {
      console.error("[MediaLibrary] Upload error:", err);
      setError("Uppladdning misslyckades. Försök igen.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  /**
   * Handle file deletion
   */
  const handleDelete = async (id: number) => {
    if (!confirm("Är du säker på att du vill ta bort filen?")) return;

    try {
      const response = await fetch(`/api/media/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        setItems((prev) => prev.filter((item) => item.id !== id));
      } else {
        setError("Kunde inte ta bort filen");
      }
    } catch (err) {
      console.error("[MediaLibrary] Delete error:", err);
      setError("Kunde inte ta bort filen");
    }
  };

  /**
   * Drag and drop handlers
   */
  const handleDragStart = (e: React.DragEvent, item: UploadedMediaItem) => {
    setDraggedItem(item);
    e.dataTransfer.setData("text/plain", item.url);
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        id: `media-${item.id}`,
        url: item.url,
        filename: item.filename,
        type: item.fileType,
        mimeType: item.mimeType,
      })
    );
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  // Filter items by search query
  const filteredItems = items.filter((item) => {
    if (
      searchQuery &&
      !item.filename.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  // File type filter options (media only - PDFs/text handled by TextFilesPanel)
  const fileTypes: {
    value: MediaFileType | "all";
    label: string;
    icon: typeof FileText;
  }[] = [
    { value: "all", label: "Alla", icon: FileText },
    { value: "image", label: "Bilder", icon: ImageIcon },
    { value: "video", label: "Videos", icon: Video },
    { value: "logo", label: "Logos", icon: Shapes },
  ];

  return (
    <div
      className={cn(
        "border border-gray-800 rounded-lg bg-gray-900/50 overflow-hidden",
        className
      )}
    >
      {/* Collapsible Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-800">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 hover:text-white transition-colors flex-1"
        >
          <ImageIcon className="h-4 w-4 text-teal-400" />
          <span className="text-sm font-medium text-white">
            Bilder & Videos ({items.length})
          </span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400 ml-auto" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400 ml-auto" />
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="p-3 space-y-3">
          {/* Upload section with limits display */}
          <div className="space-y-2">
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full bg-teal-600 hover:bg-teal-500 text-white"
              size="sm"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {uploadProgress}
                </>
              ) : (
                <>
                  <UploadIcon className="h-4 w-4 mr-2" />
                  Ladda upp filer
                </>
              )}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <p className="text-[10px] text-gray-500 text-center">
              Bilder &amp; videos (PDF/text → se &quot;Textfiler&quot; nedan)
            </p>

            {/* Limits indicator */}
            <div className="flex justify-between text-[10px] text-gray-500">
              <span
                className={cn(counts.images >= MAX_IMAGES && "text-amber-500")}
              >
                Bilder: {counts.images}/{MAX_IMAGES}
              </span>
              <span
                className={cn(counts.videos >= MAX_VIDEOS && "text-amber-500")}
              >
                Videos: {counts.videos}/{MAX_VIDEOS}
              </span>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="ml-auto hover:text-red-300"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Stock Photo Search - Unsplash/Pexels integration */}
          <StockPhotoSearch
            onPhotoSelect={(photo) => {
              // Reload the media library to show newly saved photo
              loadMediaLibrary();

              // Also notify parent if callback exists
              if (onFileSelect) {
                onFileSelect({
                  id: `stock-${Date.now()}`,
                  type: "image",
                  url: photo.url,
                  filename: photo.filename,
                  mimeType: "image/jpeg",
                  createdAt: new Date(),
                  source: "uploaded",
                  description: `Foto av ${photo.photographer} (${photo.source})`,
                });
              }
            }}
            disabled={isLoading || isUploading}
          />

          {/* Search & Filter */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-500" />
              <input
                type="text"
                placeholder="Sök..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-7 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-teal-500 text-white"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Filter toggles */}
            <div className="flex gap-1 flex-wrap">
              {fileTypes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setFilterType(type.value)}
                  className={cn(
                    "px-2 py-1 text-[10px] rounded flex items-center gap-1 transition-colors",
                    filterType === type.value
                      ? "bg-teal-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  )}
                >
                  <type.icon className="h-3 w-3" />
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Media Grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              {searchQuery
                ? "Inga filer matchade sökningen"
                : "Inga filer uppladdade än. Ladda upp dina första filer!"}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-[400px] overflow-y-auto">
              {filteredItems.map((item) => (
                <MediaLibraryItemCard
                  key={item.id}
                  item={item}
                  onDelete={() => handleDelete(item.id)}
                  onSelect={
                    onFileSelect
                      ? () =>
                          onFileSelect({
                            id: `media-${item.id}`,
                            type: item.fileType,
                            url: item.url,
                            filename: item.filename,
                            mimeType: item.mimeType,
                            createdAt: new Date(item.createdAt),
                            source: "uploaded",
                          })
                      : undefined
                  }
                  isDragging={draggedItem?.id === item.id}
                  onDragStart={(e) => handleDragStart(e, item)}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MEDIA LIBRARY ITEM CARD
// ============================================================================

interface MediaLibraryItemCardProps {
  item: UploadedMediaItem;
  onDelete: () => void;
  onSelect?: () => void;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function MediaLibraryItemCard({
  item,
  onDelete,
  onSelect,
  isDragging,
  onDragStart,
  onDragEnd,
}: MediaLibraryItemCardProps) {
  const [showActions, setShowActions] = useState(false);

  const Icon = getFileTypeIcon(item.fileType);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onClick={onSelect}
      className={cn(
        "relative aspect-square rounded-lg overflow-hidden border transition-all cursor-grab",
        isDragging
          ? "border-teal-500 opacity-50"
          : "border-gray-700 hover:border-gray-600",
        onSelect && "cursor-pointer"
      )}
    >
      {/* File Preview */}
      {item.fileType === "image" || item.fileType === "logo" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.url}
          alt={item.filename}
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : item.fileType === "video" ? (
        <div className="w-full h-full bg-gray-800 flex items-center justify-center">
          <Video className="h-8 w-8 text-gray-500" />
        </div>
      ) : (
        <div className="w-full h-full bg-gray-800 flex flex-col items-center justify-center p-2">
          <Icon className="h-8 w-8 text-gray-500 mb-1" />
          <span className="text-[10px] text-gray-500 text-center truncate w-full">
            {item.filename}
          </span>
        </div>
      )}

      {/* Drag handle */}
      <div className="absolute top-1 left-1 p-1 bg-black/50 rounded">
        <GripVertical className="h-3 w-3 text-white/70" />
      </div>

      {/* Type badge */}
      <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-500/80 text-white">
        {item.fileType}
      </div>

      {/* Actions overlay on hover */}
      {showActions && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-1 p-1">
          <span className="text-[10px] text-white text-center truncate w-full px-1">
            {item.filename}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="h-6 text-[10px] text-red-400 hover:bg-red-500/20 w-full"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Ta bort
          </Button>
        </div>
      )}
    </div>
  );
}
