"use client";

import {
  Blocks,
  Loader2,
  Search,
  X,
  Wand2,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Replace,
  Code2,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import type { ShadcnRegistryItem } from "@/lib/shadcn-registry-types";
import {
  type ComponentCategory,
  type ComponentItem,
  getBlocksByCategory,
  getComponentsByCategory,
  searchBlocks,
  fetchRegistryItem,
  buildRegistryItemUrl,
  buildPreviewImageUrl,
  FEATURED_BLOCKS,
} from "@/lib/shadcn-registry-service";
import { getRegistryStyle } from "@/lib/v0/v0-url-parser";
import {
  analyzeSections,
  generatePlacementOptions,
  type DetectedSection,
} from "@/lib/builder/sectionAnalyzer";
import { buildRegistryMarkdownPreview, buildShadcnPreviewUrl } from "@/lib/shadcn-registry-utils";

// ============================================
// TYPES (exported for ChatInterface)
// ============================================

export type ShadcnBlockAction = "add" | "start";

// Placement options for where to add the component
export type PlacementOption = string; // Now dynamic based on detected sections

// Default placement options (used when no code context)
export const DEFAULT_PLACEMENT_OPTIONS: {
  value: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "top",
    label: "Längst upp",
    description: "Överst på sidan, före allt annat innehåll",
    icon: <ArrowUp className="h-4 w-4" />,
  },
  {
    value: "after-hero",
    label: "Efter Hero",
    description: "Direkt efter hero-sektionen",
    icon: <ArrowDown className="h-4 w-4" />,
  },
  {
    value: "after-features",
    label: "Efter Features",
    description: "Efter features/funktioner-sektionen",
    icon: <ArrowDown className="h-4 w-4" />,
  },
  {
    value: "before-footer",
    label: "Före Footer",
    description: "Längst ner, precis före sidfoten",
    icon: <ArrowDown className="h-4 w-4" />,
  },
  {
    value: "bottom",
    label: "Längst ner",
    description: "Allra längst ner på sidan",
    icon: <ArrowDown className="h-4 w-4" />,
  },
  {
    value: "replace-section",
    label: "Ersätt sektion",
    description: "Ersätt en befintlig sektion med denna",
    icon: <Replace className="h-4 w-4" />,
  },
];

// Keep PLACEMENT_OPTIONS as alias for backwards compatibility
export const PLACEMENT_OPTIONS = DEFAULT_PLACEMENT_OPTIONS;

export type ShadcnBlockSelection = {
  block: {
    name: string;
    title: string;
    description: string;
  };
  itemType: "block" | "component";
  registryItem: ShadcnRegistryItem;
  dependencyItems?: ShadcnRegistryItem[];
  registryUrl: string;
  style: string;
  placement?: PlacementOption;
  detectedSections?: DetectedSection[];
};

// ============================================
// COMPONENT
// ============================================

interface ShadcnBlockPickerProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (selection: ShadcnBlockSelection, action: ShadcnBlockAction) => void | Promise<void>;
  isBusy?: boolean;
  isSubmitting?: boolean;
  hasChat?: boolean;
  /** Optional: current generated code to analyze for sections */
  currentCode?: string;
}

const DEFAULT_STYLE = getRegistryStyle();

export function ShadcnBlockPicker({
  open,
  onClose,
  onConfirm,
  isBusy = false,
  isSubmitting = false,
  hasChat = false,
  currentCode,
}: ShadcnBlockPickerProps) {
  // State
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<ComponentCategory[]>([]);
  const [selectedItem, setSelectedItem] = useState<ComponentItem | null>(null);
  const [registryItem, setRegistryItem] = useState<ShadcnRegistryItem | null>(null);
  const [dependencyItems, setDependencyItems] = useState<ShadcnRegistryItem[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isLoadingItem, setIsLoadingItem] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<ShadcnBlockAction | null>(null);
  const [placement, setPlacement] = useState<PlacementOption>("bottom");
  const [activeTab, setActiveTab] = useState<"popular" | "all">("popular");
  const [itemType, setItemType] = useState<"block" | "component">("block");
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [reloadKey, setReloadKey] = useState(0);

  // Analyze sections from current code
  const detectedSections = useMemo(() => {
    if (!currentCode) return [];
    return analyzeSections(currentCode);
  }, [currentCode]);

  // Generate dynamic placement options based on detected sections
  const dynamicPlacementOptions = useMemo(() => {
    if (detectedSections.length === 0) {
      // Use default options if no sections detected
      return DEFAULT_PLACEMENT_OPTIONS;
    }

    // Generate options based on detected sections
    const generated = generatePlacementOptions(detectedSections);
    return generated.map((opt) => ({
      ...opt,
      icon:
        opt.value === "top" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />,
    }));
  }, [detectedSections]);

  // Get the current placement option details
  const currentPlacement =
    dynamicPlacementOptions.find((p) => p.value === placement) ||
    dynamicPlacementOptions[dynamicPlacementOptions.length - 1];

  // Build popular categories for display
  const popularCategories = useMemo(() => {
    if (itemType !== "block") return [];
    const result: ComponentCategory[] = [];
    for (const featured of FEATURED_BLOCKS) {
      const items = categories
        .flatMap((cat) => cat.items)
        .filter((item) => featured.blocks.includes(item.name));
      if (items.length > 0) {
        result.push({
          id: featured.id,
          label: featured.titleSv,
          labelSv: featured.titleSv,
          icon: (featured as { icon?: string }).icon || "📦",
          items,
        });
      }
    }
    return result;
  }, [categories, itemType]);

  const sourceCategories = useMemo(
    () => (activeTab === "popular" ? popularCategories : categories),
    [activeTab, popularCategories, categories],
  );

  const searchedCategories = useMemo(() => {
    return searchBlocks(sourceCategories, query);
  }, [sourceCategories, query]);

  const visibleCategories = useMemo(() => {
    if (activeCategory === "all") return searchedCategories;
    return searchedCategories.filter((category) => category.id === activeCategory);
  }, [searchedCategories, activeCategory]);

  const totalItemCount = useMemo(
    () => categories.reduce((acc, cat) => acc + cat.items.length, 0),
    [categories],
  );

  const sourceItemCount = useMemo(
    () => sourceCategories.reduce((acc, cat) => acc + cat.items.length, 0),
    [sourceCategories],
  );

  const visibleItemCount = useMemo(
    () => visibleCategories.reduce((acc, cat) => acc + cat.items.length, 0),
    [visibleCategories],
  );

  const itemLabel = itemType === "block" ? "block" : "komponent";
  const itemLabelPlural = itemType === "block" ? "block" : "komponenter";

  // Load categories on mount
  useEffect(() => {
    if (!open) return;

    let isActive = true;
    setIsLoadingCategories(true);
    setError(null);
    setCategories([]);
    setSelectedItem(null);
    setActiveCategory("all");

    const loader = itemType === "component" ? getComponentsByCategory : getBlocksByCategory;

    loader(DEFAULT_STYLE)
      .then((data) => {
        if (!isActive) return;
        setCategories(data);
        setActiveCategory("all");
        // Auto-select first popular item (from FEATURED_BLOCKS)
        const allItems = data.flatMap((cat) => cat.items);
        const firstPopularBlock = itemType === "block" ? FEATURED_BLOCKS[0]?.blocks[0] : null;
        const firstPopularItem =
          firstPopularBlock && itemType === "block"
            ? allItems.find((item) => item.name === firstPopularBlock)
            : null;
        if (firstPopularItem) {
          setSelectedItem(firstPopularItem);
        } else if (data.length > 0 && data[0].items.length > 0) {
          setSelectedItem(data[0].items[0]);
        }
      })
      .catch((err) => {
        if (!isActive) return;
        setCategories([]);
        setSelectedItem(null);
        setError(err instanceof Error ? err.message : "Kunde inte ladda katalogen");
      })
      .finally(() => {
        if (isActive) setIsLoadingCategories(false);
      });

    return () => {
      isActive = false;
    };
  }, [open, itemType, reloadKey]);

  // Load selected item details
  useEffect(() => {
    if (!open || !selectedItem) return;

    let isActive = true;
    setIsLoadingItem(true);
    setRegistryItem(null);
    setDependencyItems([]);

    const loadRegistryDetails = async () => {
      try {
        const data = await fetchRegistryItem(selectedItem.name, DEFAULT_STYLE);
        if (!isActive) return;
        setRegistryItem(data);

        const dependencyNames = Array.from(new Set(data.registryDependencies ?? []));
        if (dependencyNames.length > 0) {
          const dependencies = await Promise.all(
            dependencyNames.map(async (dependency) => {
              try {
                return await fetchRegistryItem(dependency, DEFAULT_STYLE);
              } catch {
                return null;
              }
            }),
          );
          if (!isActive) return;
          setDependencyItems(dependencies.filter(Boolean) as ShadcnRegistryItem[]);
        }
      } catch {
        // Silent fail - we can still use the item without full data
      } finally {
        if (isActive) setIsLoadingItem(false);
      }
    };

    loadRegistryDetails();

    return () => {
      isActive = false;
    };
  }, [open, selectedItem]);

  useEffect(() => {
    setShowCodePreview(false);
  }, [selectedItem?.name]);

  useEffect(() => {
    if (itemType === "component" && activeTab === "popular") {
      setActiveTab("all");
    }
  }, [itemType, activeTab]);

  useEffect(() => {
    if (!open) return;
    setActiveCategory("all");
  }, [open, itemType, activeTab]);

  useEffect(() => {
    if (activeCategory === "all") return;
    const exists = sourceCategories.some((category) => category.id === activeCategory);
    if (!exists) {
      setActiveCategory("all");
    }
  }, [activeCategory, sourceCategories]);

  // Can user take action?
  const canAct = Boolean(selectedItem) && !isBusy && !isSubmitting && !isLoadingItem;

  const handleReload = useCallback(() => {
    setReloadKey((prev) => prev + 1);
  }, []);

  // Handle confirm
  const handleConfirm = useCallback(
    async (action: ShadcnBlockAction) => {
      if (!selectedItem) return;

      setPendingAction(action);

      const registryUrl = buildRegistryItemUrl(selectedItem.name, DEFAULT_STYLE);

      await onConfirm(
        {
          block: {
            name: selectedItem.name,
            title: selectedItem.title,
            description: selectedItem.description,
          },
          itemType: selectedItem.type,
          registryItem: registryItem || {
            name: selectedItem.name,
            description: selectedItem.description,
          },
          dependencyItems: dependencyItems.length > 0 ? dependencyItems : undefined,
          registryUrl,
          style: DEFAULT_STYLE,
          placement: action === "add" ? placement : undefined,
          detectedSections: detectedSections.length > 0 ? detectedSections : undefined,
        },
        action,
      );

      setPendingAction(null);
    },
    [selectedItem, registryItem, dependencyItems, onConfirm, placement, detectedSections],
  );

  // Reset pending action when not submitting
  useEffect(() => {
    if (!isSubmitting) {
      setPendingAction(null);
    }
  }, [isSubmitting]);

  useEffect(() => {
    const handleDialogClose = () => onClose();
    window.addEventListener("dialog-close", handleDialogClose);
    return () => window.removeEventListener("dialog-close", handleDialogClose);
  }, [onClose]);

  return (
    <Dialog open={open}>
      <DialogContent className="flex max-h-[90vh] w-[min(95vw,1100px)] max-w-5xl flex-col overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="border-b border-gray-800 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-linear-to-br from-violet-500/20 to-purple-500/20">
                <Blocks className="h-5 w-5 text-violet-400" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold">
                  Välj shadcn/ui-{itemLabel}
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-400">
                  {isLoadingCategories
                    ? "Laddar shadcn-katalog..."
                    : error
                      ? "Katalogen kunde inte laddas."
                      : `Hittade ${sourceItemCount} ${itemLabelPlural} i registret.`}
                </DialogDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 text-gray-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* Sidebar - Categories */}
          <div className="flex w-full flex-col border-b border-gray-800 md:w-80 md:border-r md:border-b-0">
            {/* Type toggle + Tabs */}
            <div className="border-b border-gray-800">
              <div className="flex gap-2 px-4 pt-4">
                <button
                  type="button"
                  onClick={() => setItemType("block")}
                  className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                    itemType === "block"
                      ? "bg-violet-500/20 text-violet-300"
                      : "bg-gray-800/60 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Blocks
                </button>
                <button
                  type="button"
                  onClick={() => setItemType("component")}
                  className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                    itemType === "component"
                      ? "bg-violet-500/20 text-violet-300"
                      : "bg-gray-800/60 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Komponenter
                </button>
              </div>
              <div className="mt-3 flex border-t border-gray-800">
                {itemType === "block" && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("popular")}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                      activeTab === "popular"
                        ? "border-b-2 border-violet-500 text-violet-400"
                        : "text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    ⭐ Populära
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab("all")}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === "all"
                      ? "border-b-2 border-violet-500 text-violet-400"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  Alla ({totalItemCount})
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="p-4">
              <div className="relative">
                <Search className="absolute top-2.5 left-3 h-4 w-4 text-gray-500" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={itemType === "block" ? "Sök block..." : "Sök komponenter..."}
                  className="bg-gray-900/50 pl-9"
                />
              </div>
              {!isLoadingCategories && !error && sourceItemCount > 0 && (
                <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                  <span>
                    Visar {visibleItemCount} av {sourceItemCount}
                  </span>
                  <button
                    type="button"
                    onClick={handleReload}
                    className="inline-flex items-center gap-1 text-gray-400 hover:text-gray-200"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Uppdatera
                  </button>
                </div>
              )}
              {!isLoadingCategories && !error && sourceCategories.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveCategory("all")}
                    className={`rounded-full border px-3 py-1 text-[11px] ${
                      activeCategory === "all"
                        ? "border-violet-500/60 bg-violet-500/15 text-violet-200"
                        : "border-gray-700 text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    Alla ({sourceItemCount})
                  </button>
                  {sourceCategories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setActiveCategory(category.id)}
                      className={`rounded-full border px-3 py-1 text-[11px] ${
                        activeCategory === category.id
                          ? "border-violet-500/60 bg-violet-500/15 text-violet-200"
                          : "border-gray-700 text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      {category.labelSv} ({category.items.length})
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Category list */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {isLoadingCategories ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                </div>
              ) : error ? (
                <div className="space-y-3 rounded-lg bg-red-500/10 p-4 text-sm text-red-300">
                  <div className="font-medium">Kunde inte ladda shadcn-katalogen</div>
                  <div className="text-xs text-red-200/80">{error}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReload}
                      className="h-8 border-red-500/40 text-red-200"
                    >
                      <RefreshCw className="mr-2 h-3.5 w-3.5" />
                      Försök igen
                    </Button>
                    <span className="text-[11px] text-red-200/70">
                      Katalogen är publik, ingen inloggning krävs.
                    </span>
                  </div>
                </div>
              ) : visibleCategories.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-500">
                  {query
                    ? `Inga ${itemLabelPlural} matchar din sökning`
                    : activeTab === "popular"
                      ? "Inga populära block hittades i katalogen"
                      : `Inga ${itemLabelPlural} hittades i katalogen`}
                </div>
              ) : (
                <div className="space-y-4">
                  {visibleCategories.map((category) => (
                    <div key={category.id}>
                      <div className="mb-2 flex items-center gap-2 px-1">
                        <span className="text-base">{category.icon}</span>
                        <span className="text-xs font-medium tracking-wide text-gray-400 uppercase">
                          {category.labelSv}
                        </span>
                        <span className="text-[10px] text-gray-600">({category.items.length})</span>
                      </div>
                      <div className="space-y-2">
                        {category.items.map((item) => {
                          const isSelected = selectedItem?.name === item.name;
                          return (
                            <button
                              key={item.name}
                              type="button"
                              onClick={() => setSelectedItem(item)}
                              className={`w-full rounded-lg border border-transparent px-3 py-2.5 text-left transition-all ${
                                isSelected
                                  ? "border-violet-500/50 bg-violet-500/15"
                                  : "hover:border-gray-700 hover:bg-gray-800/60"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="relative h-12 w-16 overflow-hidden rounded-md border border-gray-800 bg-gray-900">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={
                                      item.lightImageUrl ||
                                      buildPreviewImageUrl(item.name, "light", DEFAULT_STYLE)
                                    }
                                    alt={`${item.title} preview`}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    onError={(event) => {
                                      event.currentTarget.style.display = "none";
                                    }}
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className={`text-sm font-medium ${
                                        isSelected ? "text-violet-300" : "text-gray-200"
                                      }`}
                                    >
                                      {item.title}
                                    </div>
                                    <span className="text-[10px] uppercase text-gray-500">
                                      {item.type === "block" ? "Block" : "UI"}
                                    </span>
                                  </div>
                                  {item.description && (
                                    <div className="mt-0.5 line-clamp-1 text-xs text-gray-500">
                                      {item.description}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Main - Preview */}
          <div className="flex min-h-0 flex-1 flex-col">
            {selectedItem ? (
              <>
                {/* Preview header */}
                <div className="flex items-center justify-between border-b border-gray-800 px-6 py-3">
                  <div>
                    <h3 className="font-semibold text-white">{selectedItem.title}</h3>
                    {selectedItem.description && (
                      <p className="text-sm text-gray-400">{selectedItem.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        window.open(
                          buildShadcnPreviewUrl(selectedItem.name, DEFAULT_STYLE),
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                      className="h-8 gap-2 border-gray-700 bg-gray-800/50 text-xs text-gray-200 hover:text-white"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Öppna preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCodePreview((prev) => !prev)}
                      className="h-8 gap-2 border-gray-700 bg-gray-800/50 text-xs text-violet-300 hover:text-violet-200"
                    >
                      <Code2 className="h-3 w-3" />
                      {showCodePreview ? "Dölj kod" : "Visa kod"}
                    </Button>
                  </div>
                </div>

                {/* Preview images */}
                <div className="flex-1 overflow-y-auto p-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Light mode preview */}
                    <div className="overflow-hidden rounded-xl border border-gray-800 bg-white">
                      <div className="border-b border-gray-200 bg-gray-50 px-3 py-1.5">
                        <span className="text-[10px] font-medium text-gray-500 uppercase">
                          Ljust tema
                        </span>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={buildPreviewImageUrl(selectedItem.name, "light", DEFAULT_STYLE)}
                        alt={`${selectedItem.title} - ljust tema`}
                        className="w-full"
                        loading="lazy"
                      />
                    </div>

                    {/* Dark mode preview */}
                    <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950">
                      <div className="border-b border-gray-800 bg-gray-900 px-3 py-1.5">
                        <span className="text-[10px] font-medium text-gray-500 uppercase">
                          Mörkt tema
                        </span>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={buildPreviewImageUrl(selectedItem.name, "dark", DEFAULT_STYLE)}
                        alt={`${selectedItem.title} - mörkt tema`}
                        className="w-full"
                        loading="lazy"
                      />
                    </div>
                  </div>

                  {showCodePreview && registryItem && (
                    <div className="mt-6 rounded-xl border border-gray-800 bg-gray-950/80 p-4">
                      <div className="mb-2 text-xs font-medium text-gray-400">
                        Registry preview (kortad)
                      </div>
                      <pre className="text-xs whitespace-pre-wrap text-gray-200">
                        {buildRegistryMarkdownPreview(registryItem, {
                          style: DEFAULT_STYLE,
                          maxLines: 120,
                        })}
                      </pre>
                    </div>
                  )}

                  {/* Tip */}
                  <div className="mt-6 flex items-start gap-3 rounded-lg bg-violet-500/10 p-4">
                    <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                    <div className="text-sm text-gray-300">
                      <strong className="text-violet-300">Tips:</strong> Du kan anpassa färger, text
                      och bilder efter att du lagt till komponenten. Beskriv bara vad du vill ändra
                      i chatten!
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-gray-500">
                Välj en komponent i listan
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-800 px-6 py-4">
          <div className="flex items-center gap-3">
            {hasChat && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-2 border-gray-700 bg-gray-800/50"
                    disabled={isSubmitting}
                  >
                    {currentPlacement.icon}
                    <span className="hidden sm:inline">{currentPlacement.label}</span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel className="text-xs text-gray-400">
                    {detectedSections.length > 0
                      ? `Placera bland ${detectedSections.length} sektioner`
                      : "Var ska komponenten placeras?"}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {dynamicPlacementOptions.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => setPlacement(option.value)}
                      className={`flex cursor-pointer items-start gap-3 py-2 ${
                        placement === option.value ? "bg-violet-500/10" : ""
                      }`}
                    >
                      <span className="mt-0.5 shrink-0 text-gray-400">{option.icon}</span>
                      <div>
                        <div
                          className={`text-sm font-medium ${
                            placement === option.value ? "text-violet-300" : "text-gray-200"
                          }`}
                        >
                          {option.label}
                        </div>
                        <div className="text-xs text-gray-500">{option.description}</div>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!hasChat && (
              <div className="text-xs text-gray-500">
                Skapa en sida först för att lägga till komponenter
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Avbryt
            </Button>
            {hasChat && (
              <Button
                onClick={() => handleConfirm("add")}
                disabled={!canAct}
                className="bg-violet-600 hover:bg-violet-500"
              >
                {isSubmitting && pendingAction === "add" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-2 h-4 w-4" />
                )}
                Lägg till
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
