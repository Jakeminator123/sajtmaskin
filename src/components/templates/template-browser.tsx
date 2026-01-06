"use client";

/**
 * TemplateBrowser Component
 * ══════════════════════════════════════════════════════════════
 *
 * Beautiful, searchable template browser for quick website starts.
 * Shows all v0 templates in a filterable grid with:
 * - Search by template ID
 * - Category filter tabs
 * - Quick preview + edit actions
 * - Smooth animations
 */

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Search,
  X,
  Loader2,
  Edit,
  Eye,
  Sparkles,
  Layout,
  Zap,
  Puzzle,
  Lock,
  Palette,
  Globe,
  Gamepad2,
  FileText,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TEMPLATES,
  V0_CATEGORIES,
  getTemplatesByCategory,
  getTemplateImageUrl,
  type Template,
} from "@/lib/templates/template-data";
import { createProject } from "@/lib/project-client";
import { PreviewModal } from "./preview-modal";

// ══════════════════════════════════════════════════════════════
// ICON MAPPING
// ══════════════════════════════════════════════════════════════

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Sparkles,
  Zap,
  Puzzle,
  Lock,
  FileText,
  Palette,
  Layout,
  Globe,
  Gamepad2,
};

// ══════════════════════════════════════════════════════════════
// TEMPLATE CARD
// ══════════════════════════════════════════════════════════════

interface TemplateCardProps {
  template: Template;
  onPreview: () => void;
  onEdit: () => void;
  isLoading: boolean;
}

function TemplateCard({
  template,
  onPreview,
  onEdit,
  isLoading,
}: TemplateCardProps) {
  const imageUrl = getTemplateImageUrl(template);

  return (
    <div className="group relative bg-black/40 border border-gray-800/60 rounded-lg overflow-hidden hover:border-teal-500/50 hover:shadow-lg hover:shadow-teal-500/10 transition-all duration-300">
      {/* Image */}
      <div className="relative aspect-[16/10] bg-gray-900 overflow-hidden">
        <Image
          src={imageUrl}
          alt={template.title || template.id}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          loading="lazy"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        <h3 className="font-medium text-white text-sm truncate">
          {template.title || template.id}
        </h3>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={onPreview}
            disabled={!imageUrl}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-800/60 hover:bg-gray-700 border border-gray-700/50 rounded text-gray-300 text-xs font-medium transition-colors disabled:opacity-50"
          >
            <Eye className="h-3.5 w-3.5" />
            Förhandsvisning
          </button>
          <button
            onClick={onEdit}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/30 rounded text-teal-400 text-xs font-medium transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Edit className="h-3.5 w-3.5" />
            )}
            {isLoading ? "Skapar..." : "Använd"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

interface TemplateBrowserProps {
  /** Maximum templates to show initially */
  initialLimit?: number;
  /** Callback when template is selected for editing */
  onSelect?: (templateId: string) => void;
  /** Show compact mode for embedding in home page */
  compact?: boolean;
}

export function TemplateBrowser({
  initialLimit = 12,
  onSelect,
  compact = false,
}: TemplateBrowserProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [loadingTemplateId, setLoadingTemplateId] = useState<string | null>(
    null
  );
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  // Get all categories
  const categories = Object.values(V0_CATEGORIES);

  // Filter templates based on search and category
  const filteredTemplates = useMemo(() => {
    let results = selectedCategory
      ? getTemplatesByCategory(selectedCategory)
      : TEMPLATES;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      results = results.filter(
        (t) =>
          t.id.toLowerCase().includes(query) ||
          t.title.toLowerCase().includes(query) ||
          t.slug.toLowerCase().includes(query)
      );
    }

    // Limit if not showing all
    if (!showAll && !searchQuery) {
      return results.slice(0, initialLimit);
    }

    return results;
  }, [selectedCategory, searchQuery, showAll, initialLimit]);

  // Handle template edit
  const handleEdit = async (template: Template) => {
    if (loadingTemplateId) return;

    setLoadingTemplateId(template.id);

    try {
      if (onSelect) {
        onSelect(template.id);
        return;
      }

      // Create project and navigate to builder
      const project = await createProject(
        `${template.title || template.id} - ${new Date().toLocaleDateString(
          "sv-SE"
        )}`,
        "website",
        `Baserat på v0 template: ${template.id}`
      );
      router.push(`/builder?project=${project.id}&templateId=${template.id}`);
    } catch (error) {
      console.error("Failed to create project:", error);
    } finally {
      setLoadingTemplateId(null);
    }
  };

  // Total available (for "show all" button)
  const totalAvailable = selectedCategory
    ? getTemplatesByCategory(selectedCategory).length
    : TEMPLATES.length;

  return (
    <div className={`w-full ${compact ? "max-w-6xl" : "max-w-7xl"} mx-auto`}>
      {/* Header with search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        {!compact && (
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-500/20 border border-teal-500/30 rounded-lg">
              <Layout className="h-5 w-5 text-teal-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Välj Template</h2>
              <p className="text-sm text-gray-400">
                {totalAvailable} professionella templates att utgå från
              </p>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Sök template..."
            className="w-full pl-10 pr-8 py-2 bg-black/50 border border-gray-800 rounded-lg text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/30 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2 mb-6 pb-4 border-b border-gray-800/50">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
            selectedCategory === null
              ? "bg-teal-500/20 text-teal-400 border border-teal-500/40"
              : "bg-gray-800/40 text-gray-400 border border-gray-700/50 hover:border-gray-600 hover:text-white"
          }`}
        >
          Alla
        </button>
        {categories.map((cat) => {
          const Icon = iconMap[cat.icon] || FileText;
          const count = getTemplatesByCategory(cat.id).length;
          if (count === 0) return null;

          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                selectedCategory === cat.id
                  ? "bg-teal-500/20 text-teal-400 border border-teal-500/40"
                  : "bg-gray-800/40 text-gray-400 border border-gray-700/50 hover:border-gray-600 hover:text-white"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {cat.title}
              <span className="text-xs opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Template grid */}
      {filteredTemplates.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onPreview={() => setPreviewTemplate(template)}
                onEdit={() => handleEdit(template)}
                isLoading={loadingTemplateId === template.id}
              />
            ))}
          </div>

          {/* Show more button */}
          {!showAll &&
            !searchQuery &&
            filteredTemplates.length < totalAvailable && (
              <div className="flex justify-center mt-8">
                <Button
                  onClick={() => setShowAll(true)}
                  variant="outline"
                  className="gap-2 border-gray-700 text-gray-300 hover:text-white hover:border-teal-500/50"
                >
                  Visa alla {totalAvailable} templates
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-4 bg-gray-800/50 rounded-xl mb-4">
            <Search className="h-8 w-8 text-gray-500" />
          </div>
          <h3 className="text-lg font-medium text-gray-300 mb-2">
            Inga templates hittades
          </h3>
          <p className="text-sm text-gray-500 max-w-sm">
            Prova att söka på något annat eller{" "}
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory(null);
              }}
              className="text-teal-400 hover:underline"
            >
              visa alla templates
            </button>
          </p>
        </div>
      )}

      {/* Preview Modal */}
      {previewTemplate && (
        <PreviewModal
          isOpen={!!previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          imageUrl={getTemplateImageUrl(previewTemplate)}
          title={previewTemplate.title || previewTemplate.id}
        />
      )}
    </div>
  );
}
