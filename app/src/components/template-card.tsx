"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Users,
  Heart,
  Loader2,
  LayoutDashboard,
  FileText,
  Globe,
  Sparkles,
} from "lucide-react";
import type { CuratedTemplate } from "@/lib/curated-templates";

interface TemplateCardProps {
  template: CuratedTemplate;
  onSelect: (template: CuratedTemplate) => void | Promise<void>;
  disabled?: boolean;
}

// Get gradient colors based on category
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

// Get icon based on category
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

export function TemplateCard({
  template,
  onSelect,
  disabled,
}: TemplateCardProps) {
  const [imageError, setImageError] = useState(true); // Start with fallback since URLs don't work
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    if (disabled || isLoading) return;
    setIsLoading(true);
    try {
      await onSelect(template);
    } catch (error) {
      // Reset loading state on error so user can retry
      setIsLoading(false);
    }
  };

  const CategoryIcon = getCategoryIcon(template.category);
  const gradientClass = getCategoryGradient(template.category);

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isLoading}
      className="group relative w-full text-left bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden hover:border-blue-500/50 hover:bg-zinc-900 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
    >
      {/* Preview image */}
      <div className="relative aspect-[16/10] bg-zinc-800 overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 bg-zinc-900/80 flex items-center justify-center z-10">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
          </div>
        )}

        {!imageError ? (
          <Image
            src={template.previewUrl}
            alt={template.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => setImageError(true)}
            unoptimized
          />
        ) : (
          // Beautiful gradient fallback with icon and pattern
          <div
            className={`absolute inset-0 bg-gradient-to-br ${gradientClass} flex flex-col items-center justify-center`}
          >
            {/* Decorative pattern */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-4 left-4 w-20 h-20 border border-white/20 rounded-lg" />
              <div className="absolute top-8 left-8 w-16 h-16 border border-white/20 rounded-lg" />
              <div className="absolute bottom-4 right-4 w-24 h-12 border border-white/20 rounded-lg" />
              <div className="absolute bottom-12 right-8 w-16 h-8 border border-white/20 rounded-lg" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-24 border border-white/10 rounded-lg" />
            </div>

            {/* Icon */}
            <CategoryIcon className="h-12 w-12 text-white/40 mb-2" />
            <span className="text-sm font-medium text-white/60 text-center px-4">
              {template.name}
            </span>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* "Use template" text on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <span className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg shadow-lg">
            Använd mall
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-zinc-100 group-hover:text-white transition-colors truncate">
          {template.name}
        </h3>
        <p className="text-sm text-zinc-500 mt-1 line-clamp-2">
          {template.description}
        </p>

        {/* Stats */}
        <div className="flex items-center gap-4 mt-3 text-xs text-zinc-600">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {template.users}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3" />
            {template.likes}
          </span>
        </div>
      </div>
    </button>
  );
}
