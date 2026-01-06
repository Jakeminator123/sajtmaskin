"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COMPONENT_CATEGORIES, type QuickPrompt } from "@/lib/templates/template-data";
import {
  Plus,
  LayoutTemplate,
  Search,
  X,
  Sparkles,
  Box,
  Image,
  FileText,
  ShoppingCart,
  BarChart3,
  Palette,
  MousePointerClick,
  Navigation,
  Layout,
  MessageCircle,
  Layers,
  ChevronDown,
  ChevronRight,
  Star,
  Blocks,
} from "lucide-react";

// Icon mapping for category icons (emoji in category name removed for icon)
const categoryIcons: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  Essential: Sparkles,
  "Content Blocks": Box,
  "Visual Components": Image,
  "Forms & Inputs": FileText,
  "E-commerce": ShoppingCart,
  "Dashboard & Data": BarChart3,
  "Advanced UI": Palette,
  Interactive: MousePointerClick,
  Navigation: Navigation,
  "Modern Layouts": Layout,
  "Social & Community": MessageCircle,
  Content: Layers,
};

// Popular/recommended components shown at top
const POPULAR_COMPONENTS = [
  "Hero Section",
  "Header/Navigation",
  "Feature Grid",
  "Pricing Table",
  "Contact Form",
  "Testimonials",
  "Footer",
  "FAQ Accordion",
];

interface ComponentPickerProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export function ComponentPicker({ onSelect, disabled }: ComponentPickerProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(["popular"])
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  // Get all components flat for searching
  const allComponents = useMemo(() => {
    return COMPONENT_CATEGORIES.flatMap((cat) =>
      cat.components.map((comp) => ({ ...comp, category: cat.name }))
    );
  }, []);

  // Get popular components
  const popularComponents = useMemo(() => {
    return allComponents.filter((comp) =>
      POPULAR_COMPONENTS.includes(comp.label)
    );
  }, [allComponents]);

  // Filter components based on search query
  const filteredComponents = useMemo(() => {
    if (!searchQuery.trim()) return null;

    const query = searchQuery.toLowerCase();
    return allComponents.filter(
      (comp) =>
        comp.label.toLowerCase().includes(query) ||
        comp.prompt.toLowerCase().includes(query)
    );
  }, [searchQuery, allComponents]);

  // Filter categories based on search query
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) {
      return COMPONENT_CATEGORIES;
    }
    return [];
  }, [searchQuery]);

  const handleSelect = (component: QuickPrompt) => {
    onSelect(component.prompt);
    setOpen(false);
    setSearchQuery("");
  };

  const handleOpen = () => {
    setOpen(!open);
    if (!open) {
      setSearchQuery("");
    }
  };

  const toggleCategory = (categoryName: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryName)) {
        next.delete(categoryName);
      } else {
        next.add(categoryName);
      }
      return next;
    });
  };

  const getCategoryNameClean = (name: string) => {
    return name
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
      .trim();
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Prominent button */}
      <Button
        variant="outline"
        disabled={disabled}
        onClick={handleOpen}
        className="w-full justify-start gap-3 h-11 border-gray-700 bg-gray-800/30 text-gray-200 hover:bg-gray-800 hover:border-teal-600/50 hover:text-white transition-all"
      >
        <div className="flex items-center justify-center w-7 h-7 rounded bg-teal-600/20">
          <Blocks className="h-4 w-4 text-teal-400" />
        </div>
        <span className="flex-1 text-left">Lägg till komponent</span>
        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
          60+
        </span>
      </Button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-full min-w-[420px] bg-gray-950 border border-gray-700 shadow-2xl z-50 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/50">
            <div className="flex items-center gap-2">
              <Blocks className="h-5 w-5 text-teal-400" />
              <span className="text-sm font-semibold text-gray-100">
                Komponentbibliotek
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Search */}
          <div className="p-3 border-b border-gray-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                type="text"
                placeholder="Sök bland 60+ komponenter..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-gray-900 border-gray-700 text-gray-200 placeholder:text-gray-500 focus:border-teal-500 focus:ring-teal-500/20"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="max-h-[450px] overflow-y-auto">
            {/* Search Results */}
            {filteredComponents ? (
              <div className="p-2">
                {filteredComponents.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    Inga komponenter matchar &quot;{searchQuery}&quot;
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="px-2 py-1 text-xs text-gray-500">
                      {filteredComponents.length} resultat
                    </div>
                    {filteredComponents.map((component) => (
                      <ComponentButton
                        key={`search-${component.label}`}
                        component={component}
                        onSelect={handleSelect}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {/* Popular Section */}
                <CategoryAccordion
                  name="popular"
                  displayName="Populära komponenter"
                  icon={Star}
                  components={popularComponents}
                  isExpanded={expandedCategories.has("popular")}
                  onToggle={() => toggleCategory("popular")}
                  onSelect={handleSelect}
                  isPopular
                />

                {/* Divider */}
                <div className="border-t border-gray-800 my-2" />

                {/* All Categories */}
                {filteredCategories.map((category) => {
                  const categoryNameClean = getCategoryNameClean(category.name);
                  const CategoryIcon =
                    categoryIcons[categoryNameClean] || LayoutTemplate;

                  return (
                    <CategoryAccordion
                      key={category.name}
                      name={category.name}
                      displayName={category.name}
                      icon={CategoryIcon}
                      components={category.components}
                      isExpanded={expandedCategories.has(category.name)}
                      onToggle={() => toggleCategory(category.name)}
                      onSelect={handleSelect}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-gray-800 bg-gray-900/50">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Klicka för att lägga till</span>
              <span>{allComponents.length} komponenter</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Accordion for each category
interface CategoryAccordionProps {
  name: string;
  displayName: string;
  icon: React.ComponentType<{ className?: string }>;
  components: QuickPrompt[];
  isExpanded: boolean;
  onToggle: () => void;
  onSelect: (component: QuickPrompt) => void;
  isPopular?: boolean;
}

function CategoryAccordion({
  name,
  displayName,
  icon: Icon,
  components,
  isExpanded,
  onToggle,
  onSelect,
  isPopular,
}: CategoryAccordionProps) {
  return (
    <div className="rounded-lg overflow-hidden">
      {/* Category Header (clickable) */}
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors ${
          isPopular
            ? "bg-teal-600/10 hover:bg-teal-600/20"
            : "hover:bg-gray-800/50"
        }`}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-500" />
        )}
        <Icon
          className={`h-4 w-4 ${isPopular ? "text-teal-400" : "text-gray-400"}`}
        />
        <span
          className={`flex-1 text-sm font-medium ${
            isPopular ? "text-teal-300" : "text-gray-300"
          }`}
        >
          {displayName}
        </span>
        <span className="text-xs text-gray-600 bg-gray-800/50 px-1.5 py-0.5 rounded">
          {components.length}
        </span>
      </button>

      {/* Components (collapsible) */}
      {isExpanded && (
        <div className="pl-4 pr-2 pb-2 space-y-0.5">
          {components.map((component) => (
            <ComponentButton
              key={`${name}-${component.label}`}
              component={component}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Individual component button
interface ComponentButtonProps {
  component: QuickPrompt;
  onSelect: (component: QuickPrompt) => void;
}

function ComponentButton({ component, onSelect }: ComponentButtonProps) {
  return (
    <button
      onClick={() => onSelect(component)}
      className="w-full flex items-start gap-3 px-3 py-2.5 text-left rounded-md hover:bg-gray-800/60 transition-colors group"
    >
      <LayoutTemplate className="h-4 w-4 text-gray-600 group-hover:text-teal-400 transition-colors mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">
          {component.label}
        </div>
        <div className="text-xs text-gray-600 group-hover:text-gray-500 line-clamp-1 mt-0.5">
          {component.prompt.substring(0, 70)}...
        </div>
      </div>
      <Plus className="h-4 w-4 text-gray-700 group-hover:text-teal-400 transition-colors opacity-0 group-hover:opacity-100" />
    </button>
  );
}
