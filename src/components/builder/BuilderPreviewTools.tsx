"use client";

import { ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BUILDER_DESTRUCTIVE_ICON_CLASS,
  BUILDER_HEADER_ICON_CLASS,
  BUILDER_LIGHT_ICON_CLASS,
} from "@/lib/builder/icon-language";
import { PreviewCodeViewMenu } from "@/components/builder/preview-panel/PreviewCodeViewMenu";
import { PreviewPanelDossiers } from "@/components/builder/preview-panel/PreviewPanelDossiers";
import type { PreviewPanelDossiersProps } from "@/components/builder/preview-panel/dossiers/dossiers-shared";
import {
  PreviewPanelF3Trigger,
  type PreviewPanelF3TriggerProps,
} from "@/components/builder/preview-panel/PreviewPanelF3Trigger";
import type { PreviewSurfaceState } from "@/components/builder/preview-panel/usePreviewSurfaceMode";

export interface BuilderPreviewToolsProps {
  surface: PreviewSurfaceState;
  chatId: string | null;
  versionId: string | null;
  previewUrl: string | null;
  lifecycleStage?: "design" | "integrations" | null;
  /** Buildern kör redan något (stream, chattskapande, prompt-prep). */
  isBusy?: boolean;
  onClear?: (() => void) | null;
  /** Rensa är blockerad medan previewn laddar om. */
  clearDisabled?: boolean;
  onRequestDossier?: (payload: { id: string; label: string }) => void;
  catalogPickDisabled?: boolean;
  onF3Ready?: PreviewPanelF3TriggerProps["onReady"];
  onF3MissingEnv?: PreviewPanelF3TriggerProps["onMissingEnv"];
  onF3ReleaseSettled?: PreviewPanelF3TriggerProps["onReleaseSettled"];
  onF3Status?: PreviewPanelF3TriggerProps["onStatus"];
  /** Ö4a: readiness-buren väg för "Bygg integrationer" (kostnads-tooltip). */
  f3RequiresRealBuildKeys?: PreviewPanelF3TriggerProps["requiresRealBuildKeys"];
  /**
   * Lucka 3 (ägarbeslut 2026-08-11): Byggblock-panelens senaste counts,
   * vävda vidare till F3-statusradens framgångstitel via shell-lagret —
   * ingen andra hämtning av `/dossiers`.
   */
  onDossierCountsChange?: PreviewPanelDossiersProps["onCountsChange"];
  /** Lucka 2 (ägarbeslut 2026-08-11): buren av versionslistan, ingen ny signal. */
  activeVersionMeta?: PreviewPanelDossiersProps["activeVersionMeta"];
  /** Lucka 3: samma counts vidarebefordrade till F3-triggerns framgångstitel. */
  f3BuiltCounts?: PreviewPanelF3TriggerProps["builtCounts"];
}

/**
 * Previewens verktyg i headern (`Kod`, `Byggblock`, `Bygg integrationer`,
 * `Rensa`, `Öppna`). Klustret ersätter previewpanelens gamla verktygsrad —
 * varje popover/meny flyttade med sin egen trigger hit.
 */
export function BuilderPreviewTools({
  surface,
  chatId,
  versionId,
  previewUrl,
  lifecycleStage = null,
  isBusy = false,
  onClear,
  clearDisabled = false,
  onRequestDossier,
  catalogPickDisabled = false,
  onF3Ready,
  onF3MissingEnv,
  onF3ReleaseSettled,
  onF3Status,
  f3RequiresRealBuildKeys = null,
  onDossierCountsChange,
  activeVersionMeta,
  f3BuiltCounts = null,
}: BuilderPreviewToolsProps) {
  // Klustret växer inte fram i headern förrän det finns en preview att styra.
  // Kodvyn räknas också: där är previewUrl inte det som visas, men användaren
  // måste kunna ta sig tillbaka.
  const hasSurface = Boolean(previewUrl) || surface.viewMode !== "preview";
  if (!hasSurface) return null;

  const showF3Trigger =
    typeof chatId === "string" && chatId.length > 0 && lifecycleStage !== "integrations";

  return (
    <div
      className="border-border flex items-center gap-0.5 rounded-md border px-1 py-0.5"
      aria-label="Previewverktyg"
    >
      <PreviewCodeViewMenu
        viewMode={surface.viewMode}
        canShowCode={surface.canShowCode}
        isViewSwitchPending={surface.isViewSwitchPending}
        onToggleCode={surface.toggleCodeView}
        onToggleElementRegistry={surface.toggleElementRegistry}
        iconOnly
      />
      {chatId ? (
        <PreviewPanelDossiers
          chatId={chatId}
          versionId={versionId}
          lifecycleStage={lifecycleStage}
          onRequestDossier={onRequestDossier}
          catalogPickDisabled={catalogPickDisabled}
          onCountsChange={onDossierCountsChange}
          activeVersionMeta={activeVersionMeta}
          className="text-muted-foreground hover:text-foreground h-8 px-1.5 text-[12px]"
        />
      ) : null}
      {showF3Trigger ? (
        <PreviewPanelF3Trigger
          chatId={chatId as string}
          versionId={versionId}
          onMissingEnv={onF3MissingEnv}
          onStatus={onF3Status}
          onReady={onF3Ready}
          onReleaseSettled={onF3ReleaseSettled}
          isBusy={isBusy}
          requiresRealBuildKeys={f3RequiresRealBuildKeys}
          builtCounts={f3BuiltCounts}
          iconOnly
          className="h-8 w-8 bg-violet-600 p-0 text-white hover:bg-violet-500"
        />
      ) : null}
      {previewUrl && onClear ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={clearDisabled}
          aria-label="Rensa preview"
          title="Rensa preview — river preview-sessionen på förhandsvisnings-VM:en direkt (den städas annars inte förrän sessionen går ut)."
          className={cn(BUILDER_HEADER_ICON_CLASS, BUILDER_DESTRUCTIVE_ICON_CLASS)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (previewUrl) window.open(previewUrl, "_blank", "noopener,noreferrer");
        }}
        disabled={!previewUrl}
        aria-label="Öppna i ny flik"
        title="Öppna i ny flik"
        className={cn(BUILDER_HEADER_ICON_CLASS, BUILDER_LIGHT_ICON_CLASS)}
      >
        <ExternalLink className="h-4 w-4" />
      </Button>
    </div>
  );
}
