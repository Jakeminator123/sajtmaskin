"use client";

import { useCallback, useState, type MouseEvent, type MouseEventHandler } from "react";
import { Pencil } from "lucide-react";
import type { ElementMapItem } from "@/lib/builder/types";
import { cn } from "@/lib/utils";

const EDITABLE_TEXT_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "span", "a", "li", "button", "label",
  "td", "th", "blockquote", "figcaption",
]);

const EDITABLE_IMAGE_TAGS = new Set(["img"]);

function isEditableElement(el: ElementMapItem): boolean {
  const tag = el.tag.toLowerCase();
  if (EDITABLE_IMAGE_TAGS.has(tag)) {
    return el.vpPercent.w > 1 && el.vpPercent.h > 1;
  }
  if (EDITABLE_TEXT_TAGS.has(tag)) {
    return Boolean(el.text?.trim());
  }
  return false;
}

function findSmallestEditableAt(
  elements: ElementMapItem[],
  xPct: number,
  yPct: number,
): ElementMapItem | null {
  let best: ElementMapItem | null = null;
  let bestArea = Infinity;
  for (const el of elements) {
    if (!isEditableElement(el)) continue;
    const vp = el.vpPercent;
    if (xPct >= vp.x && xPct <= vp.x + vp.w && yPct >= vp.y && yPct <= vp.y + vp.h) {
      const area = vp.w * vp.h;
      if (area < bestArea && area > 0.01) {
        best = el;
        bestArea = area;
      }
    }
  }
  return best;
}

export interface EditModeClickEvent {
  element: ElementMapItem;
  clientX: number;
  clientY: number;
  containerRect: DOMRect;
}

interface EditModeOverlayProps {
  active: boolean;
  elementMap: ElementMapItem[];
  loading: boolean;
  onElementClick: (event: EditModeClickEvent) => void;
}

export function EditModeOverlay({
  active,
  elementMap,
  loading,
  onElementClick,
}: EditModeOverlayProps) {
  const [hovered, setHovered] = useState<ElementMapItem | null>(null);

  const handleMouseMove = useCallback<MouseEventHandler<HTMLDivElement>>(
    (event) => {
      if (elementMap.length === 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const xPct = ((event.clientX - rect.left) / rect.width) * 100;
      const yPct = ((event.clientY - rect.top) / rect.height) * 100;
      setHovered(findSmallestEditableAt(elementMap, xPct, yPct));
    },
    [elementMap],
  );

  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!hovered) return;
      const rect = event.currentTarget.getBoundingClientRect();
      onElementClick({
        element: hovered,
        clientX: event.clientX,
        clientY: event.clientY,
        containerRect: rect,
      });
    },
    [hovered, onElementClick],
  );

  if (!active) return null;

  const isImage = hovered && EDITABLE_IMAGE_TAGS.has(hovered.tag.toLowerCase());

  return (
    <>
      <div
        className={cn(
          "absolute inset-0 z-20",
          hovered ? "cursor-pointer" : "cursor-default",
        )}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered(null)}
      />

      {/* Hover highlight */}
      {hovered && (
        <div
          className="pointer-events-none absolute z-25 rounded-sm border-2 border-primary/60 bg-primary/5"
          style={{
            left: `${hovered.vpPercent.x}%`,
            top: `${hovered.vpPercent.y}%`,
            width: `${hovered.vpPercent.w}%`,
            height: `${hovered.vpPercent.h}%`,
          }}
        >
          <div className="absolute bottom-full left-0 mb-1 flex items-center gap-1 rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground shadow-lg">
            <Pencil className="h-3 w-3" />
            {isImage ? "Byt bild" : "Redigera text"}
          </div>
        </div>
      )}

      {/* Top banner */}
      <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/95 px-4 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur-sm">
          <Pencil className="h-3.5 w-3.5 text-primary" />
          {loading
            ? "Laddar element..."
            : "Klicka på text eller bilder för att redigera"}
        </div>
      </div>
    </>
  );
}
