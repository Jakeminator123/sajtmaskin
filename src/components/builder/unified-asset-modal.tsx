"use client";

/**
 * UnifiedAssetModal Component v1.0
 * ================================
 *
 * Fullskärmsmodal för alla asset-typer med smart placering.
 *
 * Features:
 * - 4 flikar: Sektion, Media, Text, Element
 * - Fullskärmsvy över hela viewporten
 * - Smart uppföljning med CodeCrawler för placering
 * - Mer sofistikerade prompts än enkla "lägg till som header"
 * - Ödmjuk presentation av vad CodeCrawler hittade
 *
 * Flow:
 * 1. Användaren väljer flik (Sektion/Media/Text/Element)
 * 2. Väljer specifik asset
 * 3. PlacementDialog visar sig med:
 *    - Vad CodeCrawler hittade
 *    - Föreslagna placeringar
 *    - Option att bara spara till bibliotek
 * 4. Prompt byggs ut sofistikerat och skickas till chatten
 */

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  X,
  Blocks,
  Image as ImageIcon,
  FileText,
  Search,
  Upload,
  Loader2,
  ChevronDown,
  ChevronRight,
  LayoutTemplate,
  Star,
  Sparkles,
  MapPin,
  Save,
  ArrowRight,
  Code2,
  AlertCircle,
  Check,
  Video,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/utils";
import { useBuilderStore } from "@/lib/data/store";
import { quickSearch, type CodeSnippet } from "@/lib/code-crawler";
import {
  COMPONENT_CATEGORIES,
  type QuickPrompt,
} from "@/lib/templates/template-data";
import type { MediaItem, MediaFileType } from "@/components/media";

// ============================================================================
// TYPES
// ============================================================================

type TabType = "section" | "media" | "text";

interface UnifiedAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  onAssetSelect: (prompt: string, asset?: SelectedAsset) => void;
  disabled?: boolean;
}

interface SelectedAsset {
  type: TabType;
  label: string;
  data?: unknown;
  codeContext?: CodeSnippet[];
  suggestedPlacements?: PlacementSuggestion[];
}

interface PlacementSuggestion {
  id: string;
  label: string;
  description: string;
  prompt: string;
  confidence: "high" | "medium" | "low";
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

// ============================================================================
// CONSTANTS
// ============================================================================

const TABS: {
  id: TabType;
  label: string;
  icon: typeof Blocks;
  description: string;
}[] = [
  {
    id: "section",
    label: "Sektion",
    icon: Blocks,
    description: "UI-komponenter och layouter",
  },
  {
    id: "media",
    label: "Media",
    icon: ImageIcon,
    description: "Bilder, videos och logos",
  },
  {
    id: "text",
    label: "Text",
    icon: FileText,
    description: "Textfiler och innehåll",
  },
];

// Category icons for ComponentPicker
const categoryIcons: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  Essential: Sparkles,
  "Content Blocks": Blocks,
  "Visual Components": ImageIcon,
  "Forms & Inputs": FileText,
  Navigation: LayoutTemplate,
};

// Popular components
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generatePlacementSuggestions(
  assetType: TabType,
  assetLabel: string,
  codeContext: CodeSnippet[]
): PlacementSuggestion[] {
  const suggestions: PlacementSuggestion[] = [];

  // If we found code context, suggest placements based on it
  if (codeContext.length > 0) {
    const foundElements = codeContext.map((c) => c.name).join(", ");

    suggestions.push({
      id: "smart-placement",
      label: "Smart placering (rekommenderat)",
      description: `CodeCrawler hittade: ${foundElements}. AI:n väljer bästa platsen.`,
      prompt: `Integrera detta på lämpligaste plats baserat på kontexten`,
      confidence: "high",
    });
  }

  // Type-specific suggestions
  if (assetType === "section") {
    suggestions.push(
      {
        id: "after-hero",
        label: "Efter hero-sektionen",
        description: "Lägg till direkt efter den översta sektionen",
        prompt: "Lägg till denna sektion direkt efter hero-sektionen",
        confidence: "medium",
      },
      {
        id: "before-footer",
        label: "Före footern",
        description: "Placera som sista innehåll innan sidfoten",
        prompt: "Lägg till denna sektion precis före footern",
        confidence: "medium",
      },
      {
        id: "replace-section",
        label: "Ersätt befintlig sektion",
        description: "Ersätt en existerande sektion med denna",
        prompt: "Ersätt den mest relevanta befintliga sektionen med denna",
        confidence: "low",
      }
    );
  } else if (assetType === "media") {
    suggestions.push(
      {
        id: "hero-background",
        label: "Som hero-bakgrund",
        description: "Använd bilden som bakgrund i hero-sektionen",
        prompt: "Använd denna bild som bakgrundsbild i hero-sektionen",
        confidence: "medium",
      },
      {
        id: "gallery",
        label: "I ett galleri",
        description: "Lägg till bilden i ett bildgalleri",
        prompt: "Lägg till denna bild i ett bildgalleri på sidan",
        confidence: "medium",
      },
      {
        id: "content-image",
        label: "Som innehållsbild",
        description: "Placera bilden vid relevant textinnehåll",
        prompt: "Placera denna bild vid relevant innehåll där den passar bäst",
        confidence: "medium",
      }
    );
  } else if (assetType === "text") {
    suggestions.push(
      {
        id: "about-section",
        label: "I 'Om oss'-sektionen",
        description: "Använd texten i about-sektionen",
        prompt: "Använd denna text i 'Om oss'-sektionen",
        confidence: "medium",
      },
      {
        id: "hero-copy",
        label: "Som hero-text",
        description: "Använd som huvudrubrik och beskrivning",
        prompt:
          "Använd denna text som hero-innehåll med rubrik och beskrivning",
        confidence: "medium",
      }
    );
  }

  // Always add save-only option
  suggestions.push({
    id: "save-only",
    label: "Spara endast till bibliotek",
    description: "Gör ingen ändring nu, spara för senare användning",
    prompt: "",
    confidence: "low",
  });

  return suggestions;
}

function buildSophisticatedPrompt(
  asset: SelectedAsset,
  placement: PlacementSuggestion,
  customInstructions?: string
): string {
  const parts: string[] = [];

  // Start with placement context
  if (placement.id !== "save-only" && placement.prompt) {
    parts.push(placement.prompt);
  }

  // Add asset-specific context
  if (asset.type === "section" && asset.label) {
    parts.push(`Komponenten som ska användas är: ${asset.label}`);
  } else if (asset.type === "media" && asset.data) {
    const mediaData = asset.data as { url?: string; filename?: string };
    if (mediaData.url) {
      parts.push(`Bilden som ska användas: ${mediaData.url}`);
    }
  } else if (asset.type === "text" && asset.data) {
    const textData = asset.data as { content?: string; filename?: string };
    if (textData.content) {
      const preview = textData.content.slice(0, 500);
      parts.push(
        `Textinnehåll att använda:\n---\n${preview}${
          textData.content.length > 500 ? "\n[...]" : ""
        }\n---`
      );
    }
  }

  // Add code context hint if available
  if (asset.codeContext && asset.codeContext.length > 0) {
    const fileNames = asset.codeContext.map((c) => c.name).join(", ");
    parts.push(`\n[CodeCrawler identifierade relevant kod i: ${fileNames}]`);
  }

  // Add custom instructions
  if (customInstructions?.trim()) {
    parts.push(`\nAnvändarens instruktioner: ${customInstructions}`);
  }

  return parts.join("\n\n");
}

function detectTextContentType(content: string): {
  type: string;
  hint: string;
} {
  const lower = content.toLowerCase();

  if (
    lower.includes("om oss") ||
    lower.includes("about us") ||
    lower.includes("vår historia")
  ) {
    return { type: "about", hint: "Ser ut som 'Om oss'-text" };
  }
  if (
    lower.includes("kontakt") ||
    lower.includes("email") ||
    lower.includes("telefon")
  ) {
    return { type: "contact", hint: "Ser ut som kontaktinfo" };
  }
  if (
    lower.includes("tjänst") ||
    lower.includes("service") ||
    lower.includes("vi erbjuder")
  ) {
    return { type: "services", hint: "Ser ut som tjänstebeskrivning" };
  }
  if (
    lower.includes("pris") ||
    lower.includes("kostnad") ||
    lower.includes("paket")
  ) {
    return { type: "pricing", hint: "Ser ut som prislista" };
  }

  return { type: "general", hint: "AI:n analyserar innehållet" };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function UnifiedAssetModal({
  isOpen,
  onClose,
  projectId,
  onAssetSelect,
  disabled = false,
}: UnifiedAssetModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("section");
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset | null>(
    null
  );
  const [showPlacementDialog, setShowPlacementDialog] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Get files from store for CodeCrawler
  const { files } = useBuilderStore();

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setActiveTab("section");
      setSelectedAsset(null);
      setShowPlacementDialog(false);
      setCustomInstructions("");
    }
  }, [isOpen]);

  // Handle asset selection - run CodeCrawler and show placement dialog
  const handleAssetSelected = useCallback(
    (asset: Omit<SelectedAsset, "codeContext" | "suggestedPlacements">) => {
      setIsProcessing(true);

      // Run CodeCrawler to find relevant code
      let codeContext: CodeSnippet[] = [];
      if (files && files.length > 0) {
        // Extract hints based on asset type
        let hints: string[] = [];
        if (asset.type === "section") {
          // Use component label as hints
          const label = asset.label.toLowerCase();
          hints = [label, ...label.split(" ")];
        } else if (asset.type === "media") {
          hints = ["image", "img", "background", "hero", "gallery"];
        } else if (asset.type === "text") {
          const textData = asset.data as { content?: string };
          if (textData?.content) {
            const contentType = detectTextContentType(textData.content);
            hints = [contentType.type, "section", "content", "text"];
          }
        }

        codeContext = quickSearch(files, hints);
      }

      // Generate placement suggestions
      const suggestedPlacements = generatePlacementSuggestions(
        asset.type,
        asset.label,
        codeContext
      );

      // Update selected asset with context
      const fullAsset: SelectedAsset = {
        ...asset,
        codeContext,
        suggestedPlacements,
      };

      setSelectedAsset(fullAsset);
      setShowPlacementDialog(true);
      setIsProcessing(false);
    },
    [files]
  );

  // Handle placement selection
  const handlePlacementSelect = useCallback(
    (placement: PlacementSuggestion) => {
      if (!selectedAsset) return;

      if (placement.id === "save-only") {
        // Just close, asset is already saved if it was media/text
        onClose();
        return;
      }

      // Build sophisticated prompt
      const prompt = buildSophisticatedPrompt(
        selectedAsset,
        placement,
        customInstructions
      );

      // Send to chat
      onAssetSelect(prompt, selectedAsset);
      onClose();
    },
    [selectedAsset, customInstructions, onAssetSelect, onClose]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full h-full max-w-5xl max-h-[90vh] m-4 bg-gray-950 border border-gray-800 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-teal-500/20">
              <Sparkles className="h-5 w-5 text-teal-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Lägg till innehåll
              </h2>
              <p className="text-xs text-gray-500">
                Välj vad du vill lägga till på sidan
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setShowPlacementDialog(false);
                setSelectedAsset(null);
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "text-teal-400 border-b-2 border-teal-400 bg-teal-500/5"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
              )}
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left side: Asset browser */}
          <div
            className={cn(
              "flex-1 overflow-y-auto transition-all duration-300",
              showPlacementDialog ? "w-1/2" : "w-full"
            )}
          >
            {activeTab === "section" && (
              <SectionTab
                onSelect={(component) =>
                  handleAssetSelected({
                    type: "section",
                    label: component.label,
                    data: component,
                  })
                }
                disabled={disabled || isProcessing}
              />
            )}
            {activeTab === "media" && (
              <MediaTab
                projectId={projectId}
                onSelect={(item) =>
                  handleAssetSelected({
                    type: "media",
                    label: item.filename || "Media",
                    data: item,
                  })
                }
                disabled={disabled || isProcessing}
              />
            )}
            {activeTab === "text" && (
              <TextTab
                onSelect={(content, filename) =>
                  handleAssetSelected({
                    type: "text",
                    label: filename,
                    data: { content, filename },
                  })
                }
                disabled={disabled || isProcessing}
              />
            )}
          </div>

          {/* Right side: Placement dialog */}
          {showPlacementDialog && selectedAsset && (
            <div className="w-1/2 border-l border-gray-800 flex flex-col bg-gray-900/30 animate-in slide-in-from-right duration-300">
              <PlacementDialog
                asset={selectedAsset}
                customInstructions={customInstructions}
                onCustomInstructionsChange={setCustomInstructions}
                onPlacementSelect={handlePlacementSelect}
                onBack={() => {
                  setShowPlacementDialog(false);
                  setSelectedAsset(null);
                }}
                isProcessing={isProcessing}
              />
            </div>
          )}
        </div>

        {/* Processing indicator */}
        {isProcessing && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="flex items-center gap-3 px-6 py-4 bg-gray-900 rounded-xl border border-gray-700">
              <Loader2 className="h-5 w-5 animate-spin text-teal-400" />
              <span className="text-sm text-gray-200">
                Analyserar med CodeCrawler...
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SECTION TAB
// ============================================================================

interface SectionTabProps {
  onSelect: (component: QuickPrompt) => void;
  disabled?: boolean;
}

function SectionTab({ onSelect, disabled }: SectionTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(["popular"])
  );

  const allComponents = useMemo(() => {
    return COMPONENT_CATEGORIES.flatMap((cat) =>
      cat.components.map((comp) => ({ ...comp, category: cat.name }))
    );
  }, []);

  const popularComponents = useMemo(() => {
    return allComponents.filter((comp) =>
      POPULAR_COMPONENTS.includes(comp.label)
    );
  }, [allComponents]);

  const filteredComponents = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const query = searchQuery.toLowerCase();
    return allComponents.filter(
      (comp) =>
        comp.label.toLowerCase().includes(query) ||
        comp.prompt.toLowerCase().includes(query)
    );
  }, [searchQuery, allComponents]);

  const toggleCategory = (name: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="p-4 space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
        <Input
          placeholder="Sök bland 60+ komponenter..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 bg-gray-900 border-gray-700"
        />
      </div>

      {/* Results */}
      {filteredComponents ? (
        <div className="space-y-1">
          <p className="text-xs text-gray-500 px-2">
            {filteredComponents.length} resultat
          </p>
          {filteredComponents.map((comp) => (
            <ComponentButton
              key={comp.label}
              component={comp}
              onSelect={onSelect}
              disabled={disabled}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Popular */}
          <CategorySection
            name="popular"
            displayName="Populära komponenter"
            icon={Star}
            components={popularComponents}
            isExpanded={expandedCategories.has("popular")}
            onToggle={() => toggleCategory("popular")}
            onSelect={onSelect}
            disabled={disabled}
            isPopular
          />

          <div className="border-t border-gray-800 my-3" />

          {/* Categories */}
          {COMPONENT_CATEGORIES.map((cat) => (
            <CategorySection
              key={cat.name}
              name={cat.name}
              displayName={cat.name}
              icon={
                categoryIcons[
                  cat.name.replace(/[\u{1F300}-\u{1F9FF}]/gu, "").trim()
                ] || Blocks
              }
              components={cat.components}
              isExpanded={expandedCategories.has(cat.name)}
              onToggle={() => toggleCategory(cat.name)}
              onSelect={onSelect}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MEDIA TAB
// ============================================================================

interface MediaTabProps {
  projectId?: string;
  onSelect: (item: MediaItem) => void;
  disabled?: boolean;
}

// Stock image type for Unsplash results
interface StockImageResult {
  id: string;
  url: string;
  urlSmall: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
}

function MediaTab({ projectId, onSelect, disabled }: MediaTabProps) {
  const [items, setItems] = useState<UploadedMediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [filterType, setFilterType] = useState<MediaFileType | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stock image search state
  const [showStockSearch, setShowStockSearch] = useState(false);
  const [stockSearchQuery, setStockSearchQuery] = useState("");
  const [stockResults, setStockResults] = useState<StockImageResult[]>([]);
  const [isSearchingStock, setIsSearchingStock] = useState(false);
  const [isSavingStock, setIsSavingStock] = useState<string | null>(null);

  // Search stock images from Unsplash
  const handleStockSearch = async () => {
    if (!stockSearchQuery.trim()) return;
    setIsSearchingStock(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/unsplash?query=${encodeURIComponent(stockSearchQuery)}&count=12`
      );
      const data = await response.json();

      if (data.success && data.images) {
        setStockResults(data.images);
      } else {
        setError("Kunde inte söka stockbilder");
      }
    } catch {
      setError("Sökning misslyckades");
    } finally {
      setIsSearchingStock(false);
    }
  };

  // Save stock image to media library
  const handleSaveStockImage = async (img: StockImageResult) => {
    setIsSavingStock(img.id);
    setError(null);

    try {
      const response = await fetch("/api/media/upload-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: img.url,
          filename: `${img.alt.slice(0, 30)}.jpg`,
          source: "unsplash",
          photographer: img.photographer,
        }),
      });

      const data = await response.json();

      if (data.success && data.media) {
        // Add to local list
        setItems((prev) => [
          {
            id: Date.now(),
            url: data.media.url,
            filename: data.media.filename,
            mimeType: data.media.contentType,
            fileType: "image",
            size: data.media.size,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        // Close stock search
        setShowStockSearch(false);
        setStockResults([]);
        setStockSearchQuery("");
      } else {
        setError(data.error || "Kunde inte spara bilden");
      }
    } catch {
      setError("Kunde inte spara bilden");
    } finally {
      setIsSavingStock(null);
    }
  };

  // Load media library
  useEffect(() => {
    const loadMedia = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (filterType !== "all") params.append("fileType", filterType);

        const response = await fetch(`/api/media/upload?${params}`);
        const data = await response.json();

        if (data.success) {
          setItems(data.items);
        } else {
          setError(data.error);
        }
      } catch (err) {
        console.error("[MediaTab] Failed to load:", err);
        setError("Kunde inte ladda mediabiblioteket");
      } finally {
        setIsLoading(false);
      }
    };
    loadMedia();
  }, [filterType]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("file", file);
        if (projectId) formData.append("projectId", projectId);

        const response = await fetch("/api/media/upload", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (data.success) {
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
        } else {
          setError(`Kunde inte ladda upp ${file.name}`);
        }
      }
    } catch {
      setError("Uppladdning misslyckades");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Ta bort filen?")) return;
    try {
      await fetch(`/api/media/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setError("Kunde inte ta bort filen");
    }
  };

  const filteredItems = items.filter(
    (item) =>
      !searchQuery ||
      item.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Stock image search UI
  if (showStockSearch) {
    return (
      <div className="p-4 space-y-4">
        {/* Header with back button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setShowStockSearch(false);
              setStockResults([]);
              setStockSearchQuery("");
            }}
            className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            <ChevronRight className="h-5 w-5 rotate-180" />
          </button>
          <div>
            <h3 className="text-white font-medium">Sök stockbilder</h3>
            <p className="text-xs text-gray-500">Gratis bilder från Unsplash</p>
          </div>
        </div>

        {/* Search input */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Sök bilder... t.ex. 'designer studio'"
              value={stockSearchQuery}
              onChange={(e) => setStockSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStockSearch()}
              className="pl-9 bg-gray-900 border-gray-700"
              autoFocus
            />
          </div>
          <Button
            onClick={handleStockSearch}
            disabled={isSearchingStock || !stockSearchQuery.trim()}
            className="bg-teal-600 hover:bg-teal-500"
          >
            {isSearchingStock ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Results grid */}
        {isSearchingStock ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
          </div>
        ) : stockResults.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              {stockSearchQuery
                ? "Inga bilder hittades"
                : "Sök efter bilder ovan"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {stockResults.map((img) => (
              <div
                key={img.id}
                className="group relative aspect-square rounded-lg overflow-hidden border border-gray-800 hover:border-teal-500/50 transition-colors"
              >
                <Image
                  src={img.urlSmall}
                  alt={img.alt}
                  fill
                  className="object-cover"
                  unoptimized
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-xs text-gray-300 truncate mb-2">
                    {img.photographer}
                  </p>
                  <Button
                    size="sm"
                    onClick={() => handleSaveStockImage(img)}
                    disabled={isSavingStock === img.id}
                    className="w-full bg-teal-600 hover:bg-teal-500 text-xs py-1"
                  >
                    {isSavingStock === img.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Save className="h-3 w-3 mr-1" />
                        Spara till bibliotek
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || disabled}
          className="flex-1 bg-teal-600 hover:bg-teal-500"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Laddar upp...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Ladda upp
            </>
          )}
        </Button>
        <Button
          onClick={() => setShowStockSearch(true)}
          disabled={disabled}
          variant="outline"
          className="flex-1 border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white"
        >
          <ImageIcon className="h-4 w-4 mr-2" />
          Stockbilder
        </Button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Search & Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Sök filer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-gray-900 border-gray-700"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "image", "video", "logo"] as const).map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={cn(
              "px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 transition-colors",
              filterType === type
                ? "bg-teal-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            )}
          >
            {type === "all"
              ? "Alla"
              : type === "image"
              ? "Bilder"
              : type === "video"
              ? "Videos"
              : "Logos"}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Inga filer än. Ladda upp!</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {filteredItems.map((item) => (
            <MediaItemCard
              key={item.id}
              item={item}
              onSelect={() =>
                onSelect({
                  id: `media-${item.id}`,
                  type: item.fileType,
                  url: item.url,
                  filename: item.filename,
                  mimeType: item.mimeType,
                  createdAt: new Date(item.createdAt),
                  source: "uploaded",
                })
              }
              onDelete={() => handleDelete(item.id)}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TEXT TAB
// ============================================================================

interface TextTabProps {
  onSelect: (content: string, filename: string) => void;
  disabled?: boolean;
}

function TextTab({ onSelect, disabled }: TextTabProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingText, setPendingText] = useState<{
    content: string;
    filename: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const contentHint = useMemo(() => {
    if (!pendingText) return null;
    return detectTextContentType(pendingText.content);
  }, [pendingText]);

  const wordCount = useMemo(() => {
    if (!pendingText) return 0;
    return pendingText.content.split(/\s+/).filter((w) => w.length > 0).length;
  }, [pendingText]);

  const handleFile = async (file: File) => {
    setIsProcessing(true);
    setError(null);

    try {
      let content: string;

      if (file.type === "application/pdf") {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/text/extract", {
          method: "POST",
          body: formData,
        });
        if (!response.ok) throw new Error("Kunde inte läsa PDF");
        const data = await response.json();
        content = data.content || "";
      } else {
        content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve((e.target?.result as string) || "");
          reader.onerror = () => reject(new Error("Kunde inte läsa filen"));
          reader.readAsText(file);
        });
      }

      if (!content.trim()) {
        setError("Filen verkar vara tom");
        return;
      }

      setPendingText({ content, filename: file.name });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Kunde inte bearbeta filen"
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) await handleFile(files[0]);
    },
    [disabled]
  );

  return (
    <div className="p-4 space-y-4">
      {!pendingText && !isProcessing && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors",
            isDragging
              ? "border-amber-500 bg-amber-500/10"
              : "border-gray-700 hover:border-gray-600",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <Upload className="h-12 w-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-300 mb-2">Dra in en textfil eller PDF här</p>
          <p className="text-xs text-gray-500">.txt, .md, .json, .pdf stöds</p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.json,.pdf"
        onChange={async (e) => {
          const files = e.target.files;
          if (files?.[0]) await handleFile(files[0]);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
        className="hidden"
      />

      {isProcessing && (
        <div className="flex flex-col items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-amber-400 mb-3" />
          <p className="text-sm text-gray-300">Läser filen...</p>
        </div>
      )}

      {pendingText && !isProcessing && (
        <div className="space-y-4">
          <div className="p-4 bg-gray-900 border border-gray-800 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-200">
                {pendingText.filename}
              </p>
              <span className="text-xs text-gray-500">{wordCount} ord</span>
            </div>
            <p className="text-xs text-gray-500 line-clamp-4">
              {pendingText.content.slice(0, 500)}
              {pendingText.content.length > 500 ? "..." : ""}
            </p>
          </div>

          {contentHint && (
            <div className="flex items-center gap-2 px-3 py-2 bg-teal-500/10 border border-teal-500/30 rounded-lg">
              <Sparkles className="h-4 w-4 text-teal-400" />
              <span className="text-xs text-teal-300">{contentHint.hint}</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={() => setPendingText(null)}
              variant="outline"
              className="flex-1 border-gray-700"
            >
              Välj annan fil
            </Button>
            <Button
              onClick={() =>
                onSelect(pendingText.content, pendingText.filename)
              }
              className="flex-1 bg-teal-600 hover:bg-teal-500"
            >
              Använd denna text
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PLACEMENT DIALOG
// ============================================================================

interface PlacementDialogProps {
  asset: SelectedAsset;
  customInstructions: string;
  onCustomInstructionsChange: (value: string) => void;
  onPlacementSelect: (placement: PlacementSuggestion) => void;
  onBack: () => void;
  isProcessing?: boolean;
}

function PlacementDialog({
  asset,
  customInstructions,
  onCustomInstructionsChange,
  onPlacementSelect,
  onBack,
  isProcessing,
}: PlacementDialogProps) {
  const [selectedPlacement, setSelectedPlacement] =
    useState<PlacementSuggestion | null>(
      asset.suggestedPlacements?.[0] || null
    );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <button
          onClick={onBack}
          className="text-xs text-gray-500 hover:text-gray-300 mb-2 flex items-center gap-1"
        >
          ← Tillbaka
        </button>
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <MapPin className="h-5 w-5 text-teal-400" />
          Var ska det placeras?
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          Valt: <span className="text-gray-300">{asset.label}</span>
        </p>
      </div>

      {/* CodeCrawler results */}
      {asset.codeContext && asset.codeContext.length > 0 && (
        <div className="p-4 border-b border-gray-800 bg-gray-900/50">
          <div className="flex items-center gap-2 mb-2">
            <Code2 className="h-4 w-4 text-teal-400" />
            <span className="text-xs font-medium text-gray-300">
              CodeCrawler hittade:
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {asset.codeContext.map((ctx, i) => (
              <span
                key={i}
                className="px-2 py-1 text-xs bg-gray-800 text-gray-400 rounded"
              >
                {ctx.name}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-gray-600 mt-2">
            Dessa kodfiler kan påverkas av ändringen
          </p>
        </div>
      )}

      {/* Placement options */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {asset.suggestedPlacements?.map((placement) => (
          <button
            key={placement.id}
            onClick={() => setSelectedPlacement(placement)}
            className={cn(
              "w-full p-4 text-left rounded-lg border transition-all",
              selectedPlacement?.id === placement.id
                ? "border-teal-500 bg-teal-500/10"
                : "border-gray-700 hover:border-gray-600 bg-gray-900/50"
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                  selectedPlacement?.id === placement.id
                    ? "border-teal-500 bg-teal-500"
                    : "border-gray-600"
                )}
              >
                {selectedPlacement?.id === placement.id && (
                  <Check className="h-3 w-3 text-white" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-200">
                    {placement.label}
                  </span>
                  {placement.confidence === "high" && (
                    <span className="px-1.5 py-0.5 text-[10px] bg-teal-500/20 text-teal-400 rounded">
                      Rekommenderat
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {placement.description}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Custom instructions */}
      <div className="p-4 border-t border-gray-800 space-y-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">
            Egna instruktioner (valfritt)
          </label>
          <textarea
            value={customInstructions}
            onChange={(e) => onCustomInstructionsChange(e.target.value)}
            placeholder="T.ex. 'Använd blå färg', 'Gör den större'..."
            className="w-full px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:border-teal-500 text-white placeholder:text-gray-600 resize-none"
            rows={2}
          />
        </div>

        <Button
          onClick={() =>
            selectedPlacement && onPlacementSelect(selectedPlacement)
          }
          disabled={!selectedPlacement || isProcessing}
          className="w-full bg-teal-600 hover:bg-teal-500"
        >
          {selectedPlacement?.id === "save-only" ? (
            <>
              <Save className="h-4 w-4 mr-2" />
              Spara till bibliotek
            </>
          ) : (
            <>
              <ArrowRight className="h-4 w-4 mr-2" />
              Skicka till chatten
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

interface CategorySectionProps {
  name: string;
  displayName: string;
  icon: React.ComponentType<{ className?: string }>;
  components: QuickPrompt[];
  isExpanded: boolean;
  onToggle: () => void;
  onSelect: (component: QuickPrompt) => void;
  disabled?: boolean;
  isPopular?: boolean;
}

function CategorySection({
  name,
  displayName,
  icon: Icon,
  components,
  isExpanded,
  onToggle,
  onSelect,
  disabled,
  isPopular,
}: CategorySectionProps) {
  return (
    <div className="rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors",
          isPopular
            ? "bg-teal-600/10 hover:bg-teal-600/20"
            : "hover:bg-gray-800/50"
        )}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-500" />
        )}
        <Icon
          className={cn(
            "h-4 w-4",
            isPopular ? "text-teal-400" : "text-gray-400"
          )}
        />
        <span
          className={cn(
            "flex-1 text-sm font-medium",
            isPopular ? "text-teal-300" : "text-gray-300"
          )}
        >
          {displayName}
        </span>
        <span className="text-xs text-gray-600 bg-gray-800/50 px-1.5 py-0.5 rounded">
          {components.length}
        </span>
      </button>

      {isExpanded && (
        <div className="pl-4 pr-2 pb-2 space-y-0.5">
          {components.map((component) => (
            <ComponentButton
              key={`${name}-${component.label}`}
              component={component}
              onSelect={onSelect}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ComponentButtonProps {
  component: QuickPrompt;
  onSelect: (component: QuickPrompt) => void;
  disabled?: boolean;
}

function ComponentButton({
  component,
  onSelect,
  disabled,
}: ComponentButtonProps) {
  return (
    <button
      onClick={() => !disabled && onSelect(component)}
      disabled={disabled}
      className={cn(
        "w-full flex items-start gap-3 px-3 py-2.5 text-left rounded-md transition-colors group",
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-800/60"
      )}
    >
      <LayoutTemplate className="h-4 w-4 text-gray-600 group-hover:text-teal-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-300 group-hover:text-white">
          {component.label}
        </div>
        <div className="text-xs text-gray-600 group-hover:text-gray-500 line-clamp-1 mt-0.5">
          {component.prompt.substring(0, 70)}...
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-gray-700 group-hover:text-teal-400 opacity-0 group-hover:opacity-100" />
    </button>
  );
}

interface MediaItemCardProps {
  item: UploadedMediaItem;
  onSelect: () => void;
  onDelete: () => void;
  disabled?: boolean;
}

function MediaItemCard({
  item,
  onSelect,
  onDelete,
  disabled,
}: MediaItemCardProps) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onClick={() => !disabled && onSelect()}
      className={cn(
        "relative aspect-square rounded-lg overflow-hidden border transition-all",
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "cursor-pointer border-gray-700 hover:border-teal-500"
      )}
    >
      {item.fileType === "image" || item.fileType === "logo" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.url}
          alt={item.filename}
          className="w-full h-full object-cover"
        />
      ) : item.fileType === "video" ? (
        <div className="w-full h-full bg-gray-800 flex items-center justify-center">
          <Video className="h-8 w-8 text-gray-500" />
        </div>
      ) : (
        <div className="w-full h-full bg-gray-800 flex items-center justify-center">
          <ImageIcon className="h-8 w-8 text-gray-500" />
        </div>
      )}

      {/* Type badge */}
      <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-500/90 text-white">
        {item.fileType}
      </div>

      {/* Hover overlay */}
      {showActions && !disabled && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2 p-2">
          <span className="text-[11px] text-white text-center truncate w-full px-1">
            {item.filename}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
              className="h-7 text-xs bg-teal-600 hover:bg-teal-500"
            >
              Välj
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="h-7 text-xs text-red-400 hover:bg-red-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
