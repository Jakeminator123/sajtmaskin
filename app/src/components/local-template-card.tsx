"use client";

import { useState } from "react";
import {
  Loader2,
  LayoutDashboard,
  FileText,
  Globe,
  Sparkles,
  Play,
} from "lucide-react";
import type { LocalTemplate } from "@/lib/local-templates";
import { PreviewModal } from "./preview-modal";

/**
 * LocalTemplateCard
 * =================
 *
 * Visar en statisk bild av templaten. Preview-knappen förstorar bilden i en modal.
 */

// Get v0 OG image URL directly from template ID (fallback)
function getOgImageUrl(v0TemplateId?: string): string | null {
  if (!v0TemplateId) return null;
  return `https://v0.dev/api/og?path=/t/${v0TemplateId}`;
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

function getCategoryGradient(category: string): string {
  switch (category) {
    case "dashboard":
      return "from-gray-900/80 via-gray-800/60 to-gray-900/80";
    case "landing-page":
      return "from-teal-900/80 via-teal-800/60 to-teal-900/80";
    case "website":
      return "from-gray-800/80 via-gray-700/60 to-gray-800/80";
    default:
      return "from-gray-800 via-gray-700 to-gray-800";
  }
}

interface LocalTemplateCardProps {
  template: LocalTemplate;
  onSelect: (template: LocalTemplate) => void | Promise<void>;
  disabled?: boolean;
}

export function LocalTemplateCard({
  template,
  onSelect,
  disabled,
}: LocalTemplateCardProps) {
  const [isSelecting, setIsSelecting] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const CategoryIcon = getCategoryIcon(template.category);
  const gradientClass = getCategoryGradient(template.category);

  const ogImageUrl = getOgImageUrl(template.v0TemplateId);

  const displayImageUrl = template.previewUrl || ogImageUrl;
  const canPreview = !!displayImageUrl && !imageError;

  const handleSelectClick = async () => {
    if (disabled || isSelecting) return;
    setIsSelecting(true);
    try {
      await onSelect(template);
    } catch (error) {
      console.error("[LocalTemplateCard] Select error:", error);
    } finally {
      setIsSelecting(false);
    }
  };

  return (
    <>
      <div className="group relative w-full text-left bg-black/50 border border-gray-800 overflow-hidden hover:border-teal-500/50 hover:bg-black/70 transition-all duration-300">
        {/* Preview Area */}
        <div className="relative aspect-[16/10] bg-gray-800 overflow-hidden">
          {/* Loading overlay */}
          {isSelecting && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20">
              <Loader2 className="h-8 w-8 text-teal-500 animate-spin" />
              <span className="text-sm text-gray-400 mt-2">Laddar mall...</span>
            </div>
          )}

          {/* Thumbnail image */}
          {displayImageUrl && !imageError && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayImageUrl}
              alt={template.name}
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setImageError(true)}
              loading="lazy"
            />
          )}

          {/* Gradient fallback when no image available */}
          {!isLoadingScreenshot && (!displayImageUrl || imageError) && (
            <div
              className={`absolute inset-0 bg-gradient-to-br ${gradientClass} flex flex-col items-center justify-center`}
            >
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-4 left-4 w-20 h-20 border border-white/20" />
                <div className="absolute bottom-4 right-4 w-24 h-12 border border-white/20" />
              </div>
              <CategoryIcon className="h-12 w-12 text-white/40 mb-2" />
              <span className="text-sm font-medium text-white/60 text-center px-4">
                {template.name}
              </span>
            </div>
          )}

          {/* Badges */}
          <>
            <span className="absolute top-2 right-2 px-2 py-1 text-xs font-medium bg-teal-500/20 text-teal-300 border border-teal-500/30 backdrop-blur-sm">
              v0 Template
            </span>
            {template.complexity === "advanced" && (
              <span className="absolute top-2 left-2 px-2 py-1 text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 backdrop-blur-sm">
                ✨ Avancerad
              </span>
            )}
          </>
        </div>

        {/* Content Area */}
        <div className="p-4">
          <h3 className="font-semibold text-white group-hover:text-white transition-colors truncate">
            {template.name}
          </h3>
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
            {template.description}
          </p>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (isSelecting || disabled || !displayImageUrl) return;
                setShowModal(true);
              }}
              disabled={isSelecting || !canPreview}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors disabled:opacity-50"
            >
              <Play className="h-3 w-3" />
              Preview
            </button>

            <button
              onClick={handleSelectClick}
              disabled={disabled || isSelecting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white transition-colors disabled:opacity-50 flex-1 justify-center"
            >
              {isSelecting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Använd mall"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      <PreviewModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        imageUrl={canPreview ? displayImageUrl : undefined}
        templateName={template.name}
      />
    </>
  );
}
