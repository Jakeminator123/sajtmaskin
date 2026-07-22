"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, ImageOff, Loader2, Puzzle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildPreviewImageUrl,
  FEATURED_BLOCKS,
  getBlocksByCategory,
  getComponentsByCategory,
  searchBlocks,
  type ComponentCategory,
  type ComponentItem,
  type RegistryItemKind,
} from "@/lib/shadcn/registry-service";

/**
 * "Bläddra"-galleriet — väcker den vilande shadcn-registry-datan
 * (`CURATED_UI_COLLECTIONS`/`FEATURED_BLOCKS`/`getBlocksByCategory`/
 * `getComponentsByCategory`/`searchBlocks` + thumbnails via `buildPreviewImageUrl`)
 * som en visuell kort-galleriyta i buildern.
 *
 * Del av plan: `docs/plans/active/2026-07-22-shadcn-registry-beskriv-komposition.md`
 * (Fas 3 — Bläddra).
 *
 * VIKTIGT (Fas 3-scope): att välja ett kort öppnar bara en detaljvy. INGEN
 * insättning kopplas ännu — se SEAM-kommentaren i detaljvyn nedan. Fetch sker via
 * de befintliga `/api/shadcn/registry`-proxyroutesen (fungerar i prod) och först
 * när denna komponent monteras (dvs. när fliken öppnas). Flagga av = ingen fetch alls.
 */

type BrowseItemType = RegistryItemKind;

export interface PreviewPanelBrowseGalleryProps {
  disabled?: boolean;
}

const ITEM_TYPE_TABS: { id: BrowseItemType; label: string }[] = [
  { id: "block", label: "Block" },
  { id: "component", label: "Komponenter" },
];

export function PreviewPanelBrowseGallery({ disabled = false }: PreviewPanelBrowseGalleryProps) {
  const [itemType, setItemType] = useState<BrowseItemType>("block");
  const [categories, setCategories] = useState<ComponentCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ComponentItem | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    const fetcher = itemType === "block" ? getBlocksByCategory : getComponentsByCategory;
    fetcher()
      .then((result) => {
        if (ignore) return;
        setCategories(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (ignore) return;
        setCategories([]);
        setError(err instanceof Error ? err.message : "Kunde inte hämta registry-innehåll.");
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [itemType, reloadToken]);

  // Reset transient view state when switching between block/component.
  useEffect(() => {
    setActiveCategory(null);
    setSelectedItem(null);
  }, [itemType]);

  const filteredCategories = useMemo(() => {
    const searched = searchBlocks(categories, query);
    if (!activeCategory) return searched;
    return searched.filter((category) => category.id === activeCategory);
  }, [categories, query, activeCategory]);

  const visibleItems = useMemo(
    () => filteredCategories.flatMap((category) => category.items),
    [filteredCategories],
  );

  const handleSelectItem = useCallback((item: ComponentItem) => {
    setSelectedItem(item);
  }, []);

  const handleRetry = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-zinc-950/95",
        disabled && "pointer-events-none opacity-50",
      )}
      aria-label="Bläddra shadcn-galleri"
    >
      {selectedItem ? (
        <BrowseDetailView item={selectedItem} onBack={() => setSelectedItem(null)} />
      ) : (
        <>
          {/* itemType-flikar: driver getBlocksByCategory vs getComponentsByCategory */}
          <div className="flex items-center gap-1 border-b border-violet-900/40 px-2 py-2">
            {ITEM_TYPE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setItemType(tab.id)}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium transition",
                  itemType === tab.id
                    ? "bg-violet-900/45 text-violet-100"
                    : "text-zinc-400 hover:bg-violet-950/40 hover:text-violet-200",
                )}
                aria-pressed={itemType === tab.id}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sökfält → searchBlocks */}
          <div className="border-b border-violet-900/40 px-2 py-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Sök block, t.ex. login, chart, sidebar"
                aria-label="Sök i galleriet"
                className="h-8 w-full rounded-md border border-violet-900/50 bg-black/40 pr-2 pl-7 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-violet-600/60 focus:outline-none"
              />
            </div>

            {/* Featured quick-filter-chips från FEATURED_BLOCKS */}
            {itemType === "block" ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {FEATURED_BLOCKS.slice(0, 8).map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => {
                      setActiveCategory(null);
                      setQuery(group.id);
                    }}
                    title={group.descriptionSv}
                    className="rounded-full border border-violet-900/50 px-2 py-0.5 text-[10px] text-violet-200/80 transition hover:border-violet-700/60 hover:text-violet-100"
                  >
                    <span aria-hidden className="mr-1">
                      {group.icon}
                    </span>
                    {group.titleSv}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Kategori-chips */}
          {!loading && !error && categories.length > 0 ? (
            <div className="flex flex-wrap gap-1 border-b border-violet-900/30 px-2 py-2">
              <CategoryChip
                label="Alla"
                active={activeCategory === null}
                onClick={() => setActiveCategory(null)}
              />
              {categories.map((category) => (
                <CategoryChip
                  key={category.id}
                  label={`${category.icon} ${category.labelSv}`}
                  active={activeCategory === category.id}
                  onClick={() => setActiveCategory(category.id)}
                />
              ))}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[11px] text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Hämtar galleri…
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <AlertCircle className="h-5 w-5 text-rose-400" />
                <p className="text-[11px] text-rose-200/90">{error}</p>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="rounded-md border border-violet-800/60 px-3 py-1 text-[11px] text-violet-200 transition hover:bg-violet-950/40"
                >
                  Försök igen
                </button>
              </div>
            ) : visibleItems.length === 0 ? (
              <p className="py-8 text-center text-[11px] text-zinc-500">
                Inga träffar{query ? ` för “${query}”` : ""}.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {visibleItems.map((item) => (
                  <BrowseCard
                    key={`${item.type}:${item.name}`}
                    item={item}
                    onSelect={() => handleSelectItem(item)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] transition",
        active
          ? "bg-violet-900/50 text-violet-100"
          : "text-zinc-400 hover:bg-violet-950/40 hover:text-violet-200",
      )}
    >
      {label}
    </button>
  );
}

/** Thumbnail-URL: block har PNG via `buildPreviewImageUrl`; komponenter saknar bild. */
function thumbnailUrl(item: ComponentItem): string | null {
  if (item.type !== "block") return null;
  return item.lightImageUrl ?? buildPreviewImageUrl(item.name, "light");
}

function BrowseCard({ item, onSelect }: { item: ComponentItem; onSelect: () => void }) {
  const thumb = thumbnailUrl(item);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex flex-col overflow-hidden rounded-lg border border-violet-900/50 bg-black/30 text-left transition hover:border-violet-700/60 hover:bg-violet-950/40 focus:border-violet-600/70 focus:outline-none"
      title={item.description || item.title}
    >
      <div className="flex aspect-video items-center justify-center overflow-hidden bg-zinc-900/80">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <Puzzle className="h-6 w-6 text-zinc-600" aria-hidden />
        )}
      </div>
      <div className="space-y-0.5 px-2 py-1.5">
        <div className="truncate text-[11px] font-medium text-violet-100">{item.title}</div>
        {item.description ? (
          <div className="line-clamp-2 text-[10px] leading-snug text-zinc-500">
            {item.description}
          </div>
        ) : null}
      </div>
    </button>
  );
}

function BrowseDetailView({ item, onBack }: { item: ComponentItem; onBack: () => void }) {
  const thumb = thumbnailUrl(item);

  // SEAM (Fas 2): här hakar den funktionella insättnings-lanen in senare
  // (getRegistryItems → rewriteRegistryImports → dep-completer → own-engine
  //  recipe-turn → Normalize/RepairGate/RenderGate → ny version + preview).
  // I Fas 3 är detta medvetet en no-op: vi skriver INGET till användarsajten.
  const handleInsert = () => {
    /* no-op tills Fas 2-lanen kopplas in (se SEAM ovan). */
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-violet-900/40 px-2 py-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-zinc-400 transition hover:bg-violet-950/40 hover:text-violet-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Tillbaka
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="mb-3 flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-violet-900/50 bg-zinc-900/80">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt={item.title} className="h-full w-full object-cover object-top" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-zinc-600">
              <ImageOff className="h-6 w-6" aria-hidden />
              <span className="text-[10px]">Ingen förhandsbild</span>
            </div>
          )}
        </div>
        <h3 className="text-sm font-semibold text-violet-100">{item.title}</h3>
        <p className="mt-0.5 font-mono text-[10px] text-zinc-500">{item.name}</p>
        {item.description ? (
          <p className="mt-2 text-[11px] leading-snug text-zinc-400">{item.description}</p>
        ) : null}

        <div className="mt-4 rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-100/90">
          Insättning kommer i en senare fas. Just nu kan du bläddra och förhandsgranska —
          blocket läggs inte till i sajten ännu.
        </div>

        <button
          type="button"
          onClick={handleInsert}
          disabled
          aria-disabled
          title="Insättning kopplas i en senare fas"
          className="mt-3 w-full cursor-not-allowed rounded-md border border-violet-900/50 bg-violet-950/30 px-3 py-2 text-[11px] font-medium text-violet-300/70"
        >
          Lägg till i sajten (snart)
        </button>
      </div>
    </div>
  );
}
