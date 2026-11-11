"use client";

import { ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  BUILDER_DESTRUCTIVE_ICON_CLASS,
  BUILDER_HEADER_ICON_CLASS,
  BUILDER_LIGHT_ICON_CLASS,
} from "@/lib/builder/icon-language";
import { PreviewCodeViewMenu } from "@/components/builder/preview-panel/code/PreviewCodeViewMenu";
import { PreviewPanelDossiers } from "@/components/builder/preview-panel/PreviewPanelDossiers";
import type { PreviewPanelDossiersProps } from "@/components/builder/preview-panel/dossiers/dossiers-shared";
import {
  PreviewPanelF3Trigger,
  type PreviewPanelF3TriggerProps,
} from "@/components/builder/preview-panel/PreviewPanelF3Trigger";
import type { PreviewSurfaceState } from "@/components/builder/preview-panel/usePreviewSurfaceMode";

interface BuilderPreviewToolsProps {
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
  onRequestDossier?: PreviewPanelDossiersProps["onRequestDossier"];
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
   * ingen andra hämtning av `/dossiers`. Konsumeras av `use-f3-tips-chrome.ts`
   * direkt (inte av `PreviewPanelF3Trigger` — Bugbot, 5:e passet på denna
   * diff: triggern har bara tillgång till FÖRÄLDERVERSIONENS counts, aldrig
   * den nya F3-versionens som framgångstiteln faktiskt beskriver).
   */
  onDossierCountsChange?: PreviewPanelDossiersProps["onCountsChange"];
  /** Lucka 2 (ägarbeslut 2026-08-11): buren av versionslistan, ingen ny signal. */
  activeVersionMeta?: PreviewPanelDossiersProps["activeVersionMeta"];
}

/**
 * Previewens verktyg i headern (`Kod`, `Byggblock`, `Bygg integrationer`,
 * `Stäng förhandsvisningen`, `Öppna`). Klustret ersätter previewpanelens gamla verktygsrad —
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
}: BuilderPreviewToolsProps) {
  // Sparad kod kan öppnas även utan en aktiv preview-session. Behåll också
  // kontrollerna i kod-/registervyn så att användaren kan ta sig tillbaka.
  const hasSurface =
    Boolean(previewUrl) || surface.canShowCode || surface.viewMode !== "preview";
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
          iconOnly
          className="h-8 w-8 bg-violet-600 p-0 text-white hover:bg-violet-500"
        />
      ) : null}
      {previewUrl && onClear ? (
        // Ett klick rev sessionen och (SM-080) gästmaskinen, så nästa visning
        // blev en kallstart; riggen 2026-11-11 klickade fel på den. Nu frågar
        // den först.
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={clearDisabled}
              aria-label="Stäng förhandsvisningen"
              title="Stäng förhandsvisningen och frigör maskinen bakom den"
              className={cn(BUILDER_HEADER_ICON_CLASS, BUILDER_DESTRUCTIVE_ICON_CLASS)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Stäng förhandsvisningen?</AlertDialogTitle>
              <AlertDialogDescription>
                Sajten och alla versioner är sparade. Förhandsvisningen stängs och maskinen
                bakom den frigörs. Nästa gång du öppnar den startar den om, och det kan ta
                upp till en minut.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Avbryt</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onClear}>
                Stäng förhandsvisningen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
