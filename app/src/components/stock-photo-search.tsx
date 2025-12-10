"use client";

/**
 * StockPhotoSearch Component
 * ==========================
 *
 * Search for stock photos from Unsplash and add them to MediaLibrary.
 * When a user selects a photo, it can be downloaded to Vercel Blob
 * to ensure the URL works in v0 preview.
 *
 * NOTE: Unsplash URLs are already public and SHOULD work in v0 preview.
 * We offer the option to download to Blob for extra reliability.
 *
 * PEXELS: Disabled for now. Set ENABLE_PEXELS=true in .env.local to re-enable.
 * The Pexels API code remains in /api/pexels/route.ts for future use.
 */

import { useState, useCallback } from "react";
import {
  Search,
  Image as ImageIcon,
  Download,
  Plus,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

interface StockPhoto {
  id: string;
  url: string;
  urlSmall: string;
  alt: string;
  photographer: string;
  photographerUrl?: string;
  source: "unsplash" | "pexels";
  width: number;
  height: number;
  // Unsplash requires tracking downloads - call this URL when photo is used
  downloadLocation?: string;
}

interface StockPhotoSearchProps {
  onPhotoSelect: (photo: {
    url: string;
    filename: string;
    source: string;
    photographer: string;
  }) => void;
  disabled?: boolean;
  className?: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StockPhotoSearch({
  onPhotoSelect,
  disabled = false,
  className,
}: StockPhotoSearchProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [photos, setPhotos] = useState<StockPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  // NOTE: Pexels disabled - only using Unsplash now
  // To re-enable: set ENABLE_PEXELS=true in .env.local and uncomment Pexels UI below
  const source = "unsplash" as const;

  /**
   * Search for photos
   */
  const handleSearch = useCallback(async () => {
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    setPhotos([]);

    try {
      const endpoint = source === "unsplash" ? "/api/unsplash" : "/api/pexels";
      const response = await fetch(
        `${endpoint}?query=${encodeURIComponent(query)}&count=8`
      );
      const data = await response.json();

      if (data.success && data.images) {
        const mappedPhotos: StockPhoto[] = data.images.map(
          (img: {
            id: string | number;
            url: string;
            urlSmall: string;
            alt: string;
            photographer: string;
            photographerUrl?: string;
            width: number;
            height: number;
            downloadLocation?: string;
          }) => ({
            id: String(img.id),
            url: img.url,
            urlSmall: img.urlSmall,
            alt: img.alt,
            photographer: img.photographer,
            photographerUrl: img.photographerUrl,
            source,
            width: img.width,
            height: img.height,
            downloadLocation: img.downloadLocation,
          })
        );
        setPhotos(mappedPhotos);

        if (mappedPhotos.length === 0) {
          setError("Inga bilder hittades. Prova ett annat sökord.");
        }
      } else {
        setError(data.error || "Kunde inte söka bilder");
      }
    } catch (err) {
      console.error("[StockPhotoSearch] Search error:", err);
      setError("Nätverksfel vid sökning");
    } finally {
      setIsLoading(false);
    }
  }, [query, source, isLoading]);

  /**
   * Track Unsplash download (REQUIRED by Unsplash API guidelines!)
   * This must be called when a user uses a photo in their application.
   * See: https://unsplash.com/documentation#track-a-photo-download
   */
  const trackUnsplashDownload = useCallback(
    async (photo: StockPhoto) => {
      if (photo.source !== "unsplash") return;

      try {
        // Track via our API endpoint
        await fetch("/api/unsplash/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            downloadLocation: photo.downloadLocation,
            photoId: photo.id,
          }),
        });
        console.log("[StockPhotoSearch] ✅ Unsplash download tracked");
      } catch (err) {
        // Don't fail the selection if tracking fails
        console.warn("[StockPhotoSearch] Failed to track Unsplash download:", err);
      }
    },
    []
  );

  /**
   * Select a photo and optionally download to Blob
   */
  const handleSelectPhoto = useCallback(
    async (photo: StockPhoto, downloadToBlob: boolean = false) => {
      // CRITICAL: Track Unsplash download when photo is used!
      // This is required by Unsplash API guidelines for production approval.
      trackUnsplashDownload(photo);

      if (downloadToBlob) {
        setDownloadingId(photo.id);
        try {
          // Download the image and upload to Vercel Blob
          const response = await fetch("/api/media/upload-from-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: photo.url,
              filename: `${photo.source}-${photo.id}.jpg`,
              source: photo.source,
              photographer: photo.photographer,
            }),
          });

          const data = await response.json();

          if (data.success && data.media?.url) {
            onPhotoSelect({
              url: data.media.url,
              filename: `${photo.source}-${photo.id}.jpg`,
              source: photo.source,
              photographer: photo.photographer,
            });
          } else {
            // Fallback to direct URL if blob upload fails
            console.warn(
              "[StockPhotoSearch] Blob upload failed, using direct URL"
            );
            onPhotoSelect({
              url: photo.url,
              filename: `${photo.source}-${photo.id}.jpg`,
              source: photo.source,
              photographer: photo.photographer,
            });
          }
        } catch (err) {
          console.error("[StockPhotoSearch] Download error:", err);
          // Fallback to direct URL
          onPhotoSelect({
            url: photo.url,
            filename: `${photo.source}-${photo.id}.jpg`,
            source: photo.source,
            photographer: photo.photographer,
          });
        } finally {
          setDownloadingId(null);
        }
      } else {
        // Use direct URL (Unsplash URLs are already public)
        onPhotoSelect({
          url: photo.url,
          filename: `${photo.source}-${photo.id}.jpg`,
          source: photo.source,
          photographer: photo.photographer,
        });
      }
    },
    [onPhotoSelect, trackUnsplashDownload]
  );

  /**
   * Handle Enter key in search input
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSearch();
      }
    },
    [handleSearch]
  );

  return (
    <div
      className={cn(
        "border border-gray-800 rounded-lg bg-gray-900/50 overflow-hidden",
        className
      )}
    >
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-800/50 transition-colors"
        disabled={disabled}
      >
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium text-white">
            Stockfoton (Unsplash/Pexels)
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="p-3 pt-0 space-y-3">
          {/* Source indicator - Unsplash only (Pexels disabled) */}
          <div className="flex gap-1">
            <span className="px-2 py-1 text-xs rounded bg-blue-600 text-white">
              Unsplash
            </span>
            {/* PEXELS DISABLED - To re-enable:
                1. Set ENABLE_PEXELS=true in .env.local
                2. Uncomment the Pexels button below
                3. Change 'source' back to useState
            <button
              onClick={() => setSource("pexels")}
              className={cn(
                "px-2 py-1 text-xs rounded transition-colors",
                source === "pexels"
                  ? "bg-green-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              )}
            >
              Pexels
            </button>
            */}
          </div>

          {/* Search input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Sök bilder (t.ex. 'office', 'nature')..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={disabled || isLoading}
                className="w-full pl-3 pr-8 py-2 text-sm bg-gray-800 border border-gray-700 rounded focus:outline-none focus:border-blue-500 text-white placeholder:text-gray-500"
              />
              {query && (
                <button
                  onClick={() => {
                    setQuery("");
                    setPhotos([]);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button
              onClick={handleSearch}
              disabled={disabled || isLoading || !query.trim()}
              size="sm"
              className="bg-blue-600 hover:bg-blue-500"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 p-2 rounded">
              {error}
            </p>
          )}

          {/* Photo grid */}
          {photos.length > 0 && (
            <div className="grid grid-cols-4 gap-2 max-h-[300px] overflow-y-auto">
              {photos.map((photo) => (
                <StockPhotoCard
                  key={photo.id}
                  photo={photo}
                  onSelect={handleSelectPhoto}
                  isDownloading={downloadingId === photo.id}
                  disabled={disabled}
                />
              ))}
            </div>
          )}

          {/* Help text */}
          <p className="text-[10px] text-gray-500">
            💡 Klicka på en bild för att använda den direkt, eller klicka på
            download-ikonen för att spara till ditt mediabibliotek.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// STOCK PHOTO CARD
// ============================================================================

interface StockPhotoCardProps {
  photo: StockPhoto;
  onSelect: (photo: StockPhoto, downloadToBlob: boolean) => void;
  isDownloading: boolean;
  disabled: boolean;
}

function StockPhotoCard({
  photo,
  onSelect,
  isDownloading,
  disabled,
}: StockPhotoCardProps) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      className={cn(
        "relative aspect-square rounded-lg overflow-hidden border transition-all cursor-pointer",
        "border-gray-700 hover:border-blue-500",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {/* Photo preview */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.urlSmall}
        alt={photo.alt}
        className="w-full h-full object-cover"
        loading="lazy"
      />

      {/* Source badge */}
      <div
        className={cn(
          "absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-medium",
          photo.source === "unsplash"
            ? "bg-black/70 text-white"
            : "bg-green-600/80 text-white"
        )}
      >
        {photo.source === "unsplash" ? "U" : "P"}
      </div>

      {/* Loading overlay */}
      {isDownloading && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
        </div>
      )}

      {/* Actions overlay */}
      {showActions && !isDownloading && !disabled && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-1 p-1">
          {/* Use directly button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(photo, false);
            }}
            className="h-6 text-[10px] text-white hover:bg-blue-600 w-full"
          >
            <Plus className="h-3 w-3 mr-1" />
            Använd
          </Button>

          {/* Download to blob button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(photo, true);
            }}
            className="h-6 text-[10px] text-white hover:bg-green-600 w-full"
          >
            <Download className="h-3 w-3 mr-1" />
            Spara till bibliotek
          </Button>

          {/* Photographer credit - Required by Unsplash guidelines! */}
          {/* Format: "Photo by [Name] on Unsplash" with links */}
          <p className="text-[9px] text-gray-400 truncate w-full text-center mt-1">
            Foto:{" "}
            {photo.photographerUrl ? (
              <a
                href={photo.photographerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-white"
                onClick={(e) => e.stopPropagation()}
              >
                {photo.photographer}
              </a>
            ) : (
              photo.photographer
            )}
            {photo.source === "unsplash" && (
              <>
                {" "}på{" "}
                <a
                  href="https://unsplash.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-white"
                  onClick={(e) => e.stopPropagation()}
                >
                  Unsplash
                </a>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
