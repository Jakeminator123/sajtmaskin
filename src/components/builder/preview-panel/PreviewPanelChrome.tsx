"use client";

import { useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  CircleCheck,
  Code2,
  ExternalLink,
  FileText,
  LayoutGrid,
  Monitor,
  Pencil,
  PlusCircle,
  Redo2,
  RefreshCw,
  Search,
  Smartphone,
  Tablet,
  Undo2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PreviewPanelF3Trigger } from "./PreviewPanelF3Trigger";
import { cn } from "@/lib/utils";

type SurfaceDescriptor = {
  label: string;
  detail: string;
  className: string;
  badgeClassName: string;
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
  previewBuildError?: { stage: string; message: string } | null;
  previewProdBuild?: { verified: boolean; logSnippet?: string | null } | null;
  isCodeView: boolean;
  previewRoutesLoading: boolean;
  previewRoutes: string[];
  activePreviewRoute: string | null;
  handleNavigateRoute: (route: string) => void;
  /** Optional: device toggle UI (desktop/tablet/mobile) inside chrome. */
  previewDevice?: "desktop" | "tablet" | "mobile";
  onPreviewDeviceChange?: (mode: "desktop" | "tablet" | "mobile") => void;
  /** Shell routes that trigger a one-click build from chrome affordance. */
  shellRoutePaths?: string[];
  onRequestBuildOutRoute?: (route: string) => void;
  /** Apple-minimal chrome: hide power-user controls. */
  simplified?: boolean;
  /** Inline edit toggle (composer-like). */
  inlineEditMode?: boolean;
  handleToggleInlineEdit?: () => void;
  /** Suggestion-click handler for quick prompts from chrome. */
  onSuggestionClick?: (prompt: string) => void;
  showTier2UnifiedStrip?: boolean;
  showBlobWarning: boolean;
  showBlobConfigWarning: boolean;
  integrationError: boolean;
  showImagesDisabledWarning: boolean;
  showImagesUnsupportedWarning: boolean;
  showExternalWarning: boolean;
  /**
   * Antal filer i aktiv version vars uppdatering avvisades av
   * shrink-guarden under finalize. Visas som en varnings-chip i
   * preview-chromet så användaren förstår varför vissa sidor
   * fortfarande visar scaffold-innehåll.
   */
  rejectedShrinkCount?: number;
  /** F3 trigger context — undefined props hide the button. */
  chatId?: string | null;
  versionId?: string | null;
  lifecycleStage?: "design" | "integrations" | null;
  onF3MissingEnv?: (payload: {
    parentVersionId: string;
    missingByIntegration: Array<{ key: string; name: string; missing: string[] }>;
  }) => void;
  /**
   * Whether the builder shell is busy (creating chat, streaming a previous
   * generation, loading a template, preparing a prompt). Forwarded to the
   * F3 trigger so a second click cannot race the first one.
   */
  isBusy?: boolean;
  onF3Ready?: (payload: {
    parentVersionId: string;
    requirements: Array<{
      key: string;
      name: string;
      requiredRealEnvKeys: string[];
    }>;
  }) => void;
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
  rejectedShrinkCount = 0,
  chatId,
  versionId,
  lifecycleStage,
  isBusy = false,
  onF3MissingEnv,
  onF3Ready,
  previewDevice,
  onPreviewDeviceChange,
  shellRoutePaths,
  onRequestBuildOutRoute,
  simplified = false,
  inlineEditMode = false,
  handleToggleInlineEdit,
  onSuggestionClick: _onSuggestionClick,
}: PreviewPanelChromeProps) {
  const shellPaths = new Set(shellRoutePaths ?? []);
  const isShellRoute = (route: string) => shellPaths.has(route);
  const [routesExpanded, setRoutesExpanded] = useState(false);
  const deviceOptions: Array<{
    key: "desktop" | "tablet" | "mobile";
    label: string;
    Icon: typeof Monitor;
  }> = [
    { key: "desktop", label: "Desktop", Icon: Monitor },
    { key: "tablet", label: "Tablet", Icon: Tablet },
    { key: "mobile", label: "Mobil", Icon: Smartphone },
  ];
  const showF3Trigger =
    typeof chatId === "string" &&
    chatId.length > 0 &&
    lifecycleStage !== "integrations";
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
              className="border-[hsl(var(--status-warning)/0.35)] bg-[hsl(var(--status-warning)/0.1)] text-[11px] text-[hsl(var(--status-warning))]"
              title="Live-preview med Next.js i tier-2-runtime/VM är inte tillgänglig än — ofta miljö, npm install eller byggfel."
            >
              Live-preview väntar
            </Badge>
          ) : null}
          {previewUrl && isTier2LivePreview && !isOwnEnginePreview ? (
            <Badge
              variant="outline"
              className="border-primary/35 bg-primary/10 text-[11px] text-foreground"
              title="Next.js körs i tier-2-preview (VM / legacy preview-kontrakt) — motsvarar lokal utveckling."
            >
              Next.js
            </Badge>
          ) : null}
          {rejectedShrinkCount > 0 ? (
            <Badge
              variant="outline"
              className="border-[hsl(var(--status-warning)/0.35)] bg-[hsl(var(--status-warning)/0.1)] text-[11px] text-[hsl(var(--status-warning))]"
              title="Finalize avvisade en eller flera filuppdateringar eftersom den nya versionen var drastiskt mindre än scaffold. Dessa sidor visar fortfarande scaffold-innehållet — kör genereringen igen för att få fullständigt innehåll."
            >
              Fallback-innehåll ({rejectedShrinkCount})
            </Badge>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {showF3Trigger ? (
            <PreviewPanelF3Trigger
              chatId={chatId as string}
              versionId={versionId ?? null}
              onMissingEnv={onF3MissingEnv}
              onReady={onF3Ready}
              isBusy={isBusy}
              className="h-7 bg-primary px-2 text-[12px] text-primary-foreground hover:bg-primary/90"
            />
          ) : null}
          {handleToggleInlineEdit ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleInlineEdit}
              disabled={!previewUrl || placementMode || composerMode || inspectMode}
              title={
                inlineEditMode
                  ? "Stäng inline-redigering"
                  : "Klicka i previewn för att redigera direkt"
              }
              className={cn(
                "text-gray-400 hover:text-white",
                inlineEditMode && "bg-amber-900/40 text-amber-200 hover:text-amber-100",
              )}
            >
              <Pencil className="mr-1 h-4 w-4" />
              Inline
            </Button>
          ) : null}
          {!simplified ? (
            <>
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
            </>
          ) : null}
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
        <div className="border-b border-border/60 bg-card/40 px-4 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setRoutesExpanded((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-sm text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-expanded={routesExpanded}
            >
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform",
                  routesExpanded ? "rotate-0" : "-rotate-90",
                )}
              />
              <span>Sidor</span>
              {previewRoutes.length > 0 ? (
                <span className="tabular-nums text-muted-foreground/70">
                  {previewRoutes.length}
                </span>
              ) : null}
            </button>
            {previewDevice && onPreviewDeviceChange ? (
              <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-background/60 p-0.5">
                {deviceOptions.map(({ key, label, Icon }) => (
                  <Button
                    key={key}
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onPreviewDeviceChange(key)}
                    title={label}
                    aria-label={label}
                    aria-pressed={previewDevice === key}
                    className={cn(
                      "h-6 w-6 rounded-sm p-0 text-muted-foreground hover:text-foreground",
                      previewDevice === key && "bg-muted text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
          {routesExpanded ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {previewRoutesLoading && previewRoutes.length === 0 ? (
                <span className="text-[11px] text-muted-foreground">Läser routes…</span>
              ) : (
                previewRoutes.map((route) => {
                  const shell = isShellRoute(route);
                  const active = activePreviewRoute === route;
                  return (
                    <span key={route} className="inline-flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-6 border-border/60 bg-background/60 px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground",
                          active && "border-primary/50 bg-primary/10 text-foreground",
                          shell && !active && "border-dashed",
                        )}
                        onClick={() => handleNavigateRoute(route)}
                        title={
                          shell
                            ? `${route} — shellsida, kan byggas ut`
                            : `Visa ${route}`
                        }
                      >
                        {route}
                      </Button>
                      {shell && onRequestBuildOutRoute ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => onRequestBuildOutRoute(route)}
                          title={`Bygg ut ${route}`}
                          aria-label={`Bygg ut ${route}`}
                          className="h-6 w-6 p-0 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <PlusCircle className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </span>
                  );
                })
              )}
            </div>
          ) : null}
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
