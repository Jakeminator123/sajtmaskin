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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  getCuratedUiCollections,
  searchBlocks,
  fetchRegistryItem,
  fetchRegistryItemWithOptions,
  buildRegistryItemUrl,
  buildPreviewImageUrl,
  FEATURED_BLOCKS,
} from "@/lib/shadcn-registry-service";
import { getRegistryBaseUrl, getRegistryStyle, resolveRegistryStyle } from "@/lib/v0/v0-url-parser";
import {
  analyzeSections,
  generatePlacementOptions,
  type DetectedSection,
} from "@/lib/builder/sectionAnalyzer";
import type { PlacementOption } from "@/lib/builder/placement-utils";
import { UiElementPickerPreview } from "./UiElementPickerPreview";

// ── Exported types ──

export type ShadcnBlockAction = "add" | "start";

export const DEFAULT_PLACEMENT_OPTIONS: {
  value: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  { value: "top", label: "Längst upp", description: "Överst på sidan, före allt annat innehåll", icon: <ArrowUp className="h-4 w-4" /> },
  { value: "after-hero", label: "Efter Hero", description: "Direkt efter hero-sektionen", icon: <ArrowDown className="h-4 w-4" /> },
  { value: "after-features", label: "Efter Features", description: "Efter features/funktioner-sektionen", icon: <ArrowDown className="h-4 w-4" /> },
  { value: "before-footer", label: "Före Footer", description: "Längst ner, precis före sidfoten", icon: <ArrowDown className="h-4 w-4" /> },
  { value: "bottom", label: "Längst ner", description: "Allra längst ner på sidan", icon: <ArrowDown className="h-4 w-4" /> },
  { value: "replace-section", label: "Ersätt sektion", description: "Ersätt en befintlig sektion med denna", icon: <Replace className="h-4 w-4" /> },
];

export const PLACEMENT_OPTIONS = DEFAULT_PLACEMENT_OPTIONS;

export type ShadcnBlockSelection = {
  block: { name: string; title: string; description: string };
  itemType: "block" | "component";
  registryItem: ShadcnRegistryItem;
  dependencyItems?: ShadcnRegistryItem[];
  registryUrl: string;
  style: string;
  placement?: PlacementOption;
  detectedSections?: DetectedSection[];
};

// ── Component ──

interface UiElementPickerProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (selection: ShadcnBlockSelection, action: ShadcnBlockAction) => void | Promise<void>;
  isBusy?: boolean;
  isSubmitting?: boolean;
  hasChat?: boolean;
  currentCode?: string;
}

const REGISTRY_BASE_URL = getRegistryBaseUrl();
const RAW_REGISTRY_STYLE = getRegistryStyle();
const DEFAULT_STYLE = resolveRegistryStyle(RAW_REGISTRY_STYLE, REGISTRY_BASE_URL);
const REGISTRY_LABEL = (() => {
  try { return new URL(REGISTRY_BASE_URL).host; } catch { return REGISTRY_BASE_URL; }
})();
const REGISTRY_STYLE_LABEL =
  RAW_REGISTRY_STYLE && RAW_REGISTRY_STYLE !== DEFAULT_STYLE
    ? `${DEFAULT_STYLE} (från ${RAW_REGISTRY_STYLE})`
    : DEFAULT_STYLE;

export function UiElementPicker({
  open,
  onClose,
  onConfirm,
  isBusy = false,
  isSubmitting = false,
  hasChat = false,
  currentCode,
}: UiElementPickerProps) {
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<ComponentCategory[]>([]);
  const [selectedItem, setSelectedItem] = useState<ComponentItem | null>(null);
  const [registryItem, setRegistryItem] = useState<ShadcnRegistryItem | null>(null);
  const [dependencyItems, setDependencyItems] = useState<ShadcnRegistryItem[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isLoadingItem, setIsLoadingItem] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  const [legacyItemAvailable, setLegacyItemAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<ShadcnBlockAction | null>(null);
  const [placement, setPlacement] = useState<PlacementOption>("bottom");
  const [activeTab, setActiveTab] = useState<"popular" | "all">("all");
  const [itemType, setItemType] = useState<"block" | "component">(() =>
    hasChat ? "component" : "block",
  );
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [reloadKey, setReloadKey] = useState(0);

  const detectedSections = useMemo(() => {
    if (!currentCode) return [];
    return analyzeSections(currentCode);
  }, [currentCode]);

  const dynamicPlacementOptions = useMemo(() => {
    if (detectedSections.length === 0) return DEFAULT_PLACEMENT_OPTIONS;
    return generatePlacementOptions(detectedSections).map((opt) => ({
      ...opt,
      icon: opt.value === "top" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />,
    }));
  }, [detectedSections]);

  const currentPlacement =
    dynamicPlacementOptions.find((p) => p.value === placement) ??
    dynamicPlacementOptions[dynamicPlacementOptions.length - 1];

  const popularCategories = useMemo(() => {
    if (itemType === "component") {
      return getCuratedUiCollections(categories, "component").map((collection) => ({
        id: collection.id,
        label: collection.titleSv,
        labelSv: collection.titleSv,
        icon: collection.icon,
        items: collection.items,
      }));
    }
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
  const searchedCategories = useMemo(() => searchBlocks(sourceCategories, query), [sourceCategories, query]);
  const visibleCategories = useMemo(() => {
    if (activeCategory === "all") return searchedCategories;
    return searchedCategories.filter((c) => c.id === activeCategory);
  }, [searchedCategories, activeCategory]);

  const totalItemCount = useMemo(() => categories.reduce((a, c) => a + c.items.length, 0), [categories]);
  const sourceItemCount = useMemo(() => sourceCategories.reduce((a, c) => a + c.items.length, 0), [sourceCategories]);
  const visibleItemCount = useMemo(() => visibleCategories.reduce((a, c) => a + c.items.length, 0), [visibleCategories]);

  const itemLabel = itemType === "block" ? "block" : "komponent";
  const itemLabelPlural = itemType === "block" ? "block" : "komponenter";

  useEffect(() => {
    if (open) {
      setItemType(hasChat ? "component" : "block");
    }
  }, [open, hasChat]);

  // Load categories
  useEffect(() => {
    if (!open) return;
    let active = true;
    setIsLoadingCategories(true);
    setError(null);
    setCategories([]);
    setSelectedItem(null);
    setActiveCategory("all");

    const loader = itemType === "component" ? getComponentsByCategory : getBlocksByCategory;
    loader(DEFAULT_STYLE, { force: reloadKey > 0 })
      .then((data) => {
        if (!active) return;
        setCategories(data);
        setActiveCategory("all");
        const allItems = data.flatMap((cat) => cat.items);
        const firstPopularBlock = itemType === "block" ? FEATURED_BLOCKS[0]?.blocks[0] : null;
        const match = firstPopularBlock ? allItems.find((i) => i.name === firstPopularBlock) : null;
        if (match) setSelectedItem(match);
        else if (data.length > 0 && data[0].items.length > 0) setSelectedItem(data[0].items[0]);
      })
      .catch((err) => {
        if (!active) return;
        setCategories([]);
        setSelectedItem(null);
        setError(err instanceof Error ? err.message : "Kunde inte ladda katalogen");
      })
      .finally(() => { if (active) setIsLoadingCategories(false); });

    return () => { active = false; };
  }, [open, itemType, reloadKey]);

  // Load selected item details
  useEffect(() => {
    if (!open || !selectedItem) return;
    let active = true;
    setIsLoadingItem(true);
    setRegistryItem(null);
    setDependencyItems([]);
    setItemError(null);
    setLegacyItemAvailable(null);
    const force = reloadKey > 0;

    (async () => {
      try {
        const data = force
          ? await fetchRegistryItemWithOptions(selectedItem.name, DEFAULT_STYLE, { force: true })
          : await fetchRegistryItem(selectedItem.name, DEFAULT_STYLE);
        if (!active) return;
        setRegistryItem(data);
        const depNames = Array.from(new Set(data.registryDependencies ?? []));
        if (depNames.length > 0) {
          const deps = await Promise.all(
            depNames.map(async (d) => { try { return await fetchRegistryItem(d, DEFAULT_STYLE); } catch { return null; } }),
          );
          if (active) setDependencyItems(deps.filter(Boolean) as ShadcnRegistryItem[]);
        }
      } catch (err) {
        if (!active) return;
        setItemError(err instanceof Error ? err.message : "Kunde inte ladda registry-item");
        try {
          await fetchRegistryItemWithOptions(selectedItem.name, undefined, { force, source: "legacy" });
          if (active) setLegacyItemAvailable(true);
        } catch {
          if (active) setLegacyItemAvailable(false);
        }
      } finally {
        if (active) setIsLoadingItem(false);
      }
    })();

    return () => { active = false; };
  }, [open, selectedItem, reloadKey]);

  useEffect(() => { setLegacyItemAvailable(null); }, [selectedItem?.name, reloadKey]);
  useEffect(() => { setFailedThumbnails(new Set()); }, [open, itemType, reloadKey]);
  useEffect(() => {
    if (activeTab === "popular" && popularCategories.length === 0) {
      setActiveTab("all");
    }
  }, [activeTab, popularCategories.length]);
  useEffect(() => { if (open) setActiveCategory("all"); }, [open, itemType, activeTab]);
  useEffect(() => {
    if (activeCategory !== "all" && !sourceCategories.some((c) => c.id === activeCategory)) {
      setActiveCategory("all");
    }
  }, [activeCategory, sourceCategories]);
  useEffect(() => { if (!isSubmitting) setPendingAction(null); }, [isSubmitting]);
  const waitForNextPaint = useCallback(async () => {
    if (typeof window === "undefined") return;
    await new Promise<void>((r) => requestAnimationFrame(() => window.setTimeout(r, 0)));
  }, []);

  const canAct = Boolean(selectedItem) && !isBusy && !isSubmitting && !isLoadingItem && !itemError && !pendingAction;
  const canStartFromRegistry = canAct && itemType === "block";
  const handleReload = useCallback(() => setReloadKey((k) => k + 1), []);

  const handleConfirm = useCallback(
    async (action: ShadcnBlockAction) => {
      if (!selectedItem) return;
      setPendingAction(action);
      await waitForNextPaint();
      const registryUrl = buildRegistryItemUrl(selectedItem.name, DEFAULT_STYLE);
      await onConfirm(
        {
          block: { name: selectedItem.name, title: selectedItem.title, description: selectedItem.description },
          itemType: selectedItem.type,
          registryItem: registryItem || { name: selectedItem.name, description: selectedItem.description },
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
    [selectedItem, registryItem, dependencyItems, onConfirm, placement, detectedSections, waitForNextPaint],
  );

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,1200px)] max-w-6xl flex-col overflow-hidden rounded-2xl border-border/50 bg-background/95 p-0 shadow-2xl backdrop-blur-xl">
        {/* Header */}
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
                    Välj UI‑element
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    {isLoadingCategories
                      ? "Laddar katalog..."
                      : error
                        ? "Katalogen kunde inte laddas."
                        : `${sourceItemCount} ${itemLabelPlural} tillgängliga`}
                  </DialogDescription>
                  <div className="mt-1 text-[11px] text-muted-foreground/70">
                    Källa: {REGISTRY_LABEL} • style: {REGISTRY_STYLE_LABEL}
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Stäng" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg border border-border bg-muted/30 p-0.5">
                {(["block", "component"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setItemType(t)}
                    className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-all ${
                      itemType === t
                        ? "bg-brand-teal/15 text-brand-teal shadow-sm ring-1 ring-brand-teal/20"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t === "block" ? "Blocks" : "Komponenter"}
                  </button>
                ))}
              </div>
              <div className="h-4 w-px bg-border" />
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "popular" | "all")}>
                <TabsList className="h-auto w-auto gap-1 bg-transparent p-0">
                  {itemType === "block" && (
                    <TabsTrigger
                      value="popular"
                      className="h-auto rounded-md border-0 px-3 py-1.5 text-xs font-medium shadow-none transition-colors data-[state=active]:bg-brand-amber/10 data-[state=active]:text-brand-amber data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                    >
                      Populära
                    </TabsTrigger>
                  )}
                  <TabsTrigger
                    value="all"
                    className="h-auto rounded-md border-0 px-3 py-1.5 text-xs font-medium shadow-none transition-colors data-[state=active]:bg-brand-blue/10 data-[state=active]:text-brand-blue data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                  >
                    Alla ({totalItemCount})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </DialogHeader>
        </div>

        {/* Content */}
        <div className="flex min-h-0 flex-1 flex-col border-t border-border/50 md:flex-row">
          {/* Left sidebar */}
          <div className="flex w-full flex-col border-b border-border/50 md:w-[340px] md:border-r md:border-b-0">
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
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      {visibleItemCount} av {sourceItemCount}
                    </span>
                    <button type="button" onClick={handleReload} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                      <RefreshCw className="h-3 w-3" /> Uppdatera
                    </button>
                  </div>
                  {itemType === "component" && activeTab === "popular" && popularCategories.length > 0 && (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Kuraterade samlingar för headers, footers, modaler, badges, motion och dataintensiva UI-ytor.
                    </p>
                  )}
                </div>
              )}
              {!isLoadingCategories && !error && sourceCategories.length > 0 && (
                <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                  <CategoryPill active={activeCategory === "all"} onClick={() => setActiveCategory("all")} label="Alla" />
                  {sourceCategories.map((cat) => (
                    <CategoryPill key={cat.id} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} label={`${cat.labelSv} (${cat.items.length})`} />
                  ))}
                </div>
              )}
            </div>

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
                    <RefreshCw className="mr-2 h-3.5 w-3.5" /> Försök igen
                  </Button>
                </div>
              ) : visibleCategories.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  {query ? `Inga ${itemLabelPlural} matchar sökningen` : `Inga ${itemLabelPlural} hittades`}
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
                        <span className="text-[10px] text-muted-foreground/50">{category.items.length}</span>
                      </div>
                      <div className="grid grid-cols-1 gap-1.5">
                        {category.items.map((item) => {
                          const isSelected = selectedItem?.name === item.name;
                          const showThumb = item.type === "block";
                          const thumbUrl = showThumb
                            ? item.lightImageUrl || buildPreviewImageUrl(item.name, "light", DEFAULT_STYLE)
                            : null;
                          const thumbFailed = showThumb && thumbUrl ? failedThumbnails.has(item.name) : false;
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
                                <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg border border-border/50 bg-white">
                                  {thumbUrl && !thumbFailed ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={thumbUrl}
                                      alt={item.title}
                                      className="h-full w-full object-cover object-top"
                                      loading="lazy"
                                      onError={() => setFailedThumbnails((prev) => {
                                        if (prev.has(item.name)) return prev;
                                        const next = new Set(prev);
                                        next.add(item.name);
                                        return next;
                                      })}
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-muted/40 text-[10px] text-muted-foreground">
                                      Ingen preview
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-sm font-medium ${isSelected ? "text-brand-teal" : "text-foreground"}`}>
                                      {item.title}
                                    </span>
                                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ${
                                      item.type === "block" ? "bg-brand-blue/10 text-brand-blue/70" : "bg-brand-amber/10 text-brand-amber/70"
                                    }`}>
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

          {/* Right: Preview */}
          <div className="flex min-h-0 flex-1 flex-col bg-muted/10">
            <UiElementPickerPreview
              selectedItem={selectedItem}
              registryItem={registryItem}
              isLoading={isLoadingItem}
              error={itemError}
              legacyAvailable={legacyItemAvailable}
              style={DEFAULT_STYLE}
              itemLabel={itemLabel}
              onReload={handleReload}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/50 bg-muted/20 px-6 py-3.5">
          <div className="flex items-center gap-3">
            {hasChat ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-2" disabled={isSubmitting}>
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
                  {dynamicPlacementOptions.map((opt) => (
                    <DropdownMenuItem
                      key={opt.value}
                      onClick={() => setPlacement(opt.value)}
                      className={`flex cursor-pointer items-start gap-3 py-2 ${placement === opt.value ? "bg-brand-teal/10" : ""}`}
                    >
                      <span className="mt-0.5 shrink-0 text-muted-foreground">{opt.icon}</span>
                      <div>
                        <div className={`text-sm font-medium ${placement === opt.value ? "text-brand-teal" : "text-foreground"}`}>
                          {opt.label}
                        </div>
                        <div className="text-xs text-muted-foreground">{opt.description}</div>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="text-xs text-muted-foreground">
                Skapa en sida först för att lägga till komponenter
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              Avbryt
            </Button>
            {hasChat ? (
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
            ) : (
              <Button
                size="sm"
                onClick={() => handleConfirm("start")}
                disabled={!canStartFromRegistry}
                className="bg-brand-amber hover:bg-brand-amber/90 text-white shadow-sm shadow-brand-amber/20"
              >
                Starta från block
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CategoryPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? "bg-brand-teal/15 text-brand-teal ring-1 ring-brand-teal/20"
          : "bg-muted/40 text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
