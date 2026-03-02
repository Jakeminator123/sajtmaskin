"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Blocks,
  ChevronDown,
  LayoutGrid,
  Loader2,
  MessageSquare,
  Code2,
  GitBranch,
  Package,
  Palette,
  Plus,
  RefreshCw,
  Search,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import type { ShadcnRegistryItem } from "@/lib/shadcn-registry-types";
import type {
  ComponentCategory,
  ComponentItem,
} from "@/lib/shadcn-registry-service";
import {
  getBlocksByCategory,
  getComponentsByCategory,
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
import { UiElementPickerPreview } from "./UiElementPickerPreview";

import {
  AI_ELEMENT_ITEMS,
  AI_ELEMENT_CATEGORIES,
  type AiElementCatalogItem,
  type AiElementCategory,
} from "@/lib/builder/ai-elements-catalog";
import type { ComponentPreviewKind } from "@/lib/builder/shadcn-component-metadata";
import type { PaletteSelection } from "@/lib/builder/palette";

import {
  getAllV0Categories,
  getTemplateImageUrl,
  getTemplatesByCategory,
  type CategoryInfo,
  type Template,
} from "@/lib/templates/template-data";

import {
  DESIGN_THEME_OPTIONS,
  THEME_PRESETS,
  type DesignTheme,
} from "@/lib/builder/theme-presets";

import type { ShadcnBlockAction, ShadcnBlockSelection, PlacementOption } from "./UiElementPicker";
import { DEFAULT_PLACEMENT_OPTIONS } from "./UiElementPicker";

// ── Types ──

export type UnifiedPickerTab = "ui" | "ai" | "mall" | "tema";

interface UnifiedElementPickerProps {
  open: boolean;
  initialTab?: UnifiedPickerTab;
  onClose: () => void;
  onUiConfirm: (selection: ShadcnBlockSelection, action: ShadcnBlockAction) => void | Promise<void>;
  onAiConfirm: (item: AiElementCatalogItem, options: { placement?: string; detectedSections?: DetectedSection[] }) => void;
  onTemplateSelect: (templateId: string) => void;
  onThemeSelect: (theme: DesignTheme) => void;
  isBusy?: boolean;
  isSubmitting?: boolean;
  hasChat?: boolean;
  currentCode?: string;
  paletteSelections?: PaletteSelection[];
  currentTheme?: DesignTheme;
  showThemeTab?: boolean;
}

// ── Registry constants ──

const REGISTRY_BASE_URL = getRegistryBaseUrl();
const RAW_REGISTRY_STYLE = getRegistryStyle();
const DEFAULT_STYLE = resolveRegistryStyle(RAW_REGISTRY_STYLE, REGISTRY_BASE_URL);

const CATEGORY_ICONS: Record<AiElementCategory, typeof MessageSquare> = {
  chat: MessageSquare,
  code: Code2,
  workflow: GitBranch,
  tools: Wand2,
  utility: Package,
};

// ── Component ──

export function UnifiedElementPicker({
  open,
  initialTab = "ui",
  onClose,
  onUiConfirm,
  onAiConfirm,
  onTemplateSelect,
  onThemeSelect,
  isBusy = false,
  isSubmitting = false,
  hasChat = false,
  currentCode,
  paletteSelections,
  currentTheme = "blue",
  showThemeTab = true,
}: UnifiedElementPickerProps) {
  const [activeTab, setActiveTab] = useState<UnifiedPickerTab>(initialTab);

  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

  // Shared placement state
  const detectedSections = useMemo(() => {
    if (!currentCode) return [];
    return analyzeSections(currentCode);
  }, [currentCode]);

  const dynamicPlacementOptions = useMemo(() => {
    if (detectedSections.length === 0) return DEFAULT_PLACEMENT_OPTIONS;
    return generatePlacementOptions(detectedSections).map((opt) => ({
      ...opt,
      icon: opt.value === "top" ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />,
    }));
  }, [detectedSections]);

  const [placement, setPlacement] = useState<PlacementOption>("bottom");
  const currentPlacement =
    dynamicPlacementOptions.find((p) => p.value === placement) ??
    dynamicPlacementOptions[dynamicPlacementOptions.length - 1];

  // ── UI Element tab state ──
  const [uiQuery, setUiQuery] = useState("");
  const [uiCategories, setUiCategories] = useState<ComponentCategory[]>([]);
  const [uiSelectedItem, setUiSelectedItem] = useState<ComponentItem | null>(null);
  const [uiRegistryItem, setUiRegistryItem] = useState<ShadcnRegistryItem | null>(null);
  const [uiDependencyItems, setUiDependencyItems] = useState<ShadcnRegistryItem[]>([]);
  const [uiLoadingCategories, setUiLoadingCategories] = useState(true);
  const [uiLoadingItem, setUiLoadingItem] = useState(false);
  const [uiItemError, setUiItemError] = useState<string | null>(null);
  const [uiLegacyAvailable, setUiLegacyAvailable] = useState<boolean | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);
  const [uiPendingAction, setUiPendingAction] = useState<ShadcnBlockAction | null>(null);
  const [uiItemType, setUiItemType] = useState<"block" | "component">("block");
  const [uiActiveCategory, setUiActiveCategory] = useState("all");
  const [uiReloadKey, setUiReloadKey] = useState(0);
  const [uiFailedThumbs, setUiFailedThumbs] = useState<Set<string>>(new Set());

  const uiSearched = useMemo(() => searchBlocks(uiCategories, uiQuery), [uiCategories, uiQuery]);
  const uiVisible = useMemo(() => {
    if (uiActiveCategory === "all") return uiSearched;
    return uiSearched.filter((c) => c.id === uiActiveCategory);
  }, [uiSearched, uiActiveCategory]);
  const _uiTotalCount = useMemo(() => uiCategories.reduce((a, c) => a + c.items.length, 0), [uiCategories]);
  const _uiVisibleCount = useMemo(() => uiVisible.reduce((a, c) => a + c.items.length, 0), [uiVisible]);

  useEffect(() => {
    if (!open || activeTab !== "ui") return;
    let active = true;
    setUiLoadingCategories(true);
    setUiError(null);
    setUiCategories([]);
    setUiSelectedItem(null);
    setUiActiveCategory("all");
    const loader = uiItemType === "component" ? getComponentsByCategory : getBlocksByCategory;
    loader(DEFAULT_STYLE, { force: uiReloadKey > 0 })
      .then((data) => {
        if (!active) return;
        setUiCategories(data);
        const allItems = data.flatMap((cat) => cat.items);
        const firstPopular = uiItemType === "block" ? FEATURED_BLOCKS[0]?.blocks[0] : null;
        const match = firstPopular ? allItems.find((i) => i.name === firstPopular) : null;
        if (match) setUiSelectedItem(match);
        else if (data.length > 0 && data[0].items.length > 0) setUiSelectedItem(data[0].items[0]);
      })
      .catch((err) => {
        if (!active) return;
        setUiError(err instanceof Error ? err.message : "Kunde inte ladda katalogen");
      })
      .finally(() => { if (active) setUiLoadingCategories(false); });
    return () => { active = false; };
  }, [open, activeTab, uiItemType, uiReloadKey]);

  useEffect(() => {
    if (!open || activeTab !== "ui" || !uiSelectedItem) return;
    let active = true;
    setUiLoadingItem(true);
    setUiRegistryItem(null);
    setUiDependencyItems([]);
    setUiItemError(null);
    setUiLegacyAvailable(null);
    const force = uiReloadKey > 0;
    (async () => {
      try {
        const data = force
          ? await fetchRegistryItemWithOptions(uiSelectedItem.name, DEFAULT_STYLE, { force: true })
          : await fetchRegistryItem(uiSelectedItem.name, DEFAULT_STYLE);
        if (!active) return;
        setUiRegistryItem(data);
        const depNames = Array.from(new Set(data.registryDependencies ?? []));
        if (depNames.length > 0) {
          const deps = await Promise.all(
            depNames.map(async (d) => { try { return await fetchRegistryItem(d, DEFAULT_STYLE); } catch { return null; } }),
          );
          if (active) setUiDependencyItems(deps.filter(Boolean) as ShadcnRegistryItem[]);
        }
      } catch (err) {
        if (!active) return;
        setUiItemError(err instanceof Error ? err.message : "Kunde inte ladda registry-item");
        try {
          await fetchRegistryItemWithOptions(uiSelectedItem.name, undefined, { force, source: "legacy" });
          if (active) setUiLegacyAvailable(true);
        } catch { if (active) setUiLegacyAvailable(false); }
      } finally { if (active) setUiLoadingItem(false); }
    })();
    return () => { active = false; };
  }, [open, activeTab, uiSelectedItem, uiReloadKey]);

  useEffect(() => { setUiFailedThumbs(new Set()); }, [open, uiItemType, uiReloadKey]);
  useEffect(() => { if (!isSubmitting) setUiPendingAction(null); }, [isSubmitting]);

  const uiCanAct = Boolean(uiSelectedItem) && !isBusy && !isSubmitting && !uiLoadingItem && !uiItemError && !uiPendingAction;
  const handleUiReload = useCallback(() => setUiReloadKey((k) => k + 1), []);

  const handleUiConfirm = useCallback(
    async (action: ShadcnBlockAction) => {
      if (!uiSelectedItem) return;
      setUiPendingAction(action);
      await new Promise<void>((r) => requestAnimationFrame(() => window.setTimeout(r, 0)));
      const registryUrl = buildRegistryItemUrl(uiSelectedItem.name, DEFAULT_STYLE);
      await onUiConfirm(
        {
          block: { name: uiSelectedItem.name, title: uiSelectedItem.title, description: uiSelectedItem.description },
          itemType: uiSelectedItem.type,
          registryItem: uiRegistryItem || { name: uiSelectedItem.name, description: uiSelectedItem.description },
          dependencyItems: uiDependencyItems.length > 0 ? uiDependencyItems : undefined,
          registryUrl,
          style: DEFAULT_STYLE,
          placement: action === "add" ? placement : undefined,
          detectedSections: detectedSections.length > 0 ? detectedSections : undefined,
        },
        action,
      );
      setUiPendingAction(null);
    },
    [uiSelectedItem, uiRegistryItem, uiDependencyItems, onUiConfirm, placement, detectedSections],
  );

  // ── AI Element tab state ──
  const [aiQuery, setAiQuery] = useState("");
  const [aiSelectedId, setAiSelectedId] = useState<string | null>(AI_ELEMENT_ITEMS[0]?.id ?? null);
  const [aiActiveCategory, setAiActiveCategory] = useState<AiElementCategory | "all">("all");

  const filteredAiItems = useMemo(() => {
    let items = AI_ELEMENT_ITEMS;
    if (aiActiveCategory !== "all") {
      items = items.filter((item) => item.category === aiActiveCategory);
    }
    const trimmed = aiQuery.trim().toLowerCase();
    if (!trimmed) return items;
    return items.filter((item) => {
      const haystack = [item.label, item.description, ...(item.tags ?? [])].join(" ").toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [aiQuery, aiActiveCategory]);

  const selectedAiItem = useMemo(
    () => filteredAiItems.find((item) => item.id === aiSelectedId) ?? filteredAiItems[0],
    [filteredAiItems, aiSelectedId],
  );

  const paletteSelectionSet = useMemo(() => {
    const entries = paletteSelections ?? [];
    return new Set(entries.map((entry) => `${entry.source}:${entry.id}`));
  }, [paletteSelections]);

  const canAddAiElement = Boolean(selectedAiItem) && !isBusy && !isSubmitting && hasChat;

  const handleAiConfirm = useCallback(() => {
    if (!selectedAiItem) return;
    onAiConfirm(selectedAiItem, { placement, detectedSections });
  }, [selectedAiItem, onAiConfirm, placement, detectedSections]);

  // ── Template tab state ──
  const templateCategories = useMemo(() => getAllV0Categories(), []);
  const [templateCategory, setTemplateCategory] = useState<string>(() => {
    const cats = getAllV0Categories();
    return cats[0]?.id ?? "website-templates";
  });
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const templateItems = useMemo(() => getTemplatesByCategory(templateCategory), [templateCategory]);

  useEffect(() => {
    if (templateItems.length > 0) setSelectedTemplate(templateItems[0]);
    else setSelectedTemplate(null);
  }, [templateItems]);

  const canStartTemplate = Boolean(selectedTemplate) && !isBusy;
  const handleTemplateConfirm = () => {
    if (!selectedTemplate) return;
    onTemplateSelect(selectedTemplate.id);
  };

  // ── Theme tab state ──
  const [selectedTheme, setSelectedTheme] = useState<DesignTheme>(currentTheme);
  useEffect(() => { if (open) setSelectedTheme(currentTheme); }, [open, currentTheme]);
  const selectedThemeOption = useMemo(
    () => DESIGN_THEME_OPTIONS.find((o) => o.value === selectedTheme),
    [selectedTheme],
  );
  const selectedThemeColors =
    selectedTheme !== "off" && selectedTheme !== "custom"
      ? THEME_PRESETS[selectedTheme as keyof typeof THEME_PRESETS]
      : null;
  const canApplyTheme = !isBusy && selectedTheme !== currentTheme;
  const handleThemeConfirm = async () => {
    await onThemeSelect(selectedTheme);
  };

  // ── Tab config ──
  const tabs: { id: UnifiedPickerTab; label: string; icon: typeof Blocks }[] = [
    { id: "ui", label: "UI‑element", icon: Blocks },
    { id: "ai", label: "AI‑element", icon: Wand2 },
    { id: "mall", label: "Mallar", icon: LayoutGrid },
    ...(showThemeTab ? [{ id: "tema" as const, label: "Tema", icon: Palette }] : []),
  ];

  const showPlacement = (activeTab === "ui" || activeTab === "ai") && hasChat;

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="flex h-[80vh] max-h-[900px] w-[min(96vw,1100px)] max-w-5xl flex-col overflow-hidden rounded-2xl border-border/50 bg-background/95 p-0 shadow-2xl backdrop-blur-xl" onClose={onClose}>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as UnifiedPickerTab)} className="contents">
        {/* ── Header ── */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-brand-teal/50 to-transparent" />
          <DialogHeader className="px-6 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-linear-to-br from-brand-teal/20 via-brand-blue/15 to-brand-teal/10 ring-1 ring-brand-teal/20">
                  <Plus className="size-5 text-brand-teal" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
                    Lägg till element
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Välj UI-komponenter, AI-element, mallar eller tema.
                  </DialogDescription>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Stäng" className="size-8 rounded-lg text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </Button>
            </div>
            {/* Tabs */}
            <TabsList className="mt-4 flex h-auto w-auto gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="flex items-center gap-1.5 rounded-md border-0 px-3 py-1.5 text-xs font-medium shadow-none transition-all data-[state=active]:bg-brand-teal/15 data-[state=active]:text-brand-teal data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-brand-teal/20 data-[state=inactive]:bg-transparent data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                  >
                    <Icon className="size-3.5" />
                    {tab.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </DialogHeader>
        </div>

        {/* ── Tab Content ── */}
        <div className="flex min-h-0 flex-1 flex-col border-t border-border/50 md:flex-row">
          <TabsContent value="ui" forceMount className="flex min-h-0 flex-1 flex-col md:flex-row data-[state=inactive]:hidden">
            <>
              {/* UI sidebar */}
              <div className="flex w-full flex-1 min-h-0 flex-col border-b border-border/50 md:w-80 md:flex-none md:border-r md:border-b-0">
                <div className="space-y-3 p-4">
                  <div className="relative">
                    <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
                    <Input value={uiQuery} onChange={(e) => setUiQuery(e.target.value)} placeholder={uiItemType === "block" ? "Sök block..." : "Sök komponenter..."} className="h-9 bg-muted/30 pl-9 text-sm" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex rounded-md border border-border bg-muted/30 p-0.5">
                      {(["block", "component"] as const).map((t) => (
                        <button key={t} type="button" onClick={() => setUiItemType(t)} className={`rounded-sm px-2.5 py-1 text-[11px] font-medium transition-all ${uiItemType === t ? "bg-brand-teal/15 text-brand-teal shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                          {t === "block" ? "Blocks" : "Komponenter"}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={handleUiReload} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                      <RefreshCw className="size-3" /> Uppdatera
                    </button>
                  </div>
                  {!uiLoadingCategories && !uiError && uiCategories.length > 0 && (
                    <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                      <CategoryPill active={uiActiveCategory === "all"} onClick={() => setUiActiveCategory("all")} label="Alla" />
                      {uiCategories.map((cat) => (
                        <CategoryPill key={cat.id} active={uiActiveCategory === cat.id} onClick={() => setUiActiveCategory(cat.id)} label={`${cat.labelSv} (${cat.items.length})`} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-3">
                  {uiLoadingCategories ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16">
                      <Loader2 className="size-6 animate-spin text-brand-teal/60" />
                      <span className="text-xs text-muted-foreground">Laddar katalog...</span>
                    </div>
                  ) : uiError ? (
                    <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
                      <div className="font-medium text-destructive">Kunde inte ladda katalogen</div>
                      <div className="text-xs text-destructive/80">{uiError}</div>
                      <Button variant="outline" size="sm" onClick={handleUiReload} className="h-8"><RefreshCw className="mr-2 size-3.5" /> Försök igen</Button>
                    </div>
                  ) : uiVisible.length === 0 ? (
                    <div className="py-16 text-center text-sm text-muted-foreground">{uiQuery ? "Inga resultat" : "Inga element hittades"}</div>
                  ) : (
                    <div className="space-y-4">
                      {uiVisible.map((category) => (
                        <div key={category.id}>
                          <div className="mb-2 flex items-center gap-2 px-1">
                            <span className="text-sm">{category.icon}</span>
                            <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{category.labelSv}</span>
                            <span className="text-[10px] text-muted-foreground/50">{category.items.length}</span>
                          </div>
                          <div className="grid grid-cols-1 gap-1.5">
                            {category.items.map((item) => {
                              const isSelected = uiSelectedItem?.name === item.name;
                              const showThumb = item.type === "block";
                              const thumbUrl = showThumb ? item.lightImageUrl || buildPreviewImageUrl(item.name, "light", DEFAULT_STYLE) : null;
                              const thumbFailed = showThumb && thumbUrl ? uiFailedThumbs.has(item.name) : false;
                              return (
                                <button key={item.name} type="button" onClick={() => setUiSelectedItem(item)} className={`group w-full rounded-xl border p-2 text-left transition-all ${isSelected ? "border-brand-teal/40 bg-brand-teal/5 shadow-sm shadow-brand-teal/5" : "border-transparent hover:border-border hover:bg-muted/30"}`}>
                                  <div className="flex items-center gap-3">
                                    {showThumb ? (
                                      <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg border border-border/50 bg-white">
                                        {thumbUrl && !thumbFailed ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img src={thumbUrl} alt={item.title} className="h-full w-full object-cover object-top" loading="lazy" onError={() => setUiFailedThumbs((prev) => { const next = new Set(prev); next.add(item.name); return next; })} />
                                        ) : (
                                          <div className="flex h-full w-full items-center justify-center bg-muted/40 text-[10px] text-muted-foreground">Ingen preview</div>
                                        )}
                                      </div>
                                    ) : (
                                      <ComponentListThumbnail item={item} selected={isSelected} />
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <span className={`text-sm font-medium ${isSelected ? "text-brand-teal" : "text-foreground"}`}>{item.title}</span>
                                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium uppercase ${item.type === "block" ? "bg-brand-blue/10 text-brand-blue/70" : "bg-brand-amber/10 text-brand-amber/70"}`}>{item.type === "block" ? "Block" : "UI"}</span>
                                      </div>
                                      {item.description && <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{item.description}</div>}
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
              {/* UI preview */}
              <div className="flex min-h-0 flex-1 flex-col bg-muted/10">
                <UiElementPickerPreview
                  selectedItem={uiSelectedItem}
                  registryItem={uiRegistryItem}
                  isLoading={uiLoadingItem}
                  error={uiItemError}
                  legacyAvailable={uiLegacyAvailable}
                  style={DEFAULT_STYLE}
                  itemLabel={uiItemType === "block" ? "block" : "komponent"}
                  onReload={handleUiReload}
                />
              </div>
            </>
          </TabsContent>

          <TabsContent value="ai" forceMount className="flex min-h-0 flex-1 flex-col md:flex-row data-[state=inactive]:hidden">
            <>
              {/* AI sidebar */}
              <div className="flex w-full flex-1 min-h-0 flex-col border-b border-border/50 md:w-80 md:flex-none md:border-r md:border-b-0">
                <div className="space-y-3 p-4">
                  <div className="relative">
                    <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
                    <Input value={aiQuery} onChange={(e) => setAiQuery(e.target.value)} placeholder="Sök AI-element..." className="h-9 bg-muted/30 pl-9 text-sm" />
                  </div>
                  <div className="text-[11px] text-muted-foreground">{filteredAiItems.length} element</div>
                  <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                    <CategoryPill active={aiActiveCategory === "all"} onClick={() => setAiActiveCategory("all")} label="Alla" />
                    {AI_ELEMENT_CATEGORIES.map((cat) => {
                      const count = AI_ELEMENT_ITEMS.filter((i) => i.category === cat.id).length;
                      return <CategoryPill key={cat.id} active={aiActiveCategory === cat.id} onClick={() => setAiActiveCategory(cat.id)} label={`${cat.icon} ${cat.label} (${count})`} />;
                    })}
                  </div>
                </div>
                <div className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-3">
                  {filteredAiItems.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">Inga AI-element matchar sökningen</div>
                  ) : (
                    <div className="space-y-1.5">
                      {filteredAiItems.map((item) => {
                        const isSelected = selectedAiItem?.id === item.id;
                        const isPinned = paletteSelectionSet.has(`ai-element:${item.id}`);
                        const CatIcon = CATEGORY_ICONS[item.category] || Package;
                        return (
                          <button key={item.id} type="button" onClick={() => setAiSelectedId(item.id)} className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${isSelected ? "border-brand-teal/40 bg-brand-teal/10" : "border-border/60 hover:bg-muted/40"}`}>
                            <div className="flex items-center gap-2.5">
                              <div className={`flex size-7 shrink-0 items-center justify-center rounded-md ${isSelected ? "bg-brand-teal/20 text-brand-teal" : "bg-muted/50 text-muted-foreground"}`}>
                                <CatIcon className="size-3.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm font-medium text-foreground">{item.label}</div>
                                  {isPinned && <span className="text-[10px] font-medium text-brand-teal">Tillagd</span>}
                                </div>
                                <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{item.description}</div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              {/* AI detail panel */}
              <div className="flex min-h-0 flex-1 flex-col bg-muted/10">
                {selectedAiItem ? (
                  <>
                    <div className="border-b border-border/50 px-6 py-3">
                      <h3 className="truncate text-base font-semibold text-foreground">{selectedAiItem.label}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">{selectedAiItem.description}</p>
                    </div>
                    <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
                      {selectedAiItem.tags?.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedAiItem.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">{tag}</span>
                          ))}
                        </div>
                      ) : null}
                      {selectedAiItem.dependencies?.length ? (
                        <div className="mt-4 rounded-xl border border-border/50 bg-card/60 p-4">
                          <div className="text-xs font-medium text-foreground">Dependencies</div>
                          <div className="mt-1 text-[11px] text-muted-foreground">{selectedAiItem.dependencies.join(", ")}</div>
                          <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-[11px] font-mono text-foreground/80">npm i {selectedAiItem.dependencies.join(" ")}</div>
                        </div>
                      ) : (
                        <div className="mt-4 text-xs text-muted-foreground">Inga extra dependencies krävs.</div>
                      )}
                      {selectedAiItem.promptHints?.length ? (
                        <div className="mt-4 rounded-xl border border-brand-teal/15 bg-brand-teal/5 p-4">
                          <div className="text-xs font-medium text-brand-teal">Implementeringsguide</div>
                          <ul className="mt-2 space-y-1.5">
                            {selectedAiItem.promptHints.map((hint, i) => (
                              <li key={i} className="text-[12px] leading-relaxed text-muted-foreground">• {hint}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
                    <Wand2 className="size-8 opacity-30" />
                    <span className="text-sm">Välj ett AI-element i listan</span>
                  </div>
                )}
              </div>
            </>
          </TabsContent>

          <TabsContent value="mall" forceMount className="flex min-h-0 flex-1 flex-col md:flex-row data-[state=inactive]:hidden">
            <>
              {/* Template sidebar */}
              <div className="flex w-full flex-1 min-h-0 flex-col border-b border-border/50 md:w-80 md:flex-none md:border-r md:border-b-0">
                <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Kategorier</div>
                  <div className="space-y-1">
                    {templateCategories.map((category: CategoryInfo) => (
                      <button key={category.id} type="button" onClick={() => setTemplateCategory(category.id)} className={`w-full rounded-md px-3 py-2 text-left text-xs font-medium transition-colors ${category.id === templateCategory ? "bg-brand-blue/10 text-brand-blue" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"}`}>
                        {category.title}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Template grid */}
              <div className="flex min-h-0 flex-1 flex-col bg-muted/10">
                <div className="border-b border-border/50 px-6 py-3">
                  <h3 className="truncate text-base font-semibold text-foreground">{templateCategories.find((c) => c.id === templateCategory)?.title || "Mallar"}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{templateCategories.find((c) => c.id === templateCategory)?.description || "Välj en mall att starta från."}</p>
                </div>
                <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
                  {hasChat && (
                    <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100/80">Om du startar från en mall skapas en ny chat.</div>
                  )}
                  {templateItems.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">Inga mallar hittades i kategorin.</div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {templateItems.map((template) => {
                        const isSelected = selectedTemplate?.id === template.id;
                        return (
                          <button key={template.id} type="button" onClick={() => setSelectedTemplate(template)} className={`group overflow-hidden rounded-xl border text-left transition-all ${isSelected ? "border-brand-teal/40 bg-brand-teal/10" : "border-border/60 hover:border-brand-teal/30 hover:bg-muted/40"}`}>
                            <div className="aspect-16/10 w-full overflow-hidden bg-muted/30">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={getTemplateImageUrl(template)} alt={template.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" loading="lazy" />
                            </div>
                            <div className="p-3">
                              <div className="text-sm font-medium text-foreground">{template.title}</div>
                              <div className="mt-1 text-[11px] text-muted-foreground">{template.category}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          </TabsContent>

          <TabsContent value="tema" forceMount className="flex min-h-0 flex-1 flex-col md:flex-row data-[state=inactive]:hidden">
            <>
              {/* Theme sidebar */}
              <div className="flex w-full flex-1 min-h-0 flex-col border-b border-border/50 md:w-80 md:flex-none md:border-r md:border-b-0">
                <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Teman</div>
                  <div className="space-y-1">
                    {DESIGN_THEME_OPTIONS.map((option) => (
                      <button key={option.value} type="button" onClick={() => setSelectedTheme(option.value)} className={`w-full rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors ${option.value === selectedTheme ? "border-brand-blue/30 bg-brand-blue/10 text-brand-blue" : "border-border/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground"}`}>
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Theme preview */}
              <div className="flex min-h-0 flex-1 flex-col bg-muted/10">
                <div className="border-b border-border/50 px-6 py-3">
                  <h3 className="truncate text-base font-semibold text-foreground">{selectedThemeOption?.label || selectedTheme}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">Temat styr design tokens som skickas till generationen.</p>
                </div>
                <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-5">
                  {selectedThemeColors ? (
                    <div className="grid gap-3 md:grid-cols-3">
                      {(["primary", "secondary", "accent"] as const).map((key) => (
                        <div key={key} className="rounded-xl border border-border/60 bg-card/60 p-3">
                          <div className="text-[11px] text-muted-foreground capitalize">{key}</div>
                          <div className="mt-2 h-10 rounded-md border border-border/50" style={{ backgroundColor: selectedThemeColors[key] }} />
                          <div className="mt-2 break-all font-mono text-[10px] text-muted-foreground">{selectedThemeColors[key]}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border/60 bg-card/60 p-4 text-sm text-muted-foreground">Tema är avstängt. Modellen får större frihet att välja färger.</div>
                  )}
                </div>
              </div>
            </>
          </TabsContent>
        </div>
        </Tabs>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between border-t border-border/50 bg-muted/20 px-6 py-3.5">
          <div className="flex items-center gap-3">
            {showPlacement && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-2" disabled={isSubmitting}>
                    {currentPlacement.icon}
                    <span className="hidden text-xs sm:inline">{currentPlacement.label}</span>
                    <ChevronDown className="size-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    {detectedSections.length > 0 ? `Placera bland ${detectedSections.length} sektioner` : "Var ska komponenten placeras?"}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {dynamicPlacementOptions.map((opt) => (
                    <DropdownMenuItem key={opt.value} onClick={() => setPlacement(opt.value)} className={`flex cursor-pointer items-start gap-3 py-2 ${placement === opt.value ? "bg-brand-teal/10" : ""}`}>
                      <span className="mt-0.5 shrink-0 text-muted-foreground">{opt.icon}</span>
                      <div>
                        <div className={`text-sm font-medium ${placement === opt.value ? "text-brand-teal" : "text-foreground"}`}>{opt.label}</div>
                        <div className="text-xs text-muted-foreground">{opt.description}</div>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {activeTab === "mall" && selectedTemplate && (
              <div className="text-xs text-muted-foreground">
                Vald mall: <span className="font-medium text-foreground">{selectedTemplate.title}</span>
              </div>
            )}
            {(activeTab === "ui" || activeTab === "ai") && !hasChat && (
              <div className="text-xs text-muted-foreground">Skapa en sida först för att lägga till element</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>Avbryt</Button>

            {activeTab === "ui" && hasChat && (
              <Button size="sm" onClick={() => handleUiConfirm("add")} disabled={!uiCanAct} className="bg-brand-teal hover:bg-brand-teal/90 text-white shadow-sm shadow-brand-teal/20">
                {isSubmitting && uiPendingAction === "add" ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Wand2 className="mr-1.5 size-4" />}
                Lägg till
              </Button>
            )}
            {activeTab === "ui" && !hasChat && (
              <Button size="sm" onClick={() => handleUiConfirm("start")} disabled={!uiCanAct || uiItemType !== "block"} className="bg-brand-amber hover:bg-brand-amber/90 text-white shadow-sm shadow-brand-amber/20">
                Starta från block
              </Button>
            )}
            {activeTab === "ai" && (
              <Button size="sm" onClick={handleAiConfirm} disabled={!canAddAiElement} className="bg-brand-teal hover:bg-brand-teal/90 text-white shadow-sm shadow-brand-teal/20">
                Lägg till
              </Button>
            )}
            {activeTab === "mall" && (
              <Button size="sm" onClick={handleTemplateConfirm} disabled={!canStartTemplate} className="bg-brand-blue hover:bg-brand-blue/90 text-white shadow-sm shadow-brand-blue/20">
                Starta mall
              </Button>
            )}
            {activeTab === "tema" && (
              <Button size="sm" onClick={handleThemeConfirm} disabled={!canApplyTheme} className="bg-brand-blue hover:bg-brand-blue/90 text-white shadow-sm shadow-brand-blue/20">
                Använd tema
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
        active ? "bg-brand-teal/15 text-brand-teal ring-1 ring-brand-teal/20" : "bg-muted/40 text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

const COMPONENT_THUMB_META: Record<
  ComponentPreviewKind,
  { emoji: string; label: string; badgeClass: string; backgroundClass: string }
> = {
  inputs: {
    emoji: "⌨️",
    label: "Input",
    badgeClass: "bg-brand-blue/10 text-brand-blue/80",
    backgroundClass: "from-brand-blue/8 to-brand-blue/2",
  },
  forms: {
    emoji: "📝",
    label: "Form",
    badgeClass: "bg-brand-amber/10 text-brand-amber/80",
    backgroundClass: "from-brand-amber/8 to-brand-amber/2",
  },
  overlay: {
    emoji: "🪟",
    label: "Overlay",
    badgeClass: "bg-violet-500/10 text-violet-300",
    backgroundClass: "from-violet-500/8 to-violet-500/2",
  },
  navigation: {
    emoji: "🧭",
    label: "Nav",
    badgeClass: "bg-cyan-500/10 text-cyan-300",
    backgroundClass: "from-cyan-500/8 to-cyan-500/2",
  },
  layout: {
    emoji: "🧱",
    label: "Layout",
    badgeClass: "bg-emerald-500/10 text-emerald-300",
    backgroundClass: "from-emerald-500/8 to-emerald-500/2",
  },
  feedback: {
    emoji: "💬",
    label: "Feedback",
    badgeClass: "bg-pink-500/10 text-pink-300",
    backgroundClass: "from-pink-500/8 to-pink-500/2",
  },
  data: {
    emoji: "🗂️",
    label: "Data",
    badgeClass: "bg-teal-500/10 text-teal-300",
    backgroundClass: "from-teal-500/8 to-teal-500/2",
  },
  table: {
    emoji: "📋",
    label: "Tabell",
    badgeClass: "bg-indigo-500/10 text-indigo-300",
    backgroundClass: "from-indigo-500/8 to-indigo-500/2",
  },
  typography: {
    emoji: "🔤",
    label: "Typo",
    badgeClass: "bg-fuchsia-500/10 text-fuchsia-300",
    backgroundClass: "from-fuchsia-500/8 to-fuchsia-500/2",
  },
  other: {
    emoji: "📦",
    label: "UI",
    badgeClass: "bg-muted/60 text-muted-foreground",
    backgroundClass: "from-muted/80 to-muted/20",
  },
};

function ComponentListThumbnail({ item, selected }: { item: ComponentItem; selected: boolean }) {
  const kind = item.previewKind || item.iconKey || "other";
  const meta = COMPONENT_THUMB_META[kind] || COMPONENT_THUMB_META.other;
  return (
    <div
      className={`relative h-20 w-32 shrink-0 overflow-hidden rounded-lg border transition-colors ${
        selected ? "border-brand-teal/40" : "border-border/50"
      }`}
    >
      <div className={`h-full w-full bg-linear-to-br ${meta.backgroundClass} p-2`}>
        <div className="flex items-center justify-between">
          <span className="text-base leading-none">{meta.emoji}</span>
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${meta.badgeClass}`}>
            {meta.label}
          </span>
        </div>
        <div className="mt-2.5 space-y-1.5">
          <div className="h-1.5 w-5/6 rounded bg-foreground/15" />
          <div className="h-1.5 w-3/4 rounded bg-foreground/10" />
          <div className="h-1.5 w-2/3 rounded bg-foreground/10" />
        </div>
      </div>
    </div>
  );
}
