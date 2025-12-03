"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import {
  Loader2,
  LayoutDashboard,
  FileText,
  Globe,
  Sparkles,
  ExternalLink,
  Eye,
  X,
  Play,
} from "lucide-react";
import type { LocalTemplate } from "@/lib/local-templates";
import { getTemplatePreview } from "@/lib/api-client";

/**
 * LocalTemplateCard with Live Preview Support
 * ============================================
 *
 * Features:
 * 1. Shows OG image or gradient placeholder initially
 * 2. "Preview" button loads live iframe from v0
 * 3. Updates image to actual screenshot when available
 * 4. Saves chatId for seamless refinement after selection
 */

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function getV0OgImageUrl(sourceUrl: string): string | null {
  try {
    // Extract just the template ID (last 11 chars after last dash)
    // Example: https://v0.app/templates/ai-agency-landing-page-Ka8r7wzBAS0
    // We want: Ka8r7wzBAS0
    const match = sourceUrl.match(/-([A-Za-z0-9]{11})$/);
    if (match) {
      return `https://v0.dev/api/og?path=/t/${match[1]}`;
    }
    return null;
  } catch {
    return null;
  }
}

function getCategoryGradient(category: string): string {
  switch (category) {
    case "dashboard":
      return "from-blue-900/80 via-indigo-900/60 to-purple-900/80";
    case "landing-page":
      return "from-emerald-900/80 via-teal-900/60 to-cyan-900/80";
    case "website":
      return "from-orange-900/80 via-amber-900/60 to-yellow-900/80";
    default:
      return "from-zinc-800 via-zinc-700 to-zinc-800";
  }
}

function getCategoryIcon(category: string) {
  switch (category) {
    case "dashboard":
      return LayoutDashboard;
    case "landing-page":
      return FileText;
    case "website":
      return Globe;
    default:
      return Sparkles;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface LocalTemplateCardProps {
  template: LocalTemplate;
  onSelect: (
    template: LocalTemplate,
    previewChatId?: string
  ) => void | Promise<void>;
  disabled?: boolean;
}

export function LocalTemplateCard({
  template,
  onSelect,
  disabled,
}: LocalTemplateCardProps) {
  // Loading states
  const [isSelecting, setIsSelecting] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Image state
  const [imageError, setImageError] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [demoUrl, setDemoUrl] = useState<string | null>(null);
  const [previewChatId, setPreviewChatId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const CategoryIcon = getCategoryIcon(template.category);
  const gradientClass = getCategoryGradient(template.category);

  // Determine which image to show (priority: screenshot > local preview > OG > gradient)
  const ogImageUrl = getV0OgImageUrl(template.sourceUrl);

  // Try local preview first, then OG image, then screenshot
  // If local preview fails to load, fall back to OG image
  const displayImageUrl =
    screenshotUrl ||
    (template.previewUrl && !imageError ? template.previewUrl : null) ||
    ogImageUrl;

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────────────────

  const handlePreviewClick = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Don't trigger card selection

    if (demoUrl) {
      // Already loaded - just toggle visibility
      setShowPreview(!showPreview);
      return;
    }

    if (!template.v0TemplateId) {
      setPreviewError("Preview inte tillgängligt för denna mall");
      return;
    }

    setIsLoadingPreview(true);
    setPreviewError(null);

    try {
      const response = await getTemplatePreview(template.id);

      if (!response.success) {
        setPreviewError(response.error || "Kunde inte ladda preview");
        return;
      }

      // Update state with preview data
      if (response.demoUrl) {
        setDemoUrl(response.demoUrl);
        setShowPreview(true);
      }

      if (response.screenshotUrl) {
        setScreenshotUrl(response.screenshotUrl);
      }

      if (response.chatId) {
        setPreviewChatId(response.chatId);
      }
    } catch (error) {
      console.error("[LocalTemplateCard] Preview error:", error);
      setPreviewError("Nätverksfel vid laddning");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSelectClick = async () => {
    if (disabled || isSelecting) return;

    setIsSelecting(true);
    try {
      // Pass previewChatId if available (for seamless refinement)
      await onSelect(template, previewChatId || undefined);
    } catch (error) {
      console.error("[LocalTemplateCard] Select error:", error);
    } finally {
      setIsSelecting(false);
    }
  };

  const handleClosePreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPreview(false);
  };

  // Ref for hover timeout (cleanup on mouse leave)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Preload preview data on hover (speculative loading)
  const handleMouseEnter = useCallback(() => {
    // Only preload if we have a v0TemplateId and haven't loaded yet
    if (
      template.v0TemplateId &&
      !demoUrl &&
      !isLoadingPreview &&
      !previewError
    ) {
      // Start loading in background after short delay
      hoverTimeoutRef.current = setTimeout(async () => {
        try {
          const response = await getTemplatePreview(template.id);
          if (response.success) {
            if (response.demoUrl) setDemoUrl(response.demoUrl);
            if (response.screenshotUrl)
              setScreenshotUrl(response.screenshotUrl);
            if (response.chatId) setPreviewChatId(response.chatId);
          }
        } catch {
          // Silently fail on preload - user hasn't explicitly requested it
        }
      }, 800); // 800ms delay before preloading (enough time to detect intentional hover)
    }
  }, [
    template.v0TemplateId,
    template.id,
    demoUrl,
    isLoadingPreview,
    previewError,
  ]);

  // Cancel preload on mouse leave
  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="group relative w-full text-left bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden hover:border-emerald-500/50 hover:bg-zinc-900 transition-all duration-300 disabled:opacity-50"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* PREVIEW AREA */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="relative aspect-[16/10] bg-zinc-800 overflow-hidden">
        {/* Loading overlay */}
        {(isSelecting || isLoadingPreview) && (
          <div className="absolute inset-0 bg-zinc-900/80 flex flex-col items-center justify-center z-20">
            <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
            <span className="text-sm text-zinc-400 mt-2">
              {isLoadingPreview ? "Laddar preview..." : "Laddar mall..."}
            </span>
          </div>
        )}

        {/* Live iframe preview (when activated) */}
        {showPreview && demoUrl && (
          <div className="absolute inset-0 z-10">
            <iframe
              src={demoUrl}
              className="w-full h-full border-0"
              sandbox="allow-same-origin allow-scripts allow-forms allow-pointer-lock allow-popups"
              title={`Preview: ${template.name}`}
            />
            {/* Close button */}
            <button
              onClick={handleClosePreview}
              className="absolute top-2 right-2 p-1 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
            >
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
        )}

        {/* Static image (screenshot or OG image) - lazy loaded */}
        {!showPreview && displayImageUrl && (
          <Image
            src={displayImageUrl}
            alt={template.name}
            fill
            className="object-cover"
            onError={() => setImageError(true)}
            unoptimized
            loading="lazy" // Lazy load images
            placeholder="empty"
          />
        )}

        {/* Gradient fallback (when no image available) */}
        {!showPreview && !displayImageUrl && (
          <div
            className={`absolute inset-0 bg-gradient-to-br ${gradientClass} flex flex-col items-center justify-center`}
          >
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-4 left-4 w-20 h-20 border border-white/20 rounded-lg" />
              <div className="absolute top-8 left-8 w-16 h-16 border border-white/20 rounded-lg" />
              <div className="absolute bottom-4 right-4 w-24 h-12 border border-white/20 rounded-lg" />
              <div className="absolute bottom-12 right-8 w-16 h-8 border border-white/20 rounded-lg" />
            </div>
            <CategoryIcon className="h-12 w-12 text-white/40 mb-2" />
            <span className="text-sm font-medium text-white/60 text-center px-4">
              {template.name}
            </span>
          </div>
        )}

        {/* Badges (hidden when preview is showing) */}
        {!showPreview && (
          <>
            {/* Category badge */}
            <span className="absolute top-2 right-2 px-2 py-1 text-xs font-medium bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30 backdrop-blur-sm">
              {template.v0TemplateId ? "v0 Template" : "Lokal mall"}
            </span>

            {/* Complexity badge */}
            {template.complexity === "advanced" && (
              <span className="absolute top-2 left-2 px-2 py-1 text-xs font-medium bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/30 backdrop-blur-sm">
                ✨ Avancerad
              </span>
            )}
          </>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* CONTENT AREA */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="p-4">
        <h3 className="font-semibold text-zinc-100 group-hover:text-white transition-colors truncate">
          {template.name}
        </h3>
        <p className="text-sm text-zinc-500 mt-1 line-clamp-2">
          {template.description}
        </p>

        {/* Error message */}
        {previewError && (
          <p className="text-xs text-red-400 mt-2">{previewError}</p>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-3">
          {/* Preview button (only for v0 templates) */}
          {template.v0TemplateId && (
            <button
              onClick={handlePreviewClick}
              disabled={isLoadingPreview || isSelecting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isLoadingPreview ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : demoUrl ? (
                <Eye className="h-3 w-3" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              {demoUrl ? (showPreview ? "Dölj" : "Visa") : "Preview"}
            </button>
          )}

          {/* Select button */}
          <button
            onClick={handleSelectClick}
            disabled={disabled || isSelecting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50 flex-1 justify-center"
          >
            {isSelecting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              "Använd mall"
            )}
          </button>
        </div>

        {/* Source link */}
        <div className="flex items-center gap-2 mt-3 text-xs text-zinc-600">
          <ExternalLink className="h-3 w-3" />
          <a
            href={template.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="truncate hover:text-zinc-400 transition-colors"
          >
            Visa på v0.app
          </a>
        </div>
      </div>
    </div>
  );
}
