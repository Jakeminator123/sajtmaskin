"use client";

import { Blocks, Loader2, Search, X, Sparkles, ExternalLink } from "lucide-react";
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
} from "@/lib/shadcn-registry-service";
import { getRegistryStyle } from "@/lib/v0/v0-url-parser";

// ============================================
// TYPES (exported for ChatInterface)
// ============================================

export type ShadcnBlockAction = "add" | "start";

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
}

const DEFAULT_STYLE = getRegistryStyle();

export function ShadcnBlockPicker({
  open,
  onClose,
  onConfirm,
  isBusy = false,
  isSubmitting = false,
  hasChat = false,
}: ShadcnBlockPickerProps) {
  // State
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<ComponentCategory[]>([]);
  const [selectedItem, setSelectedItem] = useState<ComponentItem | null>(null);
  const [registryItem, setRegistryItem] = useState<ShadcnRegistryItem | null>(null);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isLoadingItem, setIsLoadingItem] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<ShadcnBlockAction | null>(null);

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
        // Auto-select first item
        if (data.length > 0 && data[0].items.length > 0) {
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

    fetchRegistryItem(selectedItem.name, DEFAULT_STYLE)
      .then((data) => {
        if (!isActive) return;
        setRegistryItem(data);
      })
      .catch(() => {
        // Silent fail - we can still use the item without full data
      })
      .finally(() => {
        if (isActive) setIsLoadingItem(false);
      });

    return () => {
      isActive = false;
    };
  }, [open, selectedItem]);

  // Filter categories by search
  const filteredCategories = useMemo(() => {
    return searchBlocks(categories, query);
  }, [categories, query]);

  // Can user take action?
  const canAct = Boolean(selectedItem) && !isBusy && !isSubmitting;

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
          registryUrl,
          style: DEFAULT_STYLE,
        },
        action,
      );

      setPendingAction(null);
    },
    [selectedItem, registryItem, onConfirm],
  );

  // Reset pending action when not submitting
  useEffect(() => {
    if (!isSubmitting) {
      setPendingAction(null);
    }
  }, [isSubmitting]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
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
                  Välj en komponent
                </DialogTitle>
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
              ) : filteredCategories.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-500">
                  Inga komponenter matchar din sökning
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredCategories.map((category) => (
                    <div key={category.id}>
                      <div className="mb-2 flex items-center gap-2 px-1">
                        <span className="text-base">{category.icon}</span>
                        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
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
                                <div className="mt-0.5 text-xs text-gray-500 line-clamp-1">
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
                      <strong className="text-violet-300">Tips:</strong> Du kan anpassa färger,
                      text och bilder efter att du lagt till komponenten. Beskriv bara vad du
                      vill ändra i chatten!
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
          <div className="text-xs text-gray-500">
            {hasChat
              ? "Komponenten läggs till på din nuvarande sida"
              : "Skapa en sida först för att lägga till komponenter"}
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
