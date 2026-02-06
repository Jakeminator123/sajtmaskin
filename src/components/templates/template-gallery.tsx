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
  getAllVercelTemplates,
} from "@/lib/templates/template-data";

// ═══════════════════════════════════════════════════════════════
// ICON MAPPING
// ═══════════════════════════════════════════════════════════════

const iconMap: Record<string, keyof typeof LucideIcons> = {
  Wand2: "Wand2",
  Zap: "Zap",
  Puzzle: "Puzzle",
  Lock: "Lock",
  FileText: "FileText",
  Palette: "Palette",
  Layout: "Layout",
  Globe: "Globe",
  Gamepad2: "Gamepad2",
  HelpCircle: "HelpCircle",
  Triangle: "Triangle", // Vercel logo
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
      className="grid w-full max-w-7xl grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-4"
      role="list"
      aria-label="Välj template-kategori"
    >
      {categories.map((category, index) => {
        const IconName = iconMap[category.icon] || "FileText";
        const Icon = LucideIcons[IconName] as React.ComponentType<{
          className?: string;
        }>;
        // Handle Vercel templates category specially
        const templateCount =
          category.id === "vercel-templates"
            ? getAllVercelTemplates().length
            : getTemplatesByCategory(category.id).length;

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
            className={`group hover:border-brand-teal/50 focus:border-brand-teal focus:ring-brand-teal/20 hover:shadow-brand-teal/10 animate-fadeInUp cursor-pointer border-gray-800 bg-black/50 transition-all duration-300 hover:scale-[1.02] hover:bg-black/70 hover:shadow-lg focus:ring-2 focus:outline-none ${staggerClass} [animation-fill-mode:forwards]`}
          >
            <CardContent className="relative flex flex-col items-center space-y-4 overflow-hidden p-8 text-center">
              {/* Subtle glow effect on hover */}
              <div className="from-brand-teal/0 via-brand-teal/0 to-brand-teal/5 absolute inset-0 bg-linear-to-b opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

              {/* Large icon with enhanced hover */}
              <div className="group-hover:bg-brand-teal/20 group-hover:border-brand-teal/30 group-hover:shadow-brand-teal/20 relative border border-gray-800 bg-gray-900/50 p-5 transition-all duration-300 group-hover:shadow-lg">
                <Icon className="group-hover:text-brand-teal h-10 w-10 text-gray-300 transition-all duration-300 group-hover:scale-110" />
              </div>

              {/* Title and description */}
              <div className="relative space-y-2">
                <h3 className="flex items-center justify-center gap-2 text-xl font-bold text-white group-hover:text-white">
                  {category.title}
                </h3>
                <p className="text-sm leading-relaxed text-gray-400">{category.description}</p>
              </div>

              {/* Template count */}
              <div className="flex items-center justify-center pt-2">
                <span className="rounded-full bg-gray-800/50 px-3 py-1.5 text-xs text-gray-400">
                  {templateCount} templates
                </span>
              </div>

              {/* "Get started" indicator on hover */}
              <div className="text-brand-teal mt-2 flex translate-y-2 items-center gap-1 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
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
