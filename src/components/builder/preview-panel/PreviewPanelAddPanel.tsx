"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, MessageSquareText, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { isShadcnDescribeEnabled } from "@/lib/shadcn/describe-feature";
import type { ShadcnInsertSelection } from "@/lib/builder/shadcn-insert";
import { PreviewPanelComposerPalette } from "./PreviewPanelComposer";
import { PreviewPanelBrowseGallery } from "./PreviewPanelBrowseGallery";
import { PreviewPanelDescribeTab } from "./PreviewPanelDescribeTab";

/**
 * "Lägg till"-ytan — tabbad vänsterkolumn som ersätter den fristående
 * Composer-paletten NÄR flaggan `NEXT_PUBLIC_SAJTMASKIN_ADD_PANEL` är på.
 *
 * Flikar:
 * - **Block**   — dagens 8 Composer-block (drag-and-drop oförändrad).
 * - **Bläddra** — shadcn-registry-galleri; kortval → insättning via
 *   `onInsertShadcnItem` (own-engine-lane v1, se `shadcn-insert.ts`).
 * - **Beskriv** — fritext → `/api/shadcn/describe` → rankade kandidatkort →
 *   välj → samma insättnings-lane. Kräver även
 *   `NEXT_PUBLIC_SAJTMASKIN_SHADCN_DESCRIBE` (annars "kommer snart"-platshållare).
 *
 * Flagga av (default) renderar aldrig denna komponent → dagens beteende är
 * byte-för-byte oförändrat (se `PreviewPanel.tsx`-wiringen).
 *
 * Del av plan: `docs/plans/avklarat/2026-07-22-shadcn-registry-beskriv-komposition.md`
 * (Fas 2 v1 + Fas 3).
 */

type AddPanelTab = "block" | "browse" | "describe";

export interface PreviewPanelAddPanelProps {
  disabled?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /**
   * Insättnings-lane v1: valt registry-kort (Bläddra eller Beskriv) skickas
   * som välformat prompt-meddelande genom befintliga sendMessage/own-engine-
   * vägen. Saknas callbacken är insättningsknapparna disabled (read-only-läge).
   */
  onInsertShadcnItem?: (selection: ShadcnInsertSelection) => void | Promise<void>;
}

const TABS: {
  id: AddPanelTab;
  label: string;
  icon: typeof LayoutGrid;
}[] = [
  { id: "block", label: "Block", icon: LayoutGrid },
  { id: "browse", label: "Bläddra", icon: Search },
  { id: "describe", label: "Beskriv", icon: MessageSquareText },
];

export function PreviewPanelAddPanel({
  disabled,
  onDragStart,
  onDragEnd,
  onInsertShadcnItem,
}: PreviewPanelAddPanelProps) {
  const [activeTab, setActiveTab] = useState<AddPanelTab>("block");
  // Beskriv-fliken kräver describe-flaggan. Läs EFTER mount (initial false)
  // för att undvika SSR/CSR-hydratmismatch — samma mönster som add-panel-
  // flaggan i PreviewPanel.tsx (NEXT_PUBLIC-flaggor läses aldrig direkt i render).
  const [describeEnabled, setDescribeEnabled] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- engångs mount-läsning av NEXT_PUBLIC-flaggan (SSR/CSR-hydratmönstret), ingen kaskad
    setDescribeEnabled(isShadcnDescribeEnabled());
  }, []);

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
          const soon = tab.id === "describe" && !describeEnabled;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              title={soon ? "Beskriv-läget kommer snart" : undefined}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition",
                isActive
                  ? "bg-violet-900/45 text-violet-100"
                  : "text-zinc-400 hover:bg-violet-950/40 hover:text-violet-200",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {tab.label}
              {soon ? (
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
        <PreviewPanelBrowseGallery disabled={disabled} onInsertItem={onInsertShadcnItem} />
      ) : describeEnabled ? (
        <PreviewPanelDescribeTab disabled={disabled} onInsertItem={onInsertShadcnItem} />
      ) : (
        <DescribePlaceholder />
      )}
    </aside>
  );
}

/** Platshållare när `NEXT_PUBLIC_SAJTMASKIN_SHADCN_DESCRIBE` är av. */
function DescribePlaceholder() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <MessageSquareText className="h-6 w-6 text-zinc-600" aria-hidden />
      <p className="text-[12px] font-medium text-violet-200/80">Beskriv — kommer snart</p>
      <p className="text-[11px] leading-snug text-zinc-500">
        Här ska du kunna beskriva i fritext vad du vill ha, så hittar en agent bästa matchande
        block och sätter in det åt dig. Ytan är inte aktiverad i den här miljön ännu.
      </p>
    </div>
  );
}
