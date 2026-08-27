"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Check, Loader2, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FEATURED_BLOCKS,
  getBlocksByCategory,
  getComponentsByCategory,
  searchBlocks,
  type ComponentCategory,
  type ComponentItem,
  type RegistryItemKind,
} from "@/lib/shadcn/registry-service";
import {
  fetchCommunityIndexPage,
  SHADCNBLOCKS_NAMESPACE,
} from "@/lib/shadcn/community-registry-client";
import type { CommunityIndexCategory } from "@/lib/shadcn/community-registry-catalog";
import {
  OFFICIAL_SHADCN_REGISTRY,
  type ShadcnInsertHandler,
  type ShadcnInsertSelection,
  type ShadcnPlacementPicker,
} from "@/lib/builder/shadcn-insert";
import { RegistryItemThumb } from "./RegistryItemThumb";

/**
 * "Bläddra"-galleriet — shadcn/ui (PNG-thumbs) + Marknadsblock (@shadcnblocks
 * via community-index). Renderas i Add-panelens overlay-dialog (inte i den
 * 280 px smala asiden). Insättning går alltid via own-engine-lanen.
 * Overlay-läget har ingen drag-and-drop — klick → detalj → Lägg till.
 *
 * Del av plan: `docs/plans/avklarat/2026-07-22-shadcn-registry-beskriv-komposition.md`.
 * Block/Marknadsblock levererat i #994 (`72abd4b53`).
 */

type BrowseItemType = RegistryItemKind;
type BrowseSource = "official" | "shadcnblocks";

type BrowseGalleryItem = ComponentItem & { registry: string };

interface PreviewPanelBrowseGalleryProps {
  disabled?: boolean;
  /** Insättnings-lane v1 (own-engine). Saknas → detaljvyns knapp är disabled. */
  onInsertItem?: ShadcnInsertHandler;
  /**
   * Klick-väg: aktivera befintligt placeringsläge mot previewn innan
   * `onInsertItem` anropas. Saknas → insätt direkt (default "Längst ner").
   * `null` = läget kunde inte visas → samma default. `"aborted"` =
   * Esc/klick utanför/kontextbyte → ingen insättning.
   */
  onPickPlacement?: ShadcnPlacementPicker;
  /**
   * Stäng overlayn innan placeringsläge/insättning så previewn inte täcks.
   * Add-panelen unmountar dialogen synkront (`flushSync`).
   */
  onCloseBeforeInsert?: () => void;
}

/** Bygg insert-payloaden för ett galleri-kort (placering räknas ut vid klick). */
export function toBrowseSelection(item: BrowseGalleryItem): ShadcnInsertSelection {
  return {
    name: item.name,
    registry: item.registry,
    title: item.title,
    description: item.description || undefined,
    origin: "browse",
    ...(item.registry !== OFFICIAL_SHADCN_REGISTRY
      ? { addCommand: `npx shadcn@latest add ${item.registry}/${item.name}` }
      : {}),
  };
}

const SOURCE_TABS: { id: BrowseSource; label: string }[] = [
  { id: "official", label: "shadcn/ui" },
  { id: "shadcnblocks", label: "Marknadsblock" },
];

const ITEM_TYPE_TABS: { id: BrowseItemType; label: string }[] = [
  { id: "block", label: "Block" },
  { id: "component", label: "Komponenter" },
];

const COMMUNITY_PAGE_SIZE = 24;

function withOfficialRegistry(categories: ComponentCategory[]): ComponentCategory[] {
  // ComponentItem has no registry field in the official path — stamp at map time.
  return categories;
}

function stampOfficialItems(categories: ComponentCategory[]): BrowseGalleryItem[] {
  return categories.flatMap((category) =>
    category.items.map((item) => ({ ...item, registry: OFFICIAL_SHADCN_REGISTRY })),
  );
}

export function PreviewPanelBrowseGallery({
  disabled = false,
  onInsertItem,
  onPickPlacement,
  onCloseBeforeInsert,
}: PreviewPanelBrowseGalleryProps) {
  const [source, setSource] = useState<BrowseSource>("official");
  const [itemType, setItemType] = useState<BrowseItemType>("block");
  const [categories, setCategories] = useState<ComponentCategory[]>([]);
  const [communityCategories, setCommunityCategories] = useState<CommunityIndexCategory[]>([]);
  const [communityItems, setCommunityItems] = useState<BrowseGalleryItem[]>([]);
  const [communityTotal, setCommunityTotal] = useState(0);
  const [communityCursor, setCommunityCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<BrowseGalleryItem | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const communityRequestIdRef = useRef(0);
  const communityFilterRef = useRef({
    query: "",
    category: null as string | null,
    source: "official" as BrowseSource,
  });
  communityFilterRef.current = {
    query: debouncedQuery,
    category: activeCategory,
    source,
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (source !== "official") return;
    let ignore = false;
    setLoading(true);
    setError(null);
    const fetcher = itemType === "block" ? getBlocksByCategory : getComponentsByCategory;
    fetcher()
      .then((result) => {
        if (ignore) return;
        setCategories(withOfficialRegistry(result));
        setCommunityItems([]);
        setCommunityCategories([]);
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
  }, [source, itemType, reloadToken]);

  useEffect(() => {
    if (source !== "shadcnblocks") return;
    let ignore = false;
    const requestId = ++communityRequestIdRef.current;
    setLoading(true);
    setError(null);
    setLoadMoreError(null);
    setLoadingMore(false);
    setCommunityCursor(null);
    fetchCommunityIndexPage({
      q: debouncedQuery || undefined,
      category: activeCategory || undefined,
      limit: COMMUNITY_PAGE_SIZE,
    })
      .then((page) => {
        if (ignore || requestId !== communityRequestIdRef.current) return;
        setCommunityCategories(page.categories);
        setCommunityTotal(page.total);
        setCommunityCursor(page.nextCursor);
        setCommunityItems(
          page.items.map((item) => ({
            name: item.name,
            title: item.title,
            description: item.description,
            category: item.category,
            type: "block" as const,
            registry: SHADCNBLOCKS_NAMESPACE,
            previewKind: "layout" as const,
            iconKey: "layout" as const,
          })),
        );
        setCategories([]);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (ignore || requestId !== communityRequestIdRef.current) return;
        setCommunityItems([]);
        setCommunityCategories([]);
        setError(err instanceof Error ? err.message : "Kunde inte hämta marknadsblock.");
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [source, reloadToken, debouncedQuery, activeCategory]);

  const handleSelectSource = useCallback((next: BrowseSource) => {
    setSource(next);
    setActiveCategory(null);
    setSelectedItem(null);
    setQuery("");
    setDebouncedQuery("");
    setCategories([]);
    setCommunityItems([]);
    setLoadMoreError(null);
    setLoading(true);
  }, []);

  const handleSelectItemType = useCallback((next: BrowseItemType) => {
    setItemType(next);
    setActiveCategory(null);
    setSelectedItem(null);
    setCategories([]);
    setLoading(true);
    setQuery("");
    setDebouncedQuery("");
  }, []);

  const officialFilteredCategories = useMemo(() => {
    const searched = searchBlocks(categories, query);
    if (!activeCategory) return searched;
    return searched.filter((category) => category.id === activeCategory);
  }, [categories, query, activeCategory]);

  const visibleItems: BrowseGalleryItem[] = useMemo(() => {
    if (source === "shadcnblocks") return communityItems;
    return stampOfficialItems(officialFilteredCategories);
  }, [source, communityItems, officialFilteredCategories]);

  const handleSelectItem = useCallback((item: BrowseGalleryItem) => {
    setSelectedItem(item);
  }, []);

  const handleRetry = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (!communityCursor || loadingMore || source !== "shadcnblocks") return;
    const requestId = communityRequestIdRef.current;
    const requestQuery = debouncedQuery;
    const requestCategory = activeCategory;
    const requestCursor = communityCursor;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await fetchCommunityIndexPage({
        q: requestQuery || undefined,
        category: requestCategory || undefined,
        limit: COMMUNITY_PAGE_SIZE,
        cursor: requestCursor,
      });
      // Ignore stale responses after filter/source change or a newer first-page fetch.
      const current = communityFilterRef.current;
      if (
        requestId !== communityRequestIdRef.current ||
        requestQuery !== current.query ||
        requestCategory !== current.category ||
        current.source !== "shadcnblocks"
      ) {
        return;
      }
      setCommunityCursor(page.nextCursor);
      setCommunityItems((prev) => [
        ...prev,
        ...page.items.map((item) => ({
          name: item.name,
          title: item.title,
          description: item.description,
          category: item.category,
          type: "block" as const,
          registry: SHADCNBLOCKS_NAMESPACE,
          previewKind: "layout" as const,
          iconKey: "layout" as const,
        })),
      ]);
    } catch (err: unknown) {
      if (requestId !== communityRequestIdRef.current) return;
      // Keep already-loaded cards; show an inline retry under the grid.
      setLoadMoreError(err instanceof Error ? err.message : "Kunde inte hämta fler block.");
    } finally {
      // A superseded request must not clear a newer Visa fler spinner.
      if (requestId === communityRequestIdRef.current) {
        setLoadingMore(false);
      }
    }
  }, [activeCategory, communityCursor, debouncedQuery, loadingMore, source]);

  const categoryChips =
    source === "official"
      ? categories.map((category) => ({
          id: category.id,
          label: `${category.icon} ${category.labelSv}`,
        }))
      : communityCategories.map((category) => ({
          id: category.id,
          label: `${category.label} (${category.count})`,
        }));

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
          onPickPlacement={onPickPlacement}
          onCloseBeforeInsert={onCloseBeforeInsert}
          panelDisabled={disabled}
        />
      ) : (
        <>
          <div className="flex items-center gap-1 border-b border-violet-900/40 px-2 py-2">
            {SOURCE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectSource(tab.id)}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium transition",
                  source === tab.id
                    ? "bg-violet-900/45 text-violet-100"
                    : "text-zinc-400 hover:bg-violet-950/40 hover:text-violet-200",
                )}
                aria-pressed={source === tab.id}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {source === "official" ? (
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
          ) : null}

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
                placeholder={
                  source === "official"
                    ? "Sök block, t.ex. login, chart, sidebar"
                    : "Sök marknadsblock, t.ex. hero, pricing"
                }
                aria-label="Sök i galleriet"
                className="h-8 w-full rounded-md border border-violet-900/50 bg-black/40 pr-2 pl-7 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-violet-600/60 focus:outline-none"
              />
            </div>

            {source === "official" && itemType === "block" ? (
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

          {!loading && !error && categoryChips.length > 0 ? (
            <div
              role="group"
              aria-label="Kategorier"
              className="max-h-[4.75rem] shrink-0 overflow-y-auto border-b border-violet-900/30 px-3 py-2"
            >
              <div className="flex flex-wrap gap-1">
                <CategoryChip
                  label="Alla"
                  active={activeCategory === null}
                  onClick={() => setActiveCategory(null)}
                />
                {categoryChips.map((category) => (
                  <CategoryChip
                    key={category.id}
                    label={category.label}
                    active={activeCategory === category.id}
                    onClick={() => setActiveCategory(category.id)}
                  />
                ))}
              </div>
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
              <>
                {source === "shadcnblocks" ? (
                  <p className="mb-2 px-0.5 text-[10px] text-zinc-500">
                    Visar {visibleItems.length} av {communityTotal}
                  </p>
                ) : null}
                <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
                  {visibleItems.map((item) => (
                    <BrowseCard
                      key={`${item.registry}:${item.type}:${item.name}`}
                      item={item}
                      onSelect={() => handleSelectItem(item)}
                    />
                  ))}
                </div>
                {source === "shadcnblocks" && loadMoreError ? (
                  <div className="mt-3 rounded-md border border-rose-900/50 bg-rose-950/20 px-3 py-2 text-center text-[11px] text-rose-200/90">
                    <p>{loadMoreError}</p>
                    <button
                      type="button"
                      onClick={() => void handleLoadMore()}
                      className="mt-2 rounded-md border border-violet-800/60 px-3 py-1 text-violet-200 transition hover:bg-violet-950/40"
                    >
                      Försök hämta fler igen
                    </button>
                  </div>
                ) : null}
                {source === "shadcnblocks" && communityCursor ? (
                  <button
                    type="button"
                    onClick={() => void handleLoadMore()}
                    disabled={loadingMore}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-violet-800/60 px-3 py-2 text-[11px] text-violet-200 transition hover:bg-violet-950/40 disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : null}
                    Visa fler
                  </button>
                ) : null}
              </>
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

/** Thumbnail-URL: officiella block har PNG; marknadsblock använder ikon-fallback. */
function thumbnailUrl(item: BrowseGalleryItem): string | null {
  if (item.registry !== OFFICIAL_SHADCN_REGISTRY) return null;
  if (item.type !== "block") return null;
  return item.lightImageUrl ?? null;
}

function BrowseCard({
  item,
  onSelect,
}: {
  item: BrowseGalleryItem;
  onSelect: () => void;
}) {
  const thumb = thumbnailUrl(item);
  return (
    <button
      type="button"
      onClick={onSelect}
      draggable={false}
      className="group flex flex-col overflow-hidden rounded-lg border border-violet-900/50 bg-black/30 text-left transition hover:border-violet-700/60 hover:bg-violet-950/40 focus:border-violet-600/70 focus:outline-none"
      title={item.description || item.title}
    >
      <div className="flex aspect-video items-center justify-center overflow-hidden bg-zinc-900/80">
        <RegistryItemThumb
          src={thumb}
          alt={item.title}
          previewKind={item.previewKind ?? (item.type === "block" ? "layout" : undefined)}
          iconKey={item.iconKey}
        />
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
  onPickPlacement,
  onCloseBeforeInsert,
  panelDisabled = false,
}: {
  item: BrowseGalleryItem;
  onBack: () => void;
  onInsertItem?: ShadcnInsertHandler;
  onPickPlacement?: ShadcnPlacementPicker;
  onCloseBeforeInsert?: () => void;
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
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleInsert = useCallback(async () => {
    if (!onInsertItem || insertingRef.current) return;
    insertingRef.current = true;
    setInserting(true);
    setInserted(false);
    try {
      const selection = toBrowseSelection(item);
      // Overlayn måste bort innan placeringsläget ritas mot previewn.
      onCloseBeforeInsert?.();
      const picked = onPickPlacement ? await onPickPlacement(selection) : null;
      if (picked === "aborted") return;
      const outcome = await onInsertItem({
        ...selection,
        ...(picked
          ? {
              placement: picked.placement,
              placementLabel: picked.placementLabel,
              anchorSectionLabel: picked.anchorSectionLabel,
            }
          : {}),
      });
      if (outcome.status !== "started") return;
      if (!mountedRef.current) return;
      setInserted(true);
      window.setTimeout(() => {
        if (mountedRef.current) setInserted(false);
      }, 8000);
    } catch {
      // Fel-ytan ägs av callern (toast) — markera bara ALDRIG som skickad.
    } finally {
      insertingRef.current = false;
      if (mountedRef.current) setInserting(false);
    }
  }, [onInsertItem, onPickPlacement, onCloseBeforeInsert, item]);

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
          <RegistryItemThumb
            src={thumb}
            alt={item.title}
            fallbackLabel="Ingen förhandsbild"
            previewKind={item.previewKind ?? (item.type === "block" ? "layout" : undefined)}
            iconKey={item.iconKey}
          />
        </div>
        <h3 className="text-sm font-semibold text-violet-100">{item.title}</h3>
        <p className="mt-0.5 font-mono text-[10px] text-zinc-500">
          {`${item.registry}/${item.name}`}
        </p>
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
