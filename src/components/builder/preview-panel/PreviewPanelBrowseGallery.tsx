"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ImageOff,
  Loader2,
  Plus,
  Puzzle,
  Search,
} from "lucide-react";
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
import {
  OFFICIAL_SHADCN_REGISTRY,
  type ShadcnInsertSelection,
} from "@/lib/builder/shadcn-insert";

/**
 * "Bläddra"-galleriet — väcker den vilande shadcn-registry-datan
 * (`CURATED_UI_COLLECTIONS`/`FEATURED_BLOCKS`/`getBlocksByCategory`/
 * `getComponentsByCategory`/`searchBlocks` + thumbnails via `buildPreviewImageUrl`)
 * som en visuell kort-galleriyta i buildern.
 *
 * Del av plan: `docs/plans/avklarat/2026-07-22-shadcn-registry-beskriv-komposition.md`
 * (Fas 3 — Bläddra + Fas 2 v1 — insättning).
 *
 * Insättning (Fas 2 v1): kortvalets metadata skickas via `onInsertItem` genom
 * den BEFINTLIGA sendMessage/own-engine-vägen (se `shadcn-insert.ts`) —
 * generering + verify producerar en ny version. Aldrig rå filpatch. Utan
 * callback är detaljvyn read-only (samma som Fas 3). Fetch sker via de
 * befintliga `/api/shadcn/registry`-proxyroutesen (fungerar i prod) och först
 * när denna komponent monteras (dvs. när fliken öppnas). Flagga av = ingen fetch alls.
 */

type BrowseItemType = RegistryItemKind;

export interface PreviewPanelBrowseGalleryProps {
  disabled?: boolean;
  /** Insättnings-lane v1 (own-engine). Saknas → detaljvyns knapp är disabled. */
  onInsertItem?: (selection: ShadcnInsertSelection) => void | Promise<void>;
}

const ITEM_TYPE_TABS: { id: BrowseItemType; label: string }[] = [
  { id: "block", label: "Block" },
  { id: "component", label: "Komponenter" },
];

export function PreviewPanelBrowseGallery({
  disabled = false,
  onInsertItem,
}: PreviewPanelBrowseGalleryProps) {
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
    /* eslint-disable react-hooks/set-state-in-effect -- enter loading state when itemType/reload changes before the async fetch resolves */
    setLoading(true);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
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

  const handleSelectItemType = useCallback((next: BrowseItemType) => {
    // Reset transient view-state in the same tick as the itemType switch
    // (avoids a separate reset effect / cascading render). Categories, loading
    // and query are also cleared here so the grid never shows the previous
    // tab's cards (or filters the new list with a stale search string) during
    // the frame(s) before the fetch effect runs.
    setItemType(next);
    setActiveCategory(null);
    setSelectedItem(null);
    setCategories([]);
    setLoading(true);
    setQuery("");
  }, []);

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
        <BrowseDetailView
          item={selectedItem}
          onBack={() => setSelectedItem(null)}
          onInsertItem={onInsertItem}
          panelDisabled={disabled}
        />
      ) : (
        <>
          {/* itemType-flikar: driver getBlocksByCategory vs getComponentsByCategory */}
          <div className="flex items-center gap-1 border-b border-violet-900/40 px-2 py-2">
            {ITEM_TYPE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectItemType(tab.id)}
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

function BrowseDetailView({
  item,
  onBack,
  onInsertItem,
  panelDisabled = false,
}: {
  item: ComponentItem;
  onBack: () => void;
  onInsertItem?: (selection: ShadcnInsertSelection) => void | Promise<void>;
  /**
   * Panelens disabled-läge (saknad preview, placement mode, composer-historik).
   * Wrappern har bara `pointer-events-none` — utan detta kan tangentbordet
   * fortfarande fokusera och aktivera knappen (Codex P2).
   */
  panelDisabled?: boolean;
}) {
  const thumb = thumbnailUrl(item);
  const [inserting, setInserting] = useState(false);
  const [inserted, setInserted] = useState(false);
  // Ref-guard mot dubbelklick: två snabba klick före nästa render ser båda
  // `inserting === false` (stale closure) — refen uppdateras synkront och
  // stoppar det andra klicket från att trigga en duplicerad generation.
  const insertingRef = useRef(false);

  // Insättnings-lane v1 (Fas 2): kortvalets metadata → `shadcn-insert.ts` →
  // BEFINTLIGA sendMessage/own-engine-vägen → generering + verify → ny version.
  // Aldrig rå filpatch. SEAM (Fas 2 v2, utanför v1-scope): en deterministisk
  // recipe-lane (getRegistryItems → rewriteRegistryImports → dep-completer →
  // recipe-injektion i own-engine-turn) kan senare ersätta prompt-vägen — samma
  // `ShadcnInsertSelection` som ingång.
  const handleInsert = useCallback(async () => {
    if (!onInsertItem || insertingRef.current) return;
    insertingRef.current = true;
    setInserting(true);
    setInserted(false);
    try {
      await onInsertItem({
        name: item.name,
        registry: OFFICIAL_SHADCN_REGISTRY,
        title: item.title,
        description: item.description || undefined,
        origin: "browse",
      });
      setInserted(true);
      // sendMessage exponerar inget utfall (BB#shadcn-lane1): vissa hanterade
      // fel (409/412/abort) resolvar utan kast. Tidsbegränsa "Skickat"-låset
      // så ett tyst misslyckande inte bränner kortet för nya försök.
      window.setTimeout(() => setInserted(false), 8000);
    } catch {
      // Fel-ytan ägs av callern (toast) — markera bara ALDRIG som skickad.
    } finally {
      insertingRef.current = false;
      setInserting(false);
    }
  }, [onInsertItem, item]);

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

        {onInsertItem ? (
          <div className="mt-4 rounded-md border border-violet-900/50 bg-violet-950/20 px-3 py-2 text-[11px] text-violet-200/80">
            Blocket skickas till AI:n som bygger in det i sajten och verifierar att det
            fungerar — en ny version skapas när genereringen är klar.
          </div>
        ) : (
          <div className="mt-4 rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-100/90">
            Insättning är inte tillgänglig här ännu. Just nu kan du bläddra och
            förhandsgranska — blocket läggs inte till i sajten.
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleInsert()}
          disabled={!onInsertItem || panelDisabled || inserting || inserted}
          title={
            onInsertItem
              ? "Skicka blocket till AI:n för insättning"
              : "Insättning är inte tillgänglig här ännu"
          }
          className={cn(
            "mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-[11px] font-medium transition",
            inserted
              ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-200"
              : onInsertItem
                ? "border-violet-800/60 bg-violet-950/30 text-violet-200 hover:bg-violet-900/40 disabled:cursor-not-allowed disabled:opacity-50"
                : "cursor-not-allowed border-violet-900/50 bg-violet-950/30 text-violet-300/70",
          )}
        >
          {inserting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : inserted ? (
            <Check className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden />
          )}
          {inserting
            ? "Skickar…"
            : inserted
              ? "Skickat till chatten — se status där"
              : "Lägg till i sajten"}
        </button>
      </div>
    </div>
  );
}
