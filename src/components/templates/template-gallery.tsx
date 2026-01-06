"use client";

/**
 * TemplateGallery Component
 * ═══════════════════════════════════════════════════════════════
 *
 * Displays available website categories with:
 * - Staggered fade-in animations on mount
 * - Smooth hover effects with glow
 * - Keyboard navigation support (Enter/Space to select)
 * - Mobile-optimized touch interactions
 *
 * QUICK WIN: Added aria-labels and keyboard support for accessibility
 */

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import * as LucideIcons from "lucide-react";
import {
  getAllV0Categories,
  getTemplatesByCategory,
} from "@/lib/templates/template-data";

// ═══════════════════════════════════════════════════════════════
// ICON MAPPING
// ═══════════════════════════════════════════════════════════════

const iconMap: Record<string, keyof typeof LucideIcons> = {
  Sparkles: "Sparkles",
  Zap: "Zap",
  Puzzle: "Puzzle",
  Lock: "Lock",
  FileText: "FileText",
  Palette: "Palette",
  Layout: "Layout",
  Globe: "Globe",
  Gamepad2: "Gamepad2",
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

interface TemplateGalleryProps {
  onSelect?: (categoryId: string) => void;
}

export function TemplateGallery({ onSelect }: TemplateGalleryProps) {
  const router = useRouter();
  const categories = getAllV0Categories();

  const handleSelect = (categoryId: string) => {
    if (onSelect) {
      onSelect(categoryId);
    }
    router.push(`/category/${categoryId}`);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent, categoryId: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSelect(categoryId);
    }
  };

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 w-full max-w-7xl"
      role="list"
      aria-label="Välj template-kategori"
    >
      {categories.map((category, index) => {
        const IconName = iconMap[category.icon] || "FileText";
        const Icon = LucideIcons[IconName] as React.ComponentType<{
          className?: string;
        }>;
        const templateCount = getTemplatesByCategory(category.id).length;

        // Stagger delay classes for animation
        const staggerClass = `stagger-${index + 1}`;

        return (
          <Card
            key={category.id}
            onClick={() => handleSelect(category.id)}
            onKeyDown={(e) => handleKeyDown(e, category.id)}
            tabIndex={0}
            role="listitem"
            aria-label={`${category.title}: ${category.description}`}
            className={`
              group cursor-pointer
              bg-black/50 border-gray-800
              hover:border-teal-500/50 hover:bg-black/70
              focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20
              transition-all duration-300
              hover:scale-[1.02] hover:shadow-lg hover:shadow-teal-500/10
              animate-fadeInUp opacity-0 ${staggerClass}
              [animation-fill-mode:forwards]
            `}
          >
            <CardContent className="p-8 flex flex-col items-center text-center space-y-4 relative overflow-hidden">
              {/* Subtle glow effect on hover */}
              <div className="absolute inset-0 bg-gradient-to-b from-teal-500/0 via-teal-500/0 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              {/* Large icon with enhanced hover */}
              <div className="relative p-5 bg-gray-900/50 group-hover:bg-teal-600/20 transition-all duration-300 border border-gray-800 group-hover:border-teal-500/30 group-hover:shadow-lg group-hover:shadow-teal-500/20">
                <Icon className="h-10 w-10 text-gray-300 group-hover:text-teal-400 transition-all duration-300 group-hover:scale-110" />
              </div>

              {/* Title and description */}
              <div className="space-y-2 relative">
                <h3 className="text-xl font-bold text-white group-hover:text-white flex items-center justify-center gap-2">
                  {category.title}
                </h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {category.description}
                </p>
              </div>

              {/* Template count */}
              <div className="flex items-center justify-center pt-2">
                <span className="text-xs px-3 py-1.5 bg-gray-800/50 text-gray-400 rounded-full">
                  {templateCount} templates
                </span>
              </div>

              {/* "Get started" indicator on hover */}
              <div className="flex items-center gap-1 text-teal-400 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 mt-2">
                <span className="text-xs font-medium">Välj</span>
                <ArrowRight className="h-3 w-3" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
