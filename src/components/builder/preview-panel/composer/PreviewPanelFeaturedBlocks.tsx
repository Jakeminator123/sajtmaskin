"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { AlertCircle, Check, GripVertical, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FEATURED_SHADCNBLOCKS,
  fetchFeaturedShadcnblocks,
  SHADCNBLOCKS_NAMESPACE,
} from "@/lib/shadcn/community-registry-client";
import type { CommunityIndexItem } from "@/lib/shadcn/community-registry-index";
import {
  serializeShadcnDragPayload,
  SHADCN_ITEM_DND_TYPE,
  type ShadcnInsertHandler,
  type ShadcnInsertSelection,
  type ShadcnPlacementPicker,
} from "@/lib/builder/shadcn-insert";
import { RegistryItemThumb } from "./RegistryItemThumb";

/**
 * Block-flikens snabbval: 8 kuraterade @shadcnblocks-poster (ersätter de
 * lokala JSX-snippetsen inne i Add-panelen). Insättning går via samma
 * own-engine-lane som Bläddra/Beskriv — aldrig rå filpatch.
 */

interface PreviewPanelFeaturedBlocksProps {
  disabled?: boolean;
  onInsertItem?: ShadcnInsertHandler;
  onPickPlacement?: ShadcnPlacementPicker;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

function toFeaturedSelection(item: CommunityIndexItem): ShadcnInsertSelection {
  return {
    name: item.name,
    registry: SHADCNBLOCKS_NAMESPACE,
    title: item.title,
    description: item.description || undefined,
    addCommand: `npx shadcn@latest add ${SHADCNBLOCKS_NAMESPACE}/${item.name}`,
    origin: "browse",
  };
}

function fallbackFeaturedItems(): CommunityIndexItem[] {
  return FEATURED_SHADCNBLOCKS.map((entry) => ({
    name: entry.name,
    type: "registry:block",
    title: entry.labelSv,
    description: `@shadcnblocks/${entry.name}`,
    category: entry.category,
  }));
}

export function PreviewPanelFeaturedBlocks({
  disabled = false,
  onInsertItem,
  onPickPlacement,
  onDragStart,
  onDragEnd,
}: PreviewPanelFeaturedBlocksProps) {
  const [items, setItems] = useState<CommunityIndexItem[]>(fallbackFeaturedItems);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [insertingKey, setInsertingKey] = useState<string | null>(null);
  const [insertedKey, setInsertedKey] = useState<string | null>(null);
  const insertingRef = useRef(false);

  useEffect(() => {
    let ignore = false;
    /* eslint-disable react-hooks/set-state-in-effect -- loading gate before async featured resolve */
    setLoading(true);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetchFeaturedShadcnblocks()
      .then((page) => {
        if (ignore) return;
        if (page.items.length > 0) {
          // Keep featured order stable (seed order), not upstream sort.
          const byName = new Map(page.items.map((item) => [item.name, item]));
          setItems(
            FEATURED_SHADCNBLOCKS.map((entry) => {
              const hit = byName.get(entry.name);
              return (
                hit ?? {
                  name: entry.name,
                  type: "registry:block",
                  title: entry.labelSv,
                  description: `@shadcnblocks/${entry.name}`,
                  category: entry.category,
                }
              );
            }),
          );
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "Kunde inte hämta snabbval.");
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [reloadToken]);

  const labelByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of FEATURED_SHADCNBLOCKS) {
      map.set(entry.name, entry.labelSv);
    }
    return map;
  }, []);

  const handleInsert = useCallback(
    async (item: CommunityIndexItem) => {
      if (!onInsertItem || insertingRef.current) return;
      insertingRef.current = true;
      const key = item.name;
      setInsertingKey(key);
      setInsertedKey(null);
      try {
        const selection = toFeaturedSelection(item);
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
        setInsertedKey(key);
        window.setTimeout(() => setInsertedKey((current) => (current === key ? null : current)), 8000);
      } catch {
        // Toast ägs av callern.
      } finally {
        insertingRef.current = false;
        setInsertingKey(null);
      }
    },
    [onInsertItem, onPickPlacement],
  );

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col bg-zinc-950/95",
        disabled && "pointer-events-none opacity-50",
      )}
      aria-label="Snabbval marknadsblock"
    >
      <div className="border-b border-violet-900/40 px-3 py-2">
        <p className="text-[11px] text-zinc-400">
          Åtta kuraterade shadcnblocks — samma insättning som Bläddra.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[11px] text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Hämtar snabbval…
          </div>
        ) : error && items.every((item) => item.title === labelByName.get(item.name)) ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <AlertCircle className="h-5 w-5 text-rose-400" />
            <p className="text-[11px] text-rose-200/90">{error}</p>
            <button
              type="button"
              onClick={() => setReloadToken((n) => n + 1)}
              className="rounded-md border border-violet-800/60 px-3 py-1 text-[11px] text-violet-200 transition hover:bg-violet-950/40"
            >
              Försök igen
            </button>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {items.map((item) => {
              const sectionLabel = labelByName.get(item.name) ?? item.category;
              const inserting = insertingKey === item.name;
              const inserted = insertedKey === item.name;
              const draggable = Boolean(onInsertItem) && !disabled && !insertingKey;
              return (
                <li key={item.name}>
                  <div className="overflow-hidden rounded-lg border border-violet-900/50 bg-black/30">
                    <button
                      type="button"
                      draggable={draggable}
                      onDragStart={(e: DragEvent<HTMLButtonElement>) => {
                        if (!draggable) return;
                        e.dataTransfer.setData(
                          SHADCN_ITEM_DND_TYPE,
                          serializeShadcnDragPayload(toFeaturedSelection(item)),
                        );
                        e.dataTransfer.effectAllowed = "copy";
                        onDragStart?.();
                      }}
                      onDragEnd={() => onDragEnd?.()}
                      onClick={() => void handleInsert(item)}
                      disabled={!onInsertItem || disabled || inserting || inserted}
                      className="flex w-full items-start gap-2 px-2 py-2 text-left transition hover:bg-violet-950/40 disabled:cursor-not-allowed disabled:opacity-60"
                      title={
                        draggable
                          ? `${item.description || item.title} — dra till previewn eller klicka för att lägga till`
                          : item.description || item.title
                      }
                    >
                      <GripVertical
                        className="mt-1 h-3.5 w-3.5 shrink-0 text-zinc-500"
                        aria-hidden
                      />
                      <div className="h-12 w-16 shrink-0 overflow-hidden rounded-md border border-violet-900/40 bg-zinc-900/80">
                        <RegistryItemThumb
                          src={null}
                          alt={item.title}
                          previewKind="layout"
                          iconKey="layout"
                        />
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="rounded-full bg-violet-900/50 px-1.5 py-0.5 text-[9px] font-medium text-violet-200/90">
                            {sectionLabel}
                          </span>
                          <span className="truncate text-[11px] font-medium text-violet-100">
                            {item.title}
                          </span>
                        </span>
                        <span className="mt-0.5 block font-mono text-[9px] text-zinc-500">
                          @{SHADCNBLOCKS_NAMESPACE.replace("@", "")}/{item.name}
                        </span>
                        {item.description ? (
                          <span className="mt-1 line-clamp-2 block text-[10px] leading-snug text-zinc-500">
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 shrink-0 text-violet-300/80">
                        {inserting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : inserted ? (
                          <Check className="h-3.5 w-3.5 text-emerald-300" aria-hidden />
                        ) : (
                          <Plus className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
