"use client";

import { BrainCircuit, Code2, MousePointer2, X, Zap } from "lucide-react";
import { type MouseEventHandler } from "react";
import { Button } from "@/components/ui/button";
import type { ElementMapItem } from "@/lib/builder/types";
import { cn } from "@/lib/utils";

type InspectEngine = "playwright" | "ai" | "map";

interface HoveredPlacement {
  label: string;
  lineYPercent: number;
}

interface PendingPlacementItem {
  title: string;
  description?: string | null;
}

interface InspectPulseMarker {
  x: number;
  y: number;
  key: number;
}

interface LastCodeMatch {
  item: {
    id: string;
    lineNumber: number | null;
    filePath: string;
  };
}

interface PreviewPanelInspectorDevProps {
  showPlacementOverlay: boolean;
  showInspectOverlay: boolean;
  iframeLoading: boolean;
  externalLoading: boolean;
  handlePlacementClick: MouseEventHandler<HTMLDivElement>;
  handlePlacementMouseMove: MouseEventHandler<HTMLDivElement>;
  onPlacementMouseLeave: () => void;
  hoveredPlacement: HoveredPlacement | null;
  pendingPlacementItem?: PendingPlacementItem | null;
  elementMapLoading: boolean;
  sectionZonesCount: number;
  isCapturePending: boolean;
  handleCaptureClick: MouseEventHandler<HTMLDivElement>;
  handleInspectMouseMove?: MouseEventHandler<HTMLDivElement>;
  onInspectMouseLeave?: () => void;
  inspectEngine: InspectEngine;
  hoveredMapElement: ElementMapItem | null;
  inspectPulse: InspectPulseMarker | null;
  setInspectEngine: (engine: InspectEngine) => void;
  inspectorUnavailable: boolean;
  elementMapCount: number;
  totalAiCostUsd: number;
  lastAiCostDisplay: string | null;
  inspectStatus: string | null;
  lastCodeMatch: LastCodeMatch | null;
  onShowLastCodeMatch: () => void;
  handleToggleInspect: () => void;
}

export function PreviewPanelInspectorDev({
  showPlacementOverlay,
  showInspectOverlay,
  iframeLoading,
  externalLoading,
  handlePlacementClick,
  handlePlacementMouseMove,
  onPlacementMouseLeave,
  hoveredPlacement,
  pendingPlacementItem,
  elementMapLoading,
  sectionZonesCount,
  isCapturePending,
  handleCaptureClick,
  handleInspectMouseMove,
  onInspectMouseLeave,
  inspectEngine,
  hoveredMapElement,
  inspectPulse,
  setInspectEngine,
  inspectorUnavailable,
  elementMapCount,
  totalAiCostUsd,
  lastAiCostDisplay,
  inspectStatus,
  lastCodeMatch,
  onShowLastCodeMatch,
  handleToggleInspect,
}: PreviewPanelInspectorDevProps) {
  return (
    <>
      {showPlacementOverlay ? (
        <>
          <div
            className={cn(
              "absolute inset-0 z-20 cursor-crosshair bg-sky-950/10",
              (iframeLoading || externalLoading) && "pointer-events-none",
            )}
            onClick={handlePlacementClick}
            onMouseMove={handlePlacementMouseMove}
            onMouseLeave={onPlacementMouseLeave}
          />
          {hoveredPlacement ? (
            <div
              className="pointer-events-none absolute inset-x-0 z-30 border-t-2 border-dashed border-sky-400"
              style={{ top: `${hoveredPlacement.lineYPercent}%` }}
            >
              <div className="absolute -top-6 left-3 rounded bg-sky-950/90 px-2 py-1 text-[11px] text-sky-200 shadow-lg">
                {hoveredPlacement.label}
              </div>
            </div>
          ) : null}
          <div className="absolute top-3 right-3 left-3 z-30 rounded border border-sky-700/70 bg-sky-950/85 px-3 py-2 text-xs text-sky-100 shadow-lg backdrop-blur-sm">
            <div className="font-semibold tracking-tight text-sky-300">Placering aktiv</div>
            <div className="mt-1">
              Klicka i previewn för att placera{" "}
              <span className="font-medium text-white">{pendingPlacementItem?.title || "det valda elementet"}</span>.
            </div>
            {pendingPlacementItem?.description ? (
              <div className="mt-1 text-sky-200/85">{pendingPlacementItem.description}</div>
            ) : null}
            <div className="mt-1 text-[11px] text-sky-200/80">
              {elementMapLoading
                ? "Laddar elementkarta för exakt placering..."
                : `Identifierade zoner: ${sectionZonesCount}`}
            </div>
          </div>
        </>
      ) : null}

      {showInspectOverlay ? (
        <>
          <div
            className={cn(
              "absolute inset-0 z-20 cursor-crosshair bg-emerald-950/5",
              isCapturePending && "pointer-events-none",
            )}
            onClick={handleCaptureClick}
            onMouseMove={handleInspectMouseMove}
            onMouseLeave={onInspectMouseLeave}
          />
          {inspectEngine === "map" && hoveredMapElement ? (
            <div
              className="pointer-events-none absolute z-25 border-2 border-violet-400 bg-violet-500/10"
              style={{
                left: `${hoveredMapElement.vpPercent.x}%`,
                top: `${hoveredMapElement.vpPercent.y}%`,
                width: `${hoveredMapElement.vpPercent.w}%`,
                height: `${hoveredMapElement.vpPercent.h}%`,
              }}
            >
              <div className="absolute bottom-full left-0 mb-1 max-w-64 truncate rounded bg-zinc-900/95 px-2 py-1 text-[11px] text-violet-200 shadow-lg">
                &lt;{hoveredMapElement.tag}&gt;
                {hoveredMapElement.text ? ` "${hoveredMapElement.text.slice(0, 40)}"` : ""}
                {hoveredMapElement.className
                  ? ` .${hoveredMapElement.className.split(/\s+/).slice(0, 2).join(".")}`
                  : ""}
              </div>
            </div>
          ) : null}
          {inspectPulse ? (
            <div className="pointer-events-none absolute z-30" style={{ left: inspectPulse.x, top: inspectPulse.y }}>
              <span className="absolute inline-flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-2 border-rose-400 bg-rose-500/30" />
              <span className="absolute inline-flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500 shadow-[0_0_0_2px_rgba(0,0,0,0.35)] ring-2 ring-white/90" />
            </div>
          ) : null}
          <div className="absolute right-0 bottom-0 left-0 z-30 border-t border-emerald-800/60 bg-zinc-950/95 px-4 py-3 text-xs text-gray-300 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold tracking-tight text-emerald-400">Inspektion aktiv</span>
                  <span className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900/80 px-1.5 py-0.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setInspectEngine("playwright")}
                      className={cn(
                        "inline-flex items-center gap-0.5 rounded px-1 py-0.5 transition-colors",
                        inspectEngine === "playwright"
                          ? "bg-emerald-800 text-emerald-200"
                          : "text-zinc-500 hover:text-zinc-300",
                      )}
                      title="Playwright: headless browser (screenshot + DOM)"
                    >
                      <Zap className="h-2.5 w-2.5" />
                      PW
                    </button>
                    <button
                      type="button"
                      onClick={() => setInspectEngine("ai")}
                      className={cn(
                        "inline-flex items-center gap-0.5 rounded px-1 py-0.5 transition-colors",
                        inspectEngine === "ai"
                          ? "bg-purple-800 text-purple-200"
                          : "text-zinc-500 hover:text-zinc-300",
                      )}
                      title="AI: gpt-4o-mini analyserar koden"
                    >
                      <BrainCircuit className="h-2.5 w-2.5" />
                      AI
                    </button>
                    <button
                      type="button"
                      onClick={() => setInspectEngine("map")}
                      className={cn(
                        "inline-flex items-center gap-0.5 rounded px-1 py-0.5 transition-colors",
                        inspectEngine === "map"
                          ? "bg-violet-800 text-violet-200"
                          : "text-zinc-500 hover:text-zinc-300",
                      )}
                      title="Map: forkompilerad elementkarta med hover"
                    >
                      <MousePointer2 className="h-2.5 w-2.5" />
                      Map
                    </button>
                  </span>
                  {inspectEngine === "map" ? (
                    <span className="text-[10px] text-violet-400/70">
                      {elementMapLoading
                        ? "Laddar karta..."
                        : inspectorUnavailable
                          ? "Inspector kräver Playwright eller inspector-worker"
                          : `${elementMapCount} element`}
                    </span>
                  ) : null}
                  {totalAiCostUsd > 0 ? (
                    <span className="text-[10px] text-amber-400/70" title="Total AI-kostnad denna session">
                      session: ${totalAiCostUsd.toFixed(4)}
                      {lastAiCostDisplay ? ` (senaste: ${lastAiCostDisplay})` : ""}
                    </span>
                  ) : null}
                </div>
                <div className="text-zinc-400">
                  {inspectEngine === "map"
                    ? "Hovra för att markera element. Klicka för att välja."
                    : inspectEngine === "ai"
                      ? "Klicka i previewn — AI identifierar elementet i koden."
                      : "Klicka i previewn — Playwright tar screenshot + hittar DOM-element."}
                </div>
                {inspectStatus ? <div className="mt-1 whitespace-pre-line text-zinc-500">{inspectStatus}</div> : null}
              </div>
              <div className="flex items-center gap-2">
                {isCapturePending ? (
                  <div className="rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300">Skapar bild...</div>
                ) : null}
                {lastCodeMatch ? (
                  <button
                    type="button"
                    onClick={onShowLastCodeMatch}
                    className="rounded bg-purple-900/60 px-2 py-1 text-[11px] font-medium text-purple-200 transition-colors hover:bg-purple-800/70 hover:text-white"
                    title={`Visa ${lastCodeMatch.item.filePath}:${lastCodeMatch.item.lineNumber}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      <Code2 className="h-3.5 w-3.5" />
                      Visa i kod
                    </span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleToggleInspect}
                  className="rounded bg-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:text-white"
                  title="Stäng inspektion"
                >
                  <span className="inline-flex items-center gap-1">
                    <X className="h-3.5 w-3.5" />
                    Avsluta
                  </span>
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
