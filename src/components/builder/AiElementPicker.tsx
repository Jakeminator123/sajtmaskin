"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Replace,
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
import { AI_ELEMENT_ITEMS, type AiElementCatalogItem } from "@/lib/builder/ai-elements-catalog";
import type { PaletteSelection } from "@/lib/builder/palette";
import {
  analyzeSections,
  generatePlacementOptions,
  type DetectedSection,
} from "@/lib/builder/sectionAnalyzer";

// Placement options (mirrors DEFAULT_PLACEMENT_OPTIONS in UiElementPicker)
const PLACEMENT_OPTIONS_STATIC = [
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

interface AiElementPickerProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (
    item: AiElementCatalogItem,
    options: { placement?: string; detectedSections?: DetectedSection[] },
  ) => void;
  hasChat: boolean;
  isBusy?: boolean;
  isSubmitting?: boolean;
  currentCode?: string;
  paletteSelections?: PaletteSelection[];
}

export function AiElementPicker({
  open,
  onClose,
  onConfirm,
  hasChat,
  isBusy = false,
  isSubmitting = false,
  currentCode,
  paletteSelections,
}: AiElementPickerProps) {
  const [aiQuery, setAiQuery] = useState("");
  const [selectedAiItemId, setSelectedAiItemId] = useState<string | null>(
    AI_ELEMENT_ITEMS[0]?.id ?? null,
  );
  const [placement, setPlacement] = useState("bottom");

  const detectedSections = useMemo(() => {
    if (!currentCode) return [];
    return analyzeSections(currentCode);
  }, [currentCode]);

  const dynamicPlacementOptions = useMemo(() => {
    if (detectedSections.length === 0) return PLACEMENT_OPTIONS_STATIC;
    const generated = generatePlacementOptions(detectedSections);
    return generated.map((opt) => ({
      ...opt,
      icon:
        opt.value === "top" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />,
    }));
  }, [detectedSections]);

  const currentPlacement =
    dynamicPlacementOptions.find((p) => p.value === placement) ||
    dynamicPlacementOptions[dynamicPlacementOptions.length - 1];

  const filteredAiItems = useMemo(() => {
    const trimmed = aiQuery.trim().toLowerCase();
    if (!trimmed) return AI_ELEMENT_ITEMS;
    return AI_ELEMENT_ITEMS.filter((item) => {
      const haystack = [item.label, item.description, ...(item.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [aiQuery]);

  const selectedAiItem = useMemo(
    () => filteredAiItems.find((item) => item.id === selectedAiItemId) ?? filteredAiItems[0],
    [filteredAiItems, selectedAiItemId],
  );

  const paletteSelectionSet = useMemo(() => {
    const entries = paletteSelections ?? [];
    return new Set(entries.map((entry) => `${entry.source}:${entry.id}`));
  }, [paletteSelections]);

  useEffect(() => {
    if (!selectedAiItem && filteredAiItems.length > 0) {
      setSelectedAiItemId(filteredAiItems[0]?.id ?? null);
    }
  }, [filteredAiItems, selectedAiItem]);

  const canAddAiElement =
    Boolean(selectedAiItem) && !isBusy && !isSubmitting && hasChat;

  const handleConfirm = useCallback(() => {
    if (!selectedAiItem) return;
    onConfirm(selectedAiItem, { placement, detectedSections });
    onClose();
  }, [selectedAiItem, onConfirm, placement, detectedSections, onClose]);

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,1100px)] max-w-5xl flex-col overflow-hidden rounded-2xl border-border/50 bg-background/95 p-0 shadow-2xl backdrop-blur-xl" onClose={onClose}>
        <div className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-brand-teal/50 to-transparent" />
          <DialogHeader className="px-6 pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-brand-teal/20 via-brand-blue/15 to-brand-teal/10 ring-1 ring-brand-teal/20">
                  <Wand2 className="h-5 w-5 text-brand-teal" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
                    Välj AI‑element
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Bygg AI‑komponenter med snabbare iterationer.
                  </DialogDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Stäng"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
        </div>

        <div className="flex min-h-0 flex-1 flex-col border-t border-border/50 md:flex-row">
          {/* Left: search + item list */}
          <div className="flex w-full flex-col border-b border-border/50 md:w-[340px] md:border-r md:border-b-0">
            <div className="space-y-3 p-4">
              <div className="relative">
                <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  placeholder="Sök AI‑element..."
                  className="h-9 bg-muted/30 pl-9 text-sm"
                />
              </div>
              <div className="text-[11px] text-muted-foreground">
                {filteredAiItems.length} element
              </div>
            </div>
            <div className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-3">
              {filteredAiItems.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Inga AI‑element matchar sökningen
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredAiItems.map((item) => {
                    const isSelected = selectedAiItem?.id === item.id;
                    const isPinned = paletteSelectionSet.has(`ai-element:${item.id}`);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedAiItemId(item.id)}
                        className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                          isSelected
                            ? "border-brand-teal/40 bg-brand-teal/10"
                            : "border-border/60 hover:bg-muted/40"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium text-foreground">{item.label}</div>
                          {isPinned && (
                            <span className="text-[10px] font-medium text-brand-teal">
                              Tillagd
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: detail panel */}
          <div className="flex min-h-0 flex-1 flex-col bg-muted/10">
            {selectedAiItem ? (
              <>
                <div className="border-b border-border/50 px-6 py-3">
                  <h3 className="truncate text-base font-semibold text-foreground">
                    {selectedAiItem.label}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {selectedAiItem.description}
                  </p>
                </div>
                <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
                  {selectedAiItem.tags?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedAiItem.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {selectedAiItem.dependencies?.length ? (
                    <div className="mt-4 rounded-xl border border-border/50 bg-card/60 p-4">
                      <div className="text-xs font-medium text-foreground">Dependencies</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {selectedAiItem.dependencies.join(", ")}
                      </div>
                      <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-[11px] font-mono text-foreground/80">
                        npm i {selectedAiItem.dependencies.join(" ")}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 text-xs text-muted-foreground">
                      Inga extra dependencies krävs.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
                <Wand2 className="h-8 w-8 opacity-30" />
                <span className="text-sm">Välj ett AI‑element i listan</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
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
                    {currentPlacement?.icon}
                    <span className="hidden text-xs sm:inline">
                      {currentPlacement?.label}
                    </span>
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
                Skapa en sida först för att lägga till element
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              Avbryt
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={!canAddAiElement}
              className="bg-brand-teal hover:bg-brand-teal/90 text-white shadow-sm shadow-brand-teal/20"
            >
              Lägg till
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
