"use client";

import { Blocks, Loader2, Search } from "lucide-react";
import { Streamdown } from "streamdown";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SHADCN_BLOCKS, type ShadcnBlockItem } from "@/lib/shadcn-registry-blocks";
import type { ShadcnRegistryItem } from "@/lib/shadcn-registry-types";
import {
  buildRegistryMarkdownPreview,
  buildShadcnPreviewImageUrl,
  buildShadcnPreviewUrl,
} from "@/lib/shadcn-registry-utils";
import {
  buildShadcnRegistryUrl,
  getRegistryBaseUrl,
  getRegistryStyle,
} from "@/lib/v0/v0-url-parser";

const DEFAULT_STYLE = getRegistryStyle();

export type ShadcnBlockAction = "add" | "start";

export type ShadcnBlockSelection = {
  block: ShadcnBlockItem;
  registryItem: ShadcnRegistryItem;
  dependencyItems?: ShadcnRegistryItem[];
  registryUrl: string;
  style: string;
};

type RegistryCacheEntry = {
  registryUrl: string;
  item: ShadcnRegistryItem;
  dependencies: ShadcnRegistryItem[];
};

interface ShadcnBlockPickerProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (selection: ShadcnBlockSelection, action: ShadcnBlockAction) => void | Promise<void>;
  isBusy?: boolean;
  isSubmitting?: boolean;
  hasChat?: boolean;
  style?: string;
}

export function ShadcnBlockPicker({
  open,
  onClose,
  onConfirm,
  isBusy = false,
  isSubmitting = false,
  hasChat = false,
  style = DEFAULT_STYLE,
}: ShadcnBlockPickerProps) {
  const registryBaseUrl = getRegistryBaseUrl();
  const [query, setQuery] = useState("");
  const [selectedBlock, setSelectedBlock] = useState<ShadcnBlockItem | null>(null);
  const [registryItem, setRegistryItem] = useState<ShadcnRegistryItem | null>(null);
  const [dependencyItems, setDependencyItems] = useState<ShadcnRegistryItem[]>([]);
  const [registryUrl, setRegistryUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"preview" | "files">("preview");
  const [activeStyle, setActiveStyle] = useState(style);
  const [pendingAction, setPendingAction] = useState<ShadcnBlockAction | null>(null);
  const cacheRef = useRef<Map<string, RegistryCacheEntry>>(new Map());
  const resolvedStyle = useMemo(() => activeStyle.trim() || DEFAULT_STYLE, [activeStyle]);

  useEffect(() => {
    if (!open) return;
    if (!selectedBlock) {
      const first = SHADCN_BLOCKS[0]?.items[0] ?? null;
      setSelectedBlock(first);
    }
  }, [open, selectedBlock]);

  useEffect(() => {
    if (!open) return;
    setActiveStyle(style);
  }, [open, style]);

  useEffect(() => {
    if (!isSubmitting) {
      setPendingAction(null);
    }
  }, [isSubmitting]);

  useEffect(() => {
    if (!open) return;
    const handleDialogClose = () => onClose();
    window.addEventListener("dialog-close", handleDialogClose);
    return () => window.removeEventListener("dialog-close", handleDialogClose);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !selectedBlock) return;
    let isActive = true;
    const controller = new AbortController();

    const cacheKey = `${resolvedStyle}:${selectedBlock.name}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setRegistryItem(cached.item);
      setDependencyItems(cached.dependencies);
      setRegistryUrl(cached.registryUrl);
      setError(null);
      return () => controller.abort();
    }

    setRegistryItem(null);
    setDependencyItems([]);
    setRegistryUrl(null);
    setError(null);
    setIsLoading(true);

    const loadRegistry = async () => {
      try {
        const url = buildShadcnRegistryUrl(selectedBlock.name, resolvedStyle);
        const response = await fetch(url, { signal: controller.signal });
        const data = (await response.json().catch(() => null)) as ShadcnRegistryItem | null;
        if (!response.ok) {
          throw new Error(`Registry fetch failed (HTTP ${response.status})`);
        }
        if (!data || typeof data !== "object") {
          throw new Error("Registry response was empty");
        }
        const dependencyNames = Array.from(new Set(data.registryDependencies ?? []));
        const dependencies = await Promise.all(
          dependencyNames.map(async (dependency) => {
            const dependencyUrl = buildShadcnRegistryUrl(dependency, resolvedStyle);
            const dependencyResponse = await fetch(dependencyUrl, { signal: controller.signal });
            const dependencyData = (await dependencyResponse.json().catch(() => null)) as
              | ShadcnRegistryItem
              | null;
            if (!dependencyResponse.ok) {
              throw new Error(
                `Registry dependency "${dependency}" failed (HTTP ${dependencyResponse.status})`,
              );
            }
            if (!dependencyData || typeof dependencyData !== "object") {
              throw new Error(`Registry dependency "${dependency}" response was empty`);
            }
            return dependencyData;
          }),
        );
        if (!isActive) return;
        cacheRef.current.set(cacheKey, { registryUrl: url, item: data, dependencies });
        setRegistryItem(data);
        setDependencyItems(dependencies);
        setRegistryUrl(url);
      } catch (err) {
        if (!isActive) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load registry item");
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    loadRegistry();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [open, selectedBlock, resolvedStyle]);

  const filteredCategories = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return SHADCN_BLOCKS;

    return SHADCN_BLOCKS.map((category) => ({
      ...category,
      items: category.items.filter((block) => {
        const haystack = `${block.title} ${block.name} ${block.description}`.toLowerCase();
        return haystack.includes(trimmed);
      }),
    })).filter((category) => category.items.length > 0);
  }, [query]);

  const previewMarkdown = useMemo(() => {
    if (!registryItem) return "";
    return buildRegistryMarkdownPreview(registryItem, { style: resolvedStyle, maxLines: 90 });
  }, [registryItem, resolvedStyle]);

  const previewLinks = useMemo(() => {
    if (!selectedBlock) return null;
    return {
      viewUrl: buildShadcnPreviewUrl(selectedBlock.name, resolvedStyle),
      lightUrl: buildShadcnPreviewImageUrl(selectedBlock.name, "light", resolvedStyle),
      darkUrl: buildShadcnPreviewImageUrl(selectedBlock.name, "dark", resolvedStyle),
    };
  }, [selectedBlock, resolvedStyle]);

  const canAct =
    Boolean(selectedBlock && registryItem && registryUrl) &&
    !isBusy &&
    !isLoading &&
    !isSubmitting &&
    !error;

  const handleConfirm = async (action: ShadcnBlockAction) => {
    if (!selectedBlock || !registryItem || !registryUrl) return;
    setPendingAction(action);
    await onConfirm(
      {
        block: selectedBlock,
        registryItem,
        dependencyItems,
        registryUrl,
        style: resolvedStyle,
      },
      action,
    );
  };

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Blocks className="h-4 w-4 text-gray-200" />
            Design System
          </DialogTitle>
          <DialogDescription>
            Välj block, style och läge. Du kan starta ett nytt projekt eller lägga till i
            nuvarande chat.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 pb-6 md:flex-row">
          <div className="flex w-full flex-col gap-3 md:w-72">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Sök block"
                className="pl-9"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase text-gray-400">Style</div>
              <Input
                value={activeStyle}
                onChange={(event) => setActiveStyle(event.target.value)}
                placeholder="new-york-v4"
              />
              <div className="text-[11px] text-gray-500">Registry: {registryBaseUrl}</div>
            </div>
            <div className="flex-1 overflow-y-auto rounded-md border border-gray-800 p-2">
              {filteredCategories.map((category) => (
                <div key={category.category} className="mb-3 last:mb-0">
                  <div className="px-2 pb-1 text-xs font-semibold uppercase text-gray-400">
                    {category.category}
                  </div>
                  <div className="space-y-1">
                    {category.items.map((block) => {
                      const isSelected = selectedBlock?.name === block.name;
                      return (
                        <button
                          key={block.name}
                          type="button"
                          onClick={() => setSelectedBlock(block)}
                          className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                            isSelected
                              ? "border-brand-blue bg-brand-blue/10 text-white"
                              : "border-transparent text-gray-300 hover:border-gray-700 hover:bg-gray-800/60"
                          }`}
                        >
                          <div className="font-medium">{block.title}</div>
                          <div className="text-xs text-gray-500">{block.description}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {filteredCategories.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-gray-500">
                  Inga block matchar din sökning.
                </div>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium text-gray-200">Förhandsvisning</div>
                <div className="flex items-center rounded-md border border-gray-800 p-0.5">
                  <Button
                    type="button"
                    variant={previewMode === "preview" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setPreviewMode("preview")}
                  >
                    Förhandsvisning
                  </Button>
                  <Button
                    type="button"
                    variant={previewMode === "files" ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setPreviewMode("files")}
                  >
                    Filer
                  </Button>
                </div>
              </div>
              {previewMode === "files" && registryUrl && (
                <a
                  href={registryUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-brand-blue hover:underline"
                >
                  Öppna registry JSON
                </a>
              )}
              {previewMode === "preview" && previewLinks?.viewUrl && (
                <a
                  href={previewLinks.viewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-brand-blue hover:underline"
                >
                  Öppna förhandsvisning
                </a>
              )}
            </div>
            <div className="min-h-[200px] flex-1 overflow-y-auto rounded-md border border-gray-800 bg-gray-950/40 p-4">
              {previewMode === "files" && isLoading && (
                <div className="flex h-full items-center justify-center text-sm text-gray-400">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Laddar block...
                </div>
              )}
              {!isLoading && error && previewMode === "files" && (
                <div className="text-sm text-red-400">{error}</div>
              )}
              {previewMode === "files" && !isLoading && !error && registryItem && (
                <div className="prose prose-invert max-w-none text-sm">
                  <Streamdown>{previewMarkdown}</Streamdown>
                </div>
              )}
              {previewMode === "files" && !isLoading && !error && !registryItem && (
                <div className="text-sm text-gray-500">Välj ett block för att förhandsvisa.</div>
              )}
              {previewMode === "preview" && !selectedBlock && (
                <div className="text-sm text-gray-500">Välj ett block för att förhandsvisa.</div>
              )}
              {previewMode === "preview" && selectedBlock && previewLinks && (
                <div className="space-y-3">
                  {error && <div className="text-sm text-red-400">{error}</div>}
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <div className="text-xs uppercase text-gray-500">Light</div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewLinks.lightUrl}
                        alt={`${selectedBlock.title} preview (light)`}
                        className="w-full rounded-md border border-gray-800 object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs uppercase text-gray-500">Dark</div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewLinks.darkUrl}
                        alt={`${selectedBlock.title} preview (dark)`}
                        className="w-full rounded-md border border-gray-800 object-cover"
                        loading="lazy"
                      />
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">Förhandsvisning från registry</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-800 px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Stäng
          </Button>
          {hasChat && (
            <Button
              variant="secondary"
              onClick={() => handleConfirm("add")}
              disabled={!canAct}
            >
              {isSubmitting && pendingAction === "add" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Lägg till i chatten
            </Button>
          )}
          <Button onClick={() => handleConfirm("start")} disabled={!canAct}>
            {isSubmitting && pendingAction === "start" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Starta nytt projekt
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
