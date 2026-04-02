"use client";

import { GripVertical, LayoutGrid } from "lucide-react";
import type { DragEvent, DragEventHandler, MouseEventHandler } from "react";
import { cn } from "@/lib/utils";
import {
  PAGE_BLOCK_ITEMS,
  PAGE_BLOCK_CATEGORIES,
  type PageBlockCatalogItem,
} from "@/lib/builder/page-blocks-catalog";
import {
  nearestInsertionPoint,
  type InsertionPoint,
  type SectionZone,
} from "@/lib/builder/sectionAnalyzer";
import type { PlacementAnchorSection } from "@/lib/builder/inspect-events";

export const PAGE_BLOCK_DND_TYPE = "application/x-sajtmaskin-page-block";

function blocksByCategory(): Map<string, PageBlockCatalogItem[]> {
  const m = new Map<string, PageBlockCatalogItem[]>();
  for (const cat of PAGE_BLOCK_CATEGORIES) {
    m.set(cat.id, []);
  }
  for (const item of PAGE_BLOCK_ITEMS) {
    const list = m.get(item.category) ?? [];
    list.push(item);
    m.set(item.category, list);
  }
  return m;
}

export function PreviewPanelComposerPalette(props: {
  disabled?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const { disabled, onDragStart, onDragEnd } = props;
  const grouped = blocksByCategory();

  return (
    <aside
      className={cn(
        "flex w-[200px] shrink-0 flex-col border-r border-violet-900/50 bg-zinc-950/95",
        disabled && "pointer-events-none opacity-50",
      )}
      aria-label="Sajtblock"
    >
      <div className="border-b border-violet-900/40 px-2 py-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-tight text-violet-200">
          <LayoutGrid className="h-3.5 w-3.5" />
          Composer
        </div>
        <p className="mt-1 text-[10px] leading-snug text-violet-200/70">
          Dra ett block till previewn. Endast <span className="text-violet-100">överst</span> /{" "}
          <span className="text-violet-100">längst ner</span> sparas direkt i koden; annars skickas en AI‑förfrågan.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
        {PAGE_BLOCK_CATEGORIES.map((cat) => {
          const items = grouped.get(cat.id) ?? [];
          if (items.length === 0) return null;
          return (
            <div key={cat.id} className="mb-3">
              <div className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                {cat.label}
              </div>
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      draggable={!disabled}
                      onDragStart={(e) => {
                        if (disabled) return;
                        e.dataTransfer.setData(PAGE_BLOCK_DND_TYPE, item.id);
                        e.dataTransfer.effectAllowed = "copy";
                        onDragStart?.();
                      }}
                      onDragEnd={() => {
                        onDragEnd?.();
                      }}
                      className="flex w-full items-start gap-1 rounded-md border border-transparent px-1.5 py-1.5 text-left text-[11px] text-zinc-200 transition hover:border-violet-800/60 hover:bg-violet-950/40"
                    >
                      <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
                      <span>
                        <span className="font-medium text-violet-100">{item.label}</span>
                        <span className="mt-0.5 block text-[10px] leading-snug text-zinc-500">
                          {item.description}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

type HoveredPlacement = InsertionPoint;

export function PreviewPanelComposerOverlay(props: {
  show: boolean;
  iframeLoading: boolean;
  externalLoading: boolean;
  isDraggingBlock: boolean;
  hoveredPlacement: HoveredPlacement | null;
  lastActionLabel?: string | null;
  onDragOver: DragEventHandler<HTMLDivElement>;
  onDragLeave: () => void;
  onDrop: DragEventHandler<HTMLDivElement>;
  onMouseMove: MouseEventHandler<HTMLDivElement>;
}) {
  const {
    show,
    iframeLoading,
    externalLoading,
    isDraggingBlock,
    hoveredPlacement,
    lastActionLabel,
    onDragOver,
    onDragLeave,
    onDrop,
    onMouseMove,
  } = props;

  if (!show) return null;

  return (
    <>
      <div
        className={cn(
          "absolute inset-0 z-20 bg-violet-950/5",
          isDraggingBlock ? "cursor-copy" : "pointer-events-none",
          (iframeLoading || externalLoading) && "pointer-events-none",
        )}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onMouseMove={onMouseMove}
      />
      {isDraggingBlock && hoveredPlacement ? (
        <div
          className="pointer-events-none absolute inset-x-0 z-30 border-t-2 border-dashed border-violet-400"
          style={{ top: `${hoveredPlacement.lineYPercent}%` }}
        >
          <div className="absolute -top-6 left-3 rounded bg-violet-950/90 px-2 py-1 text-[11px] text-violet-100 shadow-lg">
            {hoveredPlacement.label}
          </div>
        </div>
      ) : null}
      <div className="pointer-events-none absolute right-3 bottom-3 left-3 z-30 max-w-md rounded border border-violet-800/60 bg-violet-950/90 px-3 py-2 text-[11px] text-violet-100 shadow-lg backdrop-blur-sm">
        <span className="font-semibold text-violet-300">Visual Composer</span>
        <p className="mt-1 text-violet-200/85">
          Dra ett block från vänster och släpp här. Släpp nära överkant eller underkant för direkt infogning i{" "}
          <code className="rounded bg-black/30 px-1">app/page.tsx</code>.
        </p>
        {lastActionLabel ? (
          <p className="mt-1.5 text-violet-200/95">
            Senaste handling: <span className="font-medium text-violet-100">{lastActionLabel}</span>
          </p>
        ) : null}
      </div>
    </>
  );
}

export type ComposerDropDetail = {
  placement: string;
  placementLabel: string;
  lineYPercent: number;
  xPercent: number;
  yPercent: number;
  viewportWidth: number;
  viewportHeight: number;
  anchorSection?: PlacementAnchorSection;
};

export function buildComposerDropDetail(
  event: DragEvent<HTMLDivElement>,
  sectionZones: SectionZone[],
): ComposerDropDetail {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
  const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
  const xPercent = Number(((x / rect.width) * 100).toFixed(2));
  const yPercent = Number(((y / rect.height) * 100).toFixed(2));
  const insertion = nearestInsertionPoint(yPercent, sectionZones);
  return {
    placement: insertion.placement,
    placementLabel: insertion.label,
    lineYPercent: insertion.lineYPercent,
    xPercent,
    yPercent,
    viewportWidth: Math.round(rect.width),
    viewportHeight: Math.round(rect.height),
    anchorSection: insertion.anchorSection,
  };
}
