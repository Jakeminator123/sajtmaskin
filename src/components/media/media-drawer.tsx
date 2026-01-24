"use client";

/**
 * MediaDrawer Component v2.0
 * ==========================
 *
 * Slide-in drawer for media management with consistent design.
 *
 * Features:
 * - Slide-in animation from right
 * - Upload images/videos with progress
 * - Browse media library with filters
 * - Click to add to chat (no confusing drag)
 * - Consistent design with TextUploader
 *
 * UX Improvements in v2.0:
 * - Cleaner header matching TextUploader style
 * - Better visual feedback on selection
 * - Simplified action: click = use in chat
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
  GripVertical,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/utils";
import type { MediaFileType, MediaItem } from "./media-bank";

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_IMAGES = 10;
const MAX_VIDEOS = 3;

// ============================================================================
// TYPES
// ============================================================================

interface MediaDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  onFileSelect?: (item: MediaItem) => void;
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
  images: number;
  videos: number;
  other: number;
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
    case "pdf":
    case "text":
    case "other":
      return FileText;
    default:
      return FileText;
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function MediaDrawer({ isOpen, onClose, projectId, onFileSelect }: MediaDrawerProps) {
  const [items, setItems] = useState<UploadedMediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<MediaFileType | "all">("all");
  const [draggedItem, setDraggedItem] = useState<UploadedMediaItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Calculate counts for limits
  const counts: MediaCounts = {
    images: items.filter((i) => i.fileType === "image" || i.fileType === "logo").length,
    videos: items.filter((i) => i.fileType === "video").length,
    other: items.filter(
      (i) => i.fileType === "pdf" || i.fileType === "text" || i.fileType === "other",
    ).length,
  };

  // Load media library
  const loadMediaLibrary = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterType !== "all") params.append("fileType", filterType);

      const response = await fetch(`/api/media/upload?${params}`);
      const data = await response.json();

      if (data.success) {
        setItems(data.items);
      } else {
        setError(data.error || "Kunde inte ladda mediabiblioteket");
      }
    } catch (err) {
      console.error("[MediaDrawer] Failed to load:", err);
      setError("Kunde inte ladda mediabiblioteket");
    } finally {
      setIsLoading(false);
    }
  }, [filterType]);

  // Load on open
  useEffect(() => {
    if (isOpen) {
      loadMediaLibrary();
    }
  }, [isOpen, loadMediaLibrary]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node) && isOpen) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  const canUploadFileType = (mimeType: string): { ok: boolean; reason?: string } => {
    if (mimeType.startsWith("image/")) {
      if (counts.images >= MAX_IMAGES) {
        return {
          ok: false,
          reason: `Max ${MAX_IMAGES} bilder/logos. Ta bort någon först.`,
        };
      }
    }
    if (mimeType.startsWith("video/")) {
      if (counts.videos >= MAX_VIDEOS) {
        return {
          ok: false,
          reason: `Max ${MAX_VIDEOS} videos. Ta bort någon först.`,
        };
      }
    }
    return { ok: true };
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadProgress("Förbereder...");
    setError(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

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
          setError(`Kunde inte ladda upp ${file.name}: ${data.error}`);
          continue;
        }

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

        // DON'T auto-select uploaded files anymore
        // User should manually click on the file to use it
        // This prevents auto-submission of prompts when uploading
      }

      setUploadProgress("Klar!");
      setTimeout(() => setUploadProgress(""), 2000);
    } catch (err) {
      console.error("[MediaDrawer] Upload error:", err);
      setError("Uppladdning misslyckades. Försök igen.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Är du säker på att du vill ta bort filen?")) return;

    try {
      const response = await fetch(`/api/media/${id}`, { method: "DELETE" });
      const data = await response.json();

      if (data.success) {
        setItems((prev) => prev.filter((item) => item.id !== id));
      } else {
        setError("Kunde inte ta bort filen");
      }
    } catch (err) {
      console.error("[MediaDrawer] Delete error:", err);
      setError("Kunde inte ta bort filen");
    }
  };

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
      }),
    );
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const filteredItems = items.filter((item) => {
    if (searchQuery && !item.filename.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  const fileTypes: {
    value: MediaFileType | "all";
    label: string;
    icon: typeof FileText;
  }[] = [
    { value: "all", label: "Alla", icon: FileText },
    { value: "image", label: "Bilder", icon: ImageIcon },
    { value: "video", label: "Videos", icon: Video },
    { value: "logo", label: "Logos", icon: Shapes },
    { value: "pdf", label: "PDF", icon: FileText },
    { value: "text", label: "Text", icon: FileText },
  ];

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="animate-in fade-in fixed inset-0 z-40 bg-black/50 duration-200" />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={cn(
          "fixed top-0 right-0 bottom-0 z-50 w-full max-w-md border-l border-gray-800 bg-gray-950",
          "animate-in slide-in-from-right duration-300 ease-out",
          "flex flex-col",
        )}
      >
        {/* Header - consistent with TextUploader */}
        <div className="flex items-center justify-between border-b border-gray-800 p-4">
          <div className="flex items-center gap-2">
            <div className="bg-brand-teal/20 rounded-lg p-1.5">
              <ImageIcon className="text-brand-teal h-4 w-4" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Mediabibliotek</h2>
              <p className="text-xs text-gray-500">{items.length} filer uppladdade</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
            aria-label="Stäng mediabiblioteket"
            title="Stäng mediabiblioteket"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* Upload section */}
          <div className="space-y-2">
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="bg-brand-teal hover:bg-brand-teal/90 w-full text-white"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {uploadProgress}
                </>
              ) : (
                <>
                  <UploadIcon className="mr-2 h-4 w-4" />
                  Ladda upp filer
                </>
              )}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,.pdf,.txt,.md,.json"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Välj filer att ladda upp"
              title="Välj filer att ladda upp"
            />

            {/* Limits */}
            <div className="flex justify-between text-xs text-gray-500">
              <span className={cn(counts.images >= MAX_IMAGES && "text-brand-amber")}>
                Bilder: {counts.images}/{MAX_IMAGES}
              </span>
              <span className={cn(counts.videos >= MAX_VIDEOS && "text-brand-amber")}>
                Videos: {counts.videos}/{MAX_VIDEOS}
              </span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{error}</span>
              <button
                onClick={() => setError(null)}
                className="hover:text-red-300"
                aria-label="Stäng felmeddelande"
                title="Stäng felmeddelande"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Search & Filter */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="Sök filer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="focus:border-brand-teal w-full rounded-lg border border-gray-700 bg-gray-900 py-2 pr-10 pl-10 text-sm text-white focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-500 hover:text-white"
                  aria-label="Rensa sökningen"
                  title="Rensa sökningen"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Filter tabs */}
            <div className="flex flex-wrap gap-2">
              {fileTypes.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setFilterType(type.value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors",
                    filterType === type.value
                      ? "bg-brand-teal text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700",
                  )}
                >
                  <type.icon className="h-3.5 w-3.5" />
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Media Grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="text-brand-teal h-8 w-8 animate-spin" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              <ImageIcon className="mx-auto mb-3 h-12 w-12 opacity-50" />
              <p className="text-sm">
                {searchQuery ? "Inga filer matchade sökningen" : "Inga filer än. Ladda upp!"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {filteredItems.map((item) => (
                <MediaItemCard
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

        {/* Footer - helpful hint */}
        <div className="border-t border-gray-800 bg-gray-900/50 p-4">
          <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
            <ImageIcon className="h-3.5 w-3.5" />
            <span>Klicka på en fil för att använda den i din design</span>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================================
// MEDIA ITEM CARD
// ============================================================================

interface MediaItemCardProps {
  item: UploadedMediaItem;
  onDelete: () => void;
  onSelect?: () => void;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function MediaItemCard({
  item,
  onDelete,
  onSelect,
  isDragging,
  onDragStart,
  onDragEnd,
}: MediaItemCardProps) {
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
        "relative aspect-square cursor-grab overflow-hidden rounded-lg border transition-all",
        isDragging ? "border-brand-teal opacity-50" : "border-gray-700 hover:border-gray-600",
        onSelect && "cursor-pointer",
      )}
    >
      {/* Preview */}
      {item.fileType === "image" || item.fileType === "logo" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.url}
          alt={item.filename}
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : item.fileType === "video" ? (
        <div className="flex h-full w-full items-center justify-center bg-gray-800">
          <Video className="h-8 w-8 text-gray-500" />
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-gray-800 p-2">
          <Icon className="mb-1 h-8 w-8 text-gray-500" />
          <span className="w-full truncate px-2 text-left text-[10px] text-gray-500">
            {item.filename}
          </span>
        </div>
      )}

      {/* Drag handle */}
      <div className="absolute top-1.5 left-1.5 rounded bg-black/60 p-1">
        <GripVertical className="h-3 w-3 text-white/70" />
      </div>

      {/* Type badge */}
      <div className="bg-brand-teal/90 absolute top-1.5 right-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-white">
        {item.fileType}
      </div>

      {/* Hover overlay */}
      {showActions && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-2">
          <span className="w-full truncate px-2 text-left text-[11px] text-white">
            {item.filename}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="h-7 w-full text-xs text-red-400 hover:bg-red-500/20"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Ta bort
          </Button>
        </div>
      )}
    </div>
  );
}
