"use client";

import {
  Blocks,
  Loader2,
  Search,
  X,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Replace,
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
  searchBlocks,
  fetchRegistryItem,
  buildRegistryItemUrl,
  buildPreviewUrl,
  buildPreviewImageUrl,
  FEATURED_BLOCKS,
} from "@/lib/shadcn-registry-service";
import { getRegistryStyle } from "@/lib/v0/v0-url-parser";
import {
  analyzeSections,
  generatePlacementOptions,
  type DetectedSection,
} from "@/lib/builder/sectionAnalyzer";

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

  // Build popular items from FEATURED_BLOCKS
  const popularItems = useMemo(() => {
    const allItems = categories.flatMap((cat) => cat.items);
    const popularBlockNames = FEATURED_BLOCKS.flatMap((group) => group.blocks);
    return allItems.filter((item) => popularBlockNames.includes(item.name));
  }, [categories]);

  // Build popular categories for display
  const popularCategories = useMemo(() => {
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
  }, [categories]);

  // Load categories on mount
  useEffect(() => {
    if (!open) return;

    let isActive = true;
    setIsLoadingCategories(true);
    setError(null);

    getBlocksByCategory(DEFAULT_STYLE)
      .then((data) => {
        if (!isActive) return;
        setCategories(data);
        // Auto-select first popular item (from FEATURED_BLOCKS)
        const allItems = data.flatMap((cat) => cat.items);
        const firstPopularBlock = FEATURED_BLOCKS[0]?.blocks[0];
        const firstPopularItem = allItems.find((item) => item.name === firstPopularBlock);
        if (firstPopularItem) {
          setSelectedItem(firstPopularItem);
        } else if (data.length > 0 && data[0].items.length > 0) {
          setSelectedItem(data[0].items[0]);
        }
      })
      .catch((err) => {
        if (!isActive) return;
        setError(err instanceof Error ? err.message : "Kunde inte ladda komponenter");
      })
      .finally(() => {
        if (isActive) setIsLoadingCategories(false);
      });

    return () => {
      isActive = false;
    };
  }, [open]);

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

  // Filter categories by search
  const filteredCategories = useMemo(() => {
    return searchBlocks(categories, query);
  }, [categories, query]);

  // Can user take action?
  const canAct = Boolean(selectedItem) && !isBusy && !isSubmitting && !isLoadingItem;

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
                <DialogTitle className="text-lg font-semibold">Välj en komponent</DialogTitle>
                <DialogDescription className="text-sm text-gray-400">
                  Lägg till professionella komponenter till din hemsida
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
            {/* Tabs */}
            <div className="flex border-b border-gray-800">
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
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === "all"
                    ? "border-b-2 border-violet-500 text-violet-400"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                Alla ({categories.reduce((acc, cat) => acc + cat.items.length, 0)})
              </button>
            </div>

            {/* Search */}
            <div className="p-4">
              <div className="relative">
                <Search className="absolute top-2.5 left-3 h-4 w-4 text-gray-500" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Sök komponenter..."
                  className="bg-gray-900/50 pl-9"
                />
              </div>
            </div>

            {/* Category list */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {isLoadingCategories ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                </div>
              ) : error ? (
                <div className="rounded-lg bg-red-500/10 p-4 text-center text-sm text-red-400">
                  {error}
                </div>
              ) : activeTab === "popular" ? (
                // Popular tab - show featured blocks
                query ? (
                  // When searching, search in popular items
                  popularItems.filter((item) =>
                    `${item.title} ${item.name} ${item.description}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  ).length === 0 ? (
                    <div className="py-12 text-center text-sm text-gray-500">
                      Inga populära komponenter matchar din sökning
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {popularItems
                        .filter((item) =>
                          `${item.title} ${item.name} ${item.description}`
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                        )
                        .map((item) => {
                          const isSelected = selectedItem?.name === item.name;
                          return (
                            <button
                              key={item.name}
                              type="button"
                              onClick={() => setSelectedItem(item)}
                              className={`w-full rounded-lg px-3 py-2.5 text-left transition-all ${
                                isSelected
                                  ? "bg-violet-500/15 ring-1 ring-violet-500/50"
                                  : "hover:bg-gray-800/60"
                              }`}
                            >
                              <div
                                className={`text-sm font-medium ${
                                  isSelected ? "text-violet-300" : "text-gray-200"
                                }`}
                              >
                                {item.title}
                              </div>
                              {item.description && (
                                <div className="mt-0.5 line-clamp-1 text-xs text-gray-500">
                                  {item.description}
                                </div>
                              )}
                            </button>
                          );
                        })}
                    </div>
                  )
                ) : (
                  // No search - show categorized popular blocks
                  <div className="space-y-4">
                    {popularCategories.length === 0 ? (
                      <div className="py-12 text-center text-sm text-gray-500">
                        Laddar populära komponenter...
                      </div>
                    ) : (
                      popularCategories.map((category) => (
                        <div key={category.id}>
                          <div className="mb-2 flex items-center gap-2 px-1">
                            <span className="text-base">{category.icon}</span>
                            <span className="text-xs font-medium tracking-wide text-gray-400 uppercase">
                              {category.labelSv}
                            </span>
                            <span className="text-[10px] text-gray-600">
                              ({category.items.length})
                            </span>
                          </div>
                          <div className="space-y-1">
                            {category.items.map((item) => {
                              const isSelected = selectedItem?.name === item.name;
                              return (
                                <button
                                  key={item.name}
                                  type="button"
                                  onClick={() => setSelectedItem(item)}
                                  className={`w-full rounded-lg px-3 py-2.5 text-left transition-all ${
                                    isSelected
                                      ? "bg-violet-500/15 ring-1 ring-violet-500/50"
                                      : "hover:bg-gray-800/60"
                                  }`}
                                >
                                  <div
                                    className={`text-sm font-medium ${
                                      isSelected ? "text-violet-300" : "text-gray-200"
                                    }`}
                                  >
                                    {item.title}
                                  </div>
                                  {item.description && (
                                    <div className="mt-0.5 line-clamp-1 text-xs text-gray-500">
                                      {item.description}
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )
              ) : filteredCategories.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-500">
                  Inga komponenter matchar din sökning
                </div>
              ) : (
                // All tab - show all categories
                <div className="space-y-4">
                  {filteredCategories.map((category) => (
                    <div key={category.id}>
                      <div className="mb-2 flex items-center gap-2 px-1">
                        <span className="text-base">{category.icon}</span>
                        <span className="text-xs font-medium tracking-wide text-gray-400 uppercase">
                          {category.labelSv}
                        </span>
                        <span className="text-[10px] text-gray-600">({category.items.length})</span>
                      </div>
                      <div className="space-y-1">
                        {category.items.map((item) => {
                          const isSelected = selectedItem?.name === item.name;
                          return (
                            <button
                              key={item.name}
                              type="button"
                              onClick={() => setSelectedItem(item)}
                              className={`w-full rounded-lg px-3 py-2.5 text-left transition-all ${
                                isSelected
                                  ? "bg-violet-500/15 ring-1 ring-violet-500/50"
                                  : "hover:bg-gray-800/60"
                              }`}
                            >
                              <div
                                className={`text-sm font-medium ${
                                  isSelected ? "text-violet-300" : "text-gray-200"
                                }`}
                              >
                                {item.title}
                              </div>
                              {item.description && (
                                <div className="mt-0.5 line-clamp-1 text-xs text-gray-500">
                                  {item.description}
                                </div>
                              )}
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
                  <a
                    href={buildPreviewUrl(selectedItem.name, DEFAULT_STYLE)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Öppna
                  </a>
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

                  {/* Tip */}
                  <div className="mt-6 flex items-start gap-3 rounded-lg bg-violet-500/10 p-4">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
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
                  <Sparkles className="mr-2 h-4 w-4" />
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
