"use client";

import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { LayoutGrid, MessageSquareText, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isShadcnDescribeEnabled } from "@/lib/shadcn/describe-feature";
import type { ShadcnInsertHandler, ShadcnPlacementPicker } from "@/lib/builder/shadcn-insert";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PreviewPanelFeaturedBlocks } from "./PreviewPanelFeaturedBlocks";
import { PreviewPanelBrowseGallery } from "./PreviewPanelBrowseGallery";
import { PreviewPanelDescribeTab } from "./PreviewPanelDescribeTab";

/**
 * "Lägg till"-ytan — tabbad vänsterkolumn som ersätter den fristående
 * Composer-paletten NÄR flaggan `NEXT_PUBLIC_SAJTMASKIN_ADD_PANEL` är på.
 *
 * Flikar:
 * - **Block**   — kuraterade @shadcnblocks-snabbval (own-engine-insättning).
 * - **Bläddra** — teaser i asiden + overlay-galleri (shadcn/ui + Marknadsblock);
 *   kortval → stäng overlay → `onPickPlacement` → `onInsertShadcnItem`
 *   (own-engine-lane v1, se `shadcn-insert.ts`). Galleriet ritas aldrig i
 *   den 280 px smala asiden — kategorichips + rutnät kräver overlay-ytan.
 * - **Beskriv** — fritext → `/api/shadcn/describe` → rankade kandidatkort →
 *   välj → samma insättnings-lane. Kräver även
 *   `NEXT_PUBLIC_SAJTMASKIN_SHADCN_DESCRIBE` (annars "kommer snart"-platshållare).
 *
 * Flagga av (default) renderar aldrig denna komponent → dagens beteende är
 * byte-för-byte oförändrat (se `PreviewPanel.tsx`-wiringen). De 8 lokala
 * JSX-snippetsen i `page-blocks-catalog.ts` lever kvar för den fristående
 * paletten när flaggan är av.
 *
 * Del av plan: `docs/plans/avklarat/2026-07-22-shadcn-registry-beskriv-komposition.md`
 * (Fas 2 v1 + Fas 3). Block/Marknadsblock levererat i #994 (`72abd4b53`).
 */

type AddPanelTab = "block" | "browse" | "describe";

interface PreviewPanelAddPanelProps {
  disabled?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /**
   * Insättnings-lane v1: valt registry-kort (Bläddra eller Beskriv) skickas
   * som välformat prompt-meddelande genom befintliga sendMessage/own-engine-
   * vägen. Saknas callbacken är insättningsknapparna disabled (read-only-läge).
   */
  onInsertShadcnItem?: ShadcnInsertHandler;
  /** Klick-väg: befintligt placeringsläge innan insättning (Esc → avbryt). */
  onPickPlacement?: ShadcnPlacementPicker;
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
  onPickPlacement,
}: PreviewPanelAddPanelProps) {
  const [activeTab, setActiveTab] = useState<AddPanelTab>("block");
  const [browseOpen, setBrowseOpen] = useState(false);
  // Beskriv-fliken kräver describe-flaggan. Läs EFTER mount (initial false)
  // för att undvika SSR/CSR-hydratmismatch — samma mönster som add-panel-
  // flaggan i PreviewPanel.tsx (NEXT_PUBLIC-flaggor läses aldrig direkt i render).
  const [describeEnabled, setDescribeEnabled] = useState(false);

  const closeBrowseOverlay = useCallback(() => {
    flushSync(() => setBrowseOpen(false));
  }, []);

  const handleSelectTab = useCallback((tab: AddPanelTab) => {
    setActiveTab(tab);
    if (tab !== "browse") setBrowseOpen(false);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- engångs mount-läsning av NEXT_PUBLIC-flaggan (SSR/CSR-hydratmönstret), ingen kaskad
    setDescribeEnabled(isShadcnDescribeEnabled());
  }, []);

  return (
    <aside
      className="flex w-[280px] shrink-0 flex-col border-r border-violet-900/50 bg-zinc-950/95"
      aria-label="Lägg till"
    >
      <div className="border-b border-violet-900/40 px-3 py-2">
        <p className="text-[11px] font-medium text-violet-100">Lägg till i sajten</p>
        <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">
          Dra till previewn för placering, eller klicka och välj var det ska sitta.
        </p>
      </div>
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
              onClick={() => handleSelectTab(tab.id)}
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
        <PreviewPanelFeaturedBlocks
          disabled={disabled}
          onInsertItem={onInsertShadcnItem}
          onPickPlacement={onPickPlacement}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      ) : activeTab === "browse" ? (
        <BrowseTeaser disabled={disabled} onOpen={() => setBrowseOpen(true)} />
      ) : describeEnabled ? (
        <PreviewPanelDescribeTab
          disabled={disabled}
          onInsertItem={onInsertShadcnItem}
          onPickPlacement={onPickPlacement}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      ) : (
        <DescribePlaceholder />
      )}

      <Dialog open={browseOpen} onOpenChange={setBrowseOpen}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[80vh] max-h-[80vh] w-full max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
        >
          <DialogHeader className="shrink-0 space-y-1 border-b border-violet-900/40 px-4 py-3 pr-12 text-left">
            <DialogTitle className="text-sm text-violet-100">Bläddra bland block</DialogTitle>
            <DialogDescription className="text-[11px] text-zinc-500">
              Sök, filtrera och lägg till shadcn/ui eller Marknadsblock i sajten.
            </DialogDescription>
          </DialogHeader>
          <DialogClose className="absolute top-3.5 right-3 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden">
            <X className="h-4 w-4" aria-hidden />
            <span className="sr-only">Stäng</span>
          </DialogClose>
          <PreviewPanelBrowseGallery
            disabled={disabled}
            onInsertItem={onInsertShadcnItem}
            onPickPlacement={onPickPlacement}
            onCloseBeforeInsert={closeBrowseOverlay}
          />
        </DialogContent>
      </Dialog>
    </aside>
  );
}

/** Kort aside-yta — hela galleriet lever i overlayn, inte i 280 px. */
function BrowseTeaser({
  disabled,
  onOpen,
}: {
  disabled?: boolean;
  onOpen: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <Search className="h-6 w-6 text-zinc-600" aria-hidden />
      <p className="text-[12px] font-medium text-violet-200/80">Bläddra bland block</p>
      <p className="text-[11px] leading-snug text-zinc-500">
        shadcn/ui och Marknadsblock öppnas i ett större fönster så kategorier och resultat ryms
        på skärmen.
      </p>
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className="rounded-md border border-violet-800/60 bg-violet-950/30 px-3 py-1.5 text-[11px] font-medium text-violet-200 transition hover:bg-violet-900/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Öppna galleri
      </button>
    </div>
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
