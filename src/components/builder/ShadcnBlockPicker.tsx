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
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,1200px)] max-w-6xl flex-col overflow-hidden rounded-2xl border-border/50 bg-background/95 p-0 shadow-2xl backdrop-blur-xl">
        {/* ── Header with gradient accent ── */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-brand-teal/50 to-transparent" />
          <DialogHeader className="px-6 pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-brand-teal/20 via-brand-blue/15 to-brand-teal/10 ring-1 ring-brand-teal/20">
                  <Blocks className="h-5 w-5 text-brand-teal" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
                    Välj shadcn/ui-{itemLabel}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    {isLoadingCategories
                      ? "Laddar katalog..."
                      : error
                        ? "Katalogen kunde inte laddas."
                        : `${sourceItemCount} ${itemLabelPlural} tillgängliga`}
                  </DialogDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Type toggle + tabs inline */}
            <div className="mt-4 flex items-center gap-3">
              <div className="flex rounded-lg border border-border bg-muted/30 p-0.5">
                <button
                  type="button"
                  onClick={() => setItemType("block")}
                  className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-all ${
                    itemType === "block"
                      ? "bg-brand-teal/15 text-brand-teal shadow-sm ring-1 ring-brand-teal/20"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Blocks
                </button>
                <button
                  type="button"
                  onClick={() => setItemType("component")}
                  className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-all ${
                    itemType === "component"
                      ? "bg-brand-teal/15 text-brand-teal shadow-sm ring-1 ring-brand-teal/20"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Komponenter
                </button>
              </div>

              <div className="h-4 w-px bg-border" />

              <div className="flex gap-1">
                {itemType === "block" && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("popular")}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeTab === "popular"
                        ? "bg-brand-amber/10 text-brand-amber"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Populära
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab("all")}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeTab === "all"
                      ? "bg-brand-blue/10 text-brand-blue"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Alla ({totalItemCount})
                </button>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* ── Content ── */}
        <div className="flex min-h-0 flex-1 flex-col border-t border-border/50 md:flex-row">
          {/* Left sidebar */}
          <div className="flex w-full flex-col border-b border-border/50 md:w-[340px] md:border-r md:border-b-0">
            {/* Search + filters */}
            <div className="space-y-3 p-4">
              <div className="relative">
                <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={itemType === "block" ? "Sök block..." : "Sök komponenter..."}
                  className="h-9 bg-muted/30 pl-9 text-sm"
                />
              </div>
              {!isLoadingCategories && !error && sourceItemCount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    {visibleItemCount} av {sourceItemCount}
                  </span>
                  <button
                    type="button"
                    onClick={handleReload}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Uppdatera
                  </button>
                </div>
              )}
              {!isLoadingCategories && !error && sourceCategories.length > 0 && (
                <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                  <button
                    type="button"
                    onClick={() => setActiveCategory("all")}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      activeCategory === "all"
                        ? "bg-brand-teal/15 text-brand-teal ring-1 ring-brand-teal/20"
                        : "bg-muted/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Alla
                  </button>
                  {sourceCategories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setActiveCategory(category.id)}
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        activeCategory === category.id
                          ? "bg-brand-teal/15 text-brand-teal ring-1 ring-brand-teal/20"
                          : "bg-muted/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {category.labelSv} ({category.items.length})
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Item list */}
            <div className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-3">
              {isLoadingCategories ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-brand-teal/60" />
                  <span className="text-xs text-muted-foreground">Laddar katalog...</span>
                </div>
              ) : error ? (
                <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
                  <div className="font-medium text-destructive">Kunde inte ladda katalogen</div>
                  <div className="text-xs text-destructive/80">{error}</div>
                  <Button variant="outline" size="sm" onClick={handleReload} className="h-8">
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    Försök igen
                  </Button>
                </div>
              ) : visibleCategories.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  {query
                    ? `Inga ${itemLabelPlural} matchar sökningen`
                    : `Inga ${itemLabelPlural} hittades`}
                </div>
              ) : (
                <div className="space-y-5">
                  {visibleCategories.map((category) => (
                    <div key={category.id}>
                      <div className="mb-2 flex items-center gap-2 px-1">
                        <span className="text-sm">{category.icon}</span>
                        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                          {category.labelSv}
                        </span>
                        <span className="text-[10px] text-muted-foreground/50">
                          {category.items.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-1.5">
                        {category.items.map((item) => {
                          const isSelected = selectedItem?.name === item.name;
                          return (
                            <button
                              key={item.name}
                              type="button"
                              onClick={() => setSelectedItem(item)}
                              className={`group w-full rounded-xl border p-2 text-left transition-all ${
                                isSelected
                                  ? "border-brand-teal/40 bg-brand-teal/5 shadow-sm shadow-brand-teal/5"
                                  : "border-transparent hover:border-border hover:bg-muted/30"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-border/50 bg-white">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={
                                      item.lightImageUrl ||
                                      buildPreviewImageUrl(item.name, "light", DEFAULT_STYLE)
                                    }
                                    alt={`${item.title}`}
                                    className="h-full w-full object-cover object-top"
                                    loading="lazy"
                                    onError={(event) => {
                                      event.currentTarget.style.display = "none";
                                    }}
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`text-sm font-medium ${
                                        isSelected ? "text-brand-teal" : "text-foreground"
                                      }`}
                                    >
                                      {item.title}
                                    </span>
                                    <span
                                      className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ${
                                        item.type === "block"
                                          ? "bg-brand-blue/10 text-brand-blue/70"
                                          : "bg-brand-amber/10 text-brand-amber/70"
                                      }`}
                                    >
                                      {item.type === "block" ? "Block" : "UI"}
                                    </span>
                                  </div>
                                  {item.description && (
                                    <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
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

          {/* ── Right: Preview panel ── */}
          <div className="flex min-h-0 flex-1 flex-col bg-muted/10">
            {selectedItem ? (
              <>
                {/* Preview header */}
                <div className="flex items-center justify-between border-b border-border/50 px-6 py-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-foreground">
                      {selectedItem.title}
                    </h3>
                    {selectedItem.description && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {selectedItem.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
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
                      className="h-7 gap-1.5 text-[11px]"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCodePreview((prev) => !prev)}
                      className={`h-7 gap-1.5 text-[11px] ${showCodePreview ? "bg-brand-teal/10 text-brand-teal border-brand-teal/30" : ""}`}
                    >
                      <Code2 className="h-3 w-3" />
                      Kod
                    </Button>
                  </div>
                </div>

                {/* Preview content */}
                <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
                  {isLoadingItem ? (
                    <div className="flex items-center justify-center py-20">
                      <Loader2 className="h-6 w-6 animate-spin text-brand-teal/60" />
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-4 md:grid-cols-2">
                        {/* Light preview */}
                        <div className="overflow-hidden rounded-xl border border-border/50 bg-white shadow-sm">
                          <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50/80 px-3 py-1.5">
                            <div className="h-2 w-2 rounded-full bg-gray-300" />
                            <div className="h-2 w-2 rounded-full bg-gray-300" />
                            <div className="h-2 w-2 rounded-full bg-gray-300" />
                            <span className="ml-2 text-[10px] font-medium text-gray-400">
                              Ljust tema
                            </span>
                          </div>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={buildPreviewImageUrl(selectedItem.name, "light", DEFAULT_STYLE)}
                            alt={`${selectedItem.title} – ljust`}
                            className="w-full"
                            loading="lazy"
                          />
                        </div>

                        {/* Dark preview */}
                        <div className="overflow-hidden rounded-xl border border-border/50 bg-gray-950 shadow-sm">
                          <div className="flex items-center gap-1.5 border-b border-gray-800 bg-gray-900/80 px-3 py-1.5">
                            <div className="h-2 w-2 rounded-full bg-gray-600" />
                            <div className="h-2 w-2 rounded-full bg-gray-600" />
                            <div className="h-2 w-2 rounded-full bg-gray-600" />
                            <span className="ml-2 text-[10px] font-medium text-gray-500">
                              Mörkt tema
                            </span>
                          </div>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={buildPreviewImageUrl(selectedItem.name, "dark", DEFAULT_STYLE)}
                            alt={`${selectedItem.title} – mörkt`}
                            className="w-full"
                            loading="lazy"
                          />
                        </div>
                      </div>

                      {showCodePreview && registryItem && (
                        <div className="mt-5 overflow-hidden rounded-xl border border-border/50 bg-card">
                          <div className="border-b border-border/50 bg-muted/30 px-4 py-2">
                            <span className="text-[11px] font-medium text-muted-foreground">
                              Registry-kod (kortad)
                            </span>
                          </div>
                          <pre className="scrollbar-thin max-h-80 overflow-auto p-4 text-[11px] leading-relaxed whitespace-pre-wrap text-foreground/80">
                            {buildRegistryMarkdownPreview(registryItem, {
                              style: DEFAULT_STYLE,
                              maxLines: 120,
                            })}
                          </pre>
                        </div>
                      )}

                      {/* Tip */}
                      <div className="mt-5 flex items-start gap-3 rounded-xl border border-brand-teal/15 bg-brand-teal/5 p-4">
                        <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-teal" />
                        <p className="text-[13px] leading-relaxed text-muted-foreground">
                          <span className="font-medium text-brand-teal">Tips:</span> Du kan anpassa
                          färger, text och bilder efter att du lagt till komponenten — beskriv bara
                          vad du vill ändra i chatten!
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
                <Blocks className="h-8 w-8 opacity-30" />
                <span className="text-sm">Välj ett {itemLabel} i listan</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between border-t border-border/50 bg-muted/20 px-6 py-3.5">
          <div className="flex items-center gap-3">
            {hasChat && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-2"
                    disabled={isSubmitting}
                  >
                    {currentPlacement.icon}
                    <span className="hidden text-xs sm:inline">{currentPlacement.label}</span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
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
                        placement === option.value ? "bg-brand-teal/10" : ""
                      }`}
                    >
                      <span className="mt-0.5 shrink-0 text-muted-foreground">{option.icon}</span>
                      <div>
                        <div
                          className={`text-sm font-medium ${
                            placement === option.value ? "text-brand-teal" : "text-foreground"
                          }`}
                        >
                          {option.label}
                        </div>
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!hasChat && (
              <div className="text-xs text-muted-foreground">
                Skapa en sida först för att lägga till komponenter
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              Avbryt
            </Button>
            {hasChat && (
              <Button
                size="sm"
                onClick={() => handleConfirm("add")}
                disabled={!canAct}
                className="bg-brand-teal hover:bg-brand-teal/90 text-white shadow-sm shadow-brand-teal/20"
              >
                {isSubmitting && pendingAction === "add" ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-1.5 h-4 w-4" />
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
