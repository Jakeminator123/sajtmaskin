"use client";

import {
  AlertCircle,
  CircleCheck,
  Code2,
  ExternalLink,
  FileText,
  LayoutGrid,
  Redo2,
  RefreshCw,
  Search,
  Undo2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SurfaceDescriptor = {
  label: string;
  detail: string;
  className: string;
  badgeClassName: string;
};

type AlternatePreviewBannerState = {
  livePreviewUrl: string;
};

interface PreviewPanelChromeProps {
  previewUrl: string | null;
  surfaceDescriptor: SurfaceDescriptor;
  isOwnEnginePreview: boolean;
  isTier2LivePreview: boolean;
  livePreviewUrlStored: boolean;
  inspectorEnabled: boolean;
  handleToggleInspect: () => void;
  placementMode: boolean;
  composerMode: boolean;
  handleToggleComposer: () => void;
  composerCanUndo: boolean;
  composerCanRedo: boolean;
  composerHistoryBusy: boolean;
  onComposerUndo: () => void;
  onComposerRedo: () => void;
  inspectMode: boolean;
  handleToggleElementRegistry: () => void;
  canShowCode: boolean;
  isViewSwitchPending: boolean;
  showElementRegistry: boolean;
  handleToggleCode: () => void;
  viewMode: "preview" | "code" | "registry";
  onClear?: (() => void) | null;
  handleClear: () => void;
  isLoading: boolean;
  handleRefresh: () => void;
  handleOpenInNewTab: () => void;
  alternatePreviewBanner: AlternatePreviewBannerState | null;
  onNavigatePreviewUrl?: ((url: string) => void) | null;
  previewBuildError?: { stage: string; message: string } | null;
  previewProdBuild?: { verified: boolean; logSnippet?: string | null } | null;
  isCodeView: boolean;
  previewRoutesLoading: boolean;
  previewRoutes: string[];
  activePreviewRoute: string | null;
  handleNavigateRoute: (route: string) => void;
  showTier2UnifiedStrip: boolean;
  showBlobWarning: boolean;
  showBlobConfigWarning: boolean;
  integrationError: boolean;
  showImagesDisabledWarning: boolean;
  showImagesUnsupportedWarning: boolean;
  showExternalWarning: boolean;
  simplified?: boolean;
}

export function PreviewPanelChrome({
  previewUrl,
  surfaceDescriptor,
  isOwnEnginePreview,
  isTier2LivePreview,
  livePreviewUrlStored,
  inspectorEnabled,
  handleToggleInspect,
  placementMode,
  composerMode,
  handleToggleComposer,
  composerCanUndo,
  composerCanRedo,
  composerHistoryBusy,
  onComposerUndo,
  onComposerRedo,
  inspectMode,
  handleToggleElementRegistry,
  canShowCode,
  isViewSwitchPending,
  showElementRegistry,
  handleToggleCode,
  viewMode,
  onClear,
  handleClear,
  isLoading,
  handleRefresh,
  handleOpenInNewTab,
  alternatePreviewBanner,
  onNavigatePreviewUrl,
  previewBuildError,
  previewProdBuild,
  isCodeView,
  previewRoutesLoading,
  previewRoutes,
  activePreviewRoute,
  handleNavigateRoute,
  showTier2UnifiedStrip,
  showBlobWarning,
  showBlobConfigWarning,
  integrationError,
  showImagesDisabledWarning,
  showImagesUnsupportedWarning,
  showExternalWarning,
  simplified = false,
}: PreviewPanelChromeProps) {
  if (simplified) {
    return null;
  }

  return (
    <div className="max-h-[40%] shrink-0 overflow-y-auto">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold tracking-tight text-white">Preview</h3>
          <Badge variant="outline" className={surfaceDescriptor.badgeClassName}>
            {surfaceDescriptor.label}
          </Badge>
          {isOwnEnginePreview && !livePreviewUrlStored ? (
            <Badge
              variant="outline"
              className="border-amber-500/35 bg-amber-500/10 text-[11px] text-amber-100"
              title="Live-preview med Next.js i tier-2-runtime/VM är inte tillgänglig än — ofta miljö, npm install eller byggfel."
            >
              Live-preview väntar
            </Badge>
          ) : null}
          {previewUrl && isTier2LivePreview && !isOwnEnginePreview ? (
            <Badge
              variant="outline"
              className="border-emerald-500/35 bg-emerald-500/10 text-[11px] text-emerald-100"
              title="Next.js körs i tier-2-preview (VM / legacy preview-kontrakt) — motsvarar lokal utveckling."
            >
              Next.js
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleComposer}
            disabled={!previewUrl || placementMode || inspectMode}
            title={
              placementMode
                ? "Avsluta placering först"
                : inspectMode
                  ? "Stäng inspektionsläget först"
                  : composerMode
                    ? "Stäng Visual Composer"
                    : "Dra sajblock till previewn (startsida)"
            }
            className={cn(
              "text-gray-400 hover:text-white",
              composerMode && "bg-violet-900/45 text-violet-200 hover:text-violet-100",
            )}
          >
            <LayoutGrid className="mr-1 h-4 w-4" />
            Composer
          </Button>
          {composerMode ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={onComposerUndo}
                disabled={
                  !previewUrl ||
                  placementMode ||
                  inspectMode ||
                  composerHistoryBusy ||
                  !composerCanUndo
                }
                title="Ångra senaste direkta patch i Composer"
                className="text-gray-400 hover:text-white"
              >
                <Undo2 className="mr-1 h-4 w-4" />
                Ångra
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onComposerRedo}
                disabled={
                  !previewUrl ||
                  placementMode ||
                  inspectMode ||
                  composerHistoryBusy ||
                  !composerCanRedo
                }
                title="Gör om senast ångrade direkta patch"
                className="text-gray-400 hover:text-white"
              >
                <Redo2 className="mr-1 h-4 w-4" />
                Gör om
              </Button>
            </>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleInspect}
            disabled={!inspectorEnabled || !previewUrl || placementMode || composerMode}
            title={
              !inspectorEnabled
                ? "Inspector är avstängd via feature flag"
                : composerMode
                  ? "Stäng Composer först"
                  : placementMode
                    ? "Placering aktiv - avsluta placering först"
                    : "Markera punkt i preview och skicka till chatten"
            }
            className={cn(
              "text-gray-400 hover:text-white",
              inspectMode && "bg-emerald-900/50 text-emerald-300 hover:text-emerald-200",
            )}
          >
            <Search className="mr-1 h-4 w-4" />
            Inspektera preview
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleElementRegistry}
            disabled={!canShowCode || isViewSwitchPending}
            title={canShowCode ? "Inspektera kod via elementregister" : "Ingen kod tillgänglig än"}
            className={cn(
              "text-gray-400 hover:text-white",
              showElementRegistry && "bg-purple-900/40 text-purple-200 hover:text-purple-100",
            )}
          >
            <Code2 className="mr-1 h-4 w-4" />
            Elementregister
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleCode}
            disabled={!canShowCode || isViewSwitchPending}
            title={canShowCode ? "Visa kod" : "Ingen kod tillgänglig än"}
            className={cn(
              "text-gray-400 hover:text-white",
              viewMode === "code" && "bg-gray-800 text-white hover:text-white",
            )}
          >
            <FileText className="mr-1 h-4 w-4" />
            Kodvy
          </Button>
          {previewUrl && onClear ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={isLoading}
              title="Rensa preview"
              className="text-gray-400 hover:text-white"
            >
              Rensa
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isLoading}
            title="Uppdatera preview"
            aria-label="Uppdatera preview"
            className="text-gray-400 hover:text-white"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenInNewTab}
            title="Öppna i ny flik"
            className="text-gray-400 hover:text-white"
          >
            <ExternalLink className="mr-1 h-4 w-4" />
            Öppna
          </Button>
        </div>
      </div>

      <div className={cn("border-b px-4 py-2 text-xs", surfaceDescriptor.className)}>
        {surfaceDescriptor.detail}
      </div>

      {alternatePreviewBanner && onNavigatePreviewUrl ? (
        <div className="mx-4 mt-2 flex flex-wrap items-center gap-2 rounded-md border border-zinc-700/80 bg-zinc-900/40 px-3 py-2 text-[11px] text-zinc-300">
          <span>Live-preview med Next.js finns också för samma version.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 border-zinc-600 text-xs text-zinc-200 hover:bg-zinc-800"
            onClick={() => onNavigatePreviewUrl(alternatePreviewBanner.livePreviewUrl)}
          >
            Byt till live-preview
          </Button>
        </div>
      ) : null}

      {previewBuildError ? (
        <Alert variant="destructive" className="mx-4 mt-2 border-rose-900/55 bg-rose-950/45 text-rose-50">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="text-sm text-rose-100">
            {previewBuildError.stage === "sandbox_disabled"
              ? "Tier-2-preview inte tillgänglig"
              : `Tier-2 / build: ${previewBuildError.stage}`}
          </AlertTitle>
          <AlertDescription
            className={cn(
              "max-h-36 overflow-y-auto text-[11px] whitespace-pre-wrap text-rose-200/95",
              previewBuildError.stage === "sandbox_disabled" ? "font-medium" : "font-mono",
            )}
          >
            {previewBuildError.message}
          </AlertDescription>
        </Alert>
      ) : null}

      {previewProdBuild && !previewBuildError ? (
        previewProdBuild.verified ? (
          <Alert className="mx-4 mt-2 border-emerald-900/50 bg-emerald-950/35 text-emerald-50">
            <CircleCheck className="h-4 w-4 text-emerald-400" />
            <AlertTitle className="text-sm text-emerald-100">Production build OK</AlertTitle>
            <AlertDescription className="text-[11px] text-emerald-200/90">
              <code className="font-mono">npm run build</code> lyckades i verifierings-VM — separat signal från
              dev-preview (<code className="font-mono">npm run dev</code>).
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="mx-4 mt-2 border-amber-900/50 bg-amber-950/40 text-amber-50">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <AlertTitle className="text-sm text-amber-100">Production build misslyckades</AlertTitle>
            <AlertDescription className="space-y-1 text-[11px] text-amber-200/90">
              <p>Dev-preview kan ändå fungera. Åtgärda build-fel innan deploy — se loggutdrag nedan.</p>
              {previewProdBuild.logSnippet ? (
                <pre className="max-h-36 overflow-y-auto rounded border border-amber-900/40 bg-black/30 p-2 font-mono text-[10px] whitespace-pre-wrap text-amber-100/95">
                  {previewProdBuild.logSnippet}
                </pre>
              ) : null}
            </AlertDescription>
          </Alert>
        )
      ) : null}

      {!isCodeView && (previewRoutesLoading || previewRoutes.length > 0) ? (
        <div className="border-b border-gray-800 bg-black/30 px-4 py-2">
          <div className="mb-1 text-[11px] font-medium text-gray-300">Sidor i skapad preview</div>
          <div className="flex flex-wrap gap-1.5">
            {previewRoutesLoading && previewRoutes.length === 0 ? (
              <span className="text-[11px] text-gray-500">Läser routes från versionens filer...</span>
            ) : (
              previewRoutes.map((route) => (
                <Button
                  key={route}
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-6 border-gray-700 px-2 text-[11px] text-gray-300 hover:bg-gray-800 hover:text-white",
                    activePreviewRoute === route && "border-sky-500/60 bg-sky-500/10 text-sky-200",
                  )}
                  onClick={() => handleNavigateRoute(route)}
                  title={`Visa ${route}`}
                >
                  {route}
                </Button>
              ))
            )}
          </div>
        </div>
      ) : null}

      {showTier2UnifiedStrip ? (
        <div className="border-b border-amber-900/45 bg-amber-950/30 px-4 py-2 text-xs text-amber-100">
          <p className="font-medium text-amber-50">Live-preview (Next.js)</p>
          <p className="mt-1 text-amber-100/90">
            Din genererade kod körs med Next.js i den här miljön. Följande kan fortfarande gälla:
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-amber-100/85">
            {(showBlobWarning || showBlobConfigWarning) ? (
              <li>Bilder och uppladdningar kan saknas om mediastorage inte är aktivt i byggaren.</li>
            ) : null}
            {integrationError ? (
              <li>Integrationsstatus kunde inte läsas — vissa resurser kan saknas i preview.</li>
            ) : null}
            {showImagesDisabledWarning ? (
              <li>AI-bilder är avstängda i chat-inställningarna för den här sessionen.</li>
            ) : null}
            {showImagesUnsupportedWarning ? (
              <li>Bildgenerering är inte tillgänglig med nuvarande konfiguration.</li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {!isCodeView &&
      !isOwnEnginePreview &&
      !isTier2LivePreview &&
      (showBlobWarning ||
        showExternalWarning ||
        integrationError ||
        showImagesDisabledWarning ||
        showImagesUnsupportedWarning ||
        showBlobConfigWarning) ? (
        <div className="border-b border-yellow-900/40 bg-yellow-950/30 px-4 py-2 text-xs text-yellow-200">
          {showExternalWarning ? (
            <div>
              Sajmaskinens preview körs i utvecklingsmilö för snabbhet. Externa media‑URL:er kan ge 404
              eller blockeras. Ladda upp media via mediabiblioteket för publika Blob‑URL:er.
            </div>
          ) : null}
          {showBlobWarning ? (
            <div>
              Mediastorage för uppladdningar saknas. AI-bilder och filer visas inte fullt ut i preview
              förrän det är aktiverat för byggaren.
            </div>
          ) : null}
          {showImagesDisabledWarning ? <div>AI-bilder är avstängda i chat-inställningarna för den här sessionen.</div> : null}
          {showImagesUnsupportedWarning ? (
            <div>Bildgenerering är inte tillgänglig just nu (saknad/ogiltig AI-konfiguration).</div>
          ) : null}
          {showBlobConfigWarning ? (
            <div>
              Mediastorage är inte aktivt. Bilder kan skapas av AI men saknas i preview tills det är
              påslaget.
            </div>
          ) : null}
          {integrationError ? <div>Kunde inte hämta integrationsstatus. Media kan saknas i preview.</div> : null}
        </div>
      ) : null}
    </div>
  );
}
