"use client";

import { useState } from "react";
import { LayoutGrid, MessageSquareText, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { PreviewPanelComposerPalette } from "./PreviewPanelComposer";
import { PreviewPanelBrowseGallery } from "./PreviewPanelBrowseGallery";

/**
 * "Lägg till"-ytan — tabbad vänsterkolumn som ersätter den fristående
 * Composer-paletten NÄR flaggan `NEXT_PUBLIC_SAJTMASKIN_ADD_PANEL` är på.
 *
 * Flikar:
 * - **Block**   — dagens 8 Composer-block (drag-and-drop oförändrad).
 * - **Bläddra** — shadcn-registry-galleri (Fas 3, ingen insättning ännu).
 * - **Beskriv** — TOM/disabled platshållare (fylls i senare faser).
 *
 * Flagga av (default) renderar aldrig denna komponent → dagens beteende är
 * byte-för-byte oförändrat (se `PreviewPanel.tsx`-wiringen).
 *
 * Del av plan: `docs/plans/active/2026-07-22-shadcn-registry-beskriv-komposition.md`
 * (Fas 3 — Bläddra).
 */

type AddPanelTab = "block" | "browse" | "describe";

export interface PreviewPanelAddPanelProps {
  disabled?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

const TABS: {
  id: AddPanelTab;
  label: string;
  icon: typeof LayoutGrid;
  /** "Beskriv" är förberedd men ännu inte funktionell → markeras med "snart"-badge. */
  soon?: boolean;
}[] = [
  { id: "block", label: "Block", icon: LayoutGrid },
  { id: "browse", label: "Bläddra", icon: Search },
  { id: "describe", label: "Beskriv", icon: MessageSquareText, soon: true },
];

export function PreviewPanelAddPanel({
  disabled,
  onDragStart,
  onDragEnd,
}: PreviewPanelAddPanelProps) {
  const [activeTab, setActiveTab] = useState<AddPanelTab>("block");

  return (
    <aside
      className="flex w-[280px] shrink-0 flex-col border-r border-violet-900/50 bg-zinc-950/95"
      aria-label="Lägg till"
    >
      <div
        className="flex items-center gap-1 border-b border-violet-900/40 px-2 py-2"
        role="tablist"
        aria-label="Lägg till-flikar"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              title={tab.soon ? "Beskriv-läget kommer snart" : undefined}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition",
                isActive
                  ? "bg-violet-900/45 text-violet-100"
                  : "text-zinc-400 hover:bg-violet-950/40 hover:text-violet-200",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {tab.label}
              {tab.soon ? (
                <span className="rounded-full bg-violet-900/60 px-1 text-[8px] font-semibold tracking-wide text-violet-200/80 uppercase">
                  snart
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {activeTab === "block" ? (
        <PreviewPanelComposerPalette
          embedded
          disabled={disabled}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      ) : activeTab === "browse" ? (
        <PreviewPanelBrowseGallery disabled={disabled} />
      ) : (
        <DescribePlaceholder />
      )}
    </aside>
  );
}

/** Tom/disabled platshållare för "Beskriv"-fliken (fylls i senare faser). */
function DescribePlaceholder() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <MessageSquareText className="h-6 w-6 text-zinc-600" aria-hidden />
      <p className="text-[12px] font-medium text-violet-200/80">Beskriv — kommer snart</p>
      <p className="text-[11px] leading-snug text-zinc-500">
        Här ska du kunna beskriva i fritext vad du vill ha, så hittar en agent bästa matchande
        block och sätter in det åt dig. Ytan förbereds nu och aktiveras i en senare fas.
      </p>
    </div>
  );
}
