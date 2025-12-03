"use client";

import { useState } from "react";
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
 * LocalTemplateCard - SIMPLIFIED VERSION
 * ======================================
 *
 * Simple approach:
 * 1. Show v0 OG image directly from v0TemplateId (lazy loaded)
 * 2. Fallback to gradient if no templateId
 * 3. Optional live preview via button
 */

// Get v0 OG image URL directly from template ID
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
      return "from-blue-900/80 via-indigo-900/60 to-purple-900/80";
    case "landing-page":
      return "from-emerald-900/80 via-teal-900/60 to-cyan-900/80";
    case "website":
      return "from-orange-900/80 via-amber-900/60 to-yellow-900/80";
    default:
      return "from-zinc-800 via-zinc-700 to-zinc-800";
  }
}

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
  const [isSelecting, setIsSelecting] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Live preview state
  const [showPreview, setShowPreview] = useState(false);
  const [demoUrl, setDemoUrl] = useState<string | null>(null);
  const [previewChatId, setPreviewChatId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const CategoryIcon = getCategoryIcon(template.category);
  const gradientClass = getCategoryGradient(template.category);

  // Simple: just get OG image from v0TemplateId
  const imageUrl = getOgImageUrl(template.v0TemplateId);

  const handlePreviewClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (demoUrl) {
      setShowPreview(!showPreview);
      return;
    }

    if (!template.v0TemplateId) {
      setPreviewError("Preview inte tillgängligt");
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
      if (response.demoUrl) {
        setDemoUrl(response.demoUrl);
        setShowPreview(true);
      }
      if (response.chatId) {
        setPreviewChatId(response.chatId);
      }
    } catch (error) {
      console.error("[LocalTemplateCard] Preview error:", error);
      setPreviewError("Nätverksfel");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSelectClick = async () => {
    if (disabled || isSelecting) return;
    setIsSelecting(true);
    try {
      await onSelect(template, previewChatId || undefined);
    } catch (error) {
      console.error("[LocalTemplateCard] Select error:", error);
    } finally {
      setIsSelecting(false);
    }
  };

  return (
    <div className="group relative w-full text-left bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden hover:border-emerald-500/50 hover:bg-zinc-900 transition-all duration-300">
      {/* Preview Area */}
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

        {/* Live iframe preview */}
        {showPreview && demoUrl && (
          <div className="absolute inset-0 z-10">
            <iframe
              src={demoUrl}
              className="w-full h-full border-0"
              sandbox="allow-same-origin allow-scripts allow-forms allow-pointer-lock allow-popups"
              title={`Preview: ${template.name}`}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowPreview(false);
              }}
              className="absolute top-2 right-2 p-1 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
            >
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
        )}

        {/* Static thumbnail image - lazy loaded */}
        {!showPreview && imageUrl && !imageError && (
          <Image
            src={imageUrl}
            alt={template.name}
            fill
            className="object-cover"
            onError={() => setImageError(true)}
            unoptimized
            loading="lazy"
          />
        )}

        {/* Gradient fallback */}
        {!showPreview && (!imageUrl || imageError) && (
          <div
            className={`absolute inset-0 bg-gradient-to-br ${gradientClass} flex flex-col items-center justify-center`}
          >
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-4 left-4 w-20 h-20 border border-white/20 rounded-lg" />
              <div className="absolute bottom-4 right-4 w-24 h-12 border border-white/20 rounded-lg" />
            </div>
            <CategoryIcon className="h-12 w-12 text-white/40 mb-2" />
            <span className="text-sm font-medium text-white/60 text-center px-4">
              {template.name}
            </span>
          </div>
        )}

        {/* Badges */}
        {!showPreview && (
          <>
            <span className="absolute top-2 right-2 px-2 py-1 text-xs font-medium bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/30 backdrop-blur-sm">
              v0 Template
            </span>
            {template.complexity === "advanced" && (
              <span className="absolute top-2 left-2 px-2 py-1 text-xs font-medium bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/30 backdrop-blur-sm">
                ✨ Avancerad
              </span>
            )}
          </>
        )}
      </div>

      {/* Content Area */}
      <div className="p-4">
        <h3 className="font-semibold text-zinc-100 group-hover:text-white transition-colors truncate">
          {template.name}
        </h3>
        <p className="text-sm text-zinc-500 mt-1 line-clamp-2">
          {template.description}
        </p>

        {previewError && (
          <p className="text-xs text-red-400 mt-2">{previewError}</p>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-3">
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
