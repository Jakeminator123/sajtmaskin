"use client";

import {
  AlertCircle,
  CircleCheck,
  Code2,
  ExternalLink,
  FileText,
  ImageIcon,
  Info,
  LayoutGrid,
  Monitor,
  MousePointerClick,
  Palette,
  Plus,
  Redo2,
  RefreshCw,
  Search,
  Smartphone,
  Sparkles,
  Tablet,
  Type,
  Undo2,
  Wrench,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

function formatUrlForBar(raw: string): string {
  try {
    const u = new URL(raw, typeof window !== "undefined" ? window.location.origin : "https://local.invalid");
    const path = `${u.pathname}${u.search}${u.hash}`;
    return path.length > 0 ? path : u.hostname ? u.href : raw;
  } catch {
    return raw;
  }
}

function normalizeRoutePath(route: string): string {
  if (!route || route === "/") return "/";
  return route.replace(/\/$/, "") || "/";
}

function routesEqual(active: string | null, candidate: string): boolean {
  if (active == null) return false;
  return normalizeRoutePath(active) === normalizeRoutePath(candidate);
}

export interface PreviewPanelChromeProps {
  previewUrl: string | null;
  previewDevice?: "desktop" | "tablet" | "mobile";
  onPreviewDeviceChange?: (mode: "desktop" | "tablet" | "mobile") => void;
  previewRoutes?: string[];
  previewRoutesLoading?: boolean;
  activePreviewRoute?: string | null;
  onNavigateRoute?: (route: string) => void;
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
  showBlobWarning: boolean;
  showBlobConfigWarning: boolean;
  integrationError: boolean;
  showImagesDisabledWarning: boolean;
  showImagesUnsupportedWarning: boolean;
  showExternalWarning: boolean;
  simplified?: boolean;
  inlineEditMode?: boolean;
  handleToggleInlineEdit?: () => void;
  onSuggestionClick?: (prompt: string) => void;
}

export function PreviewPanelChrome({
  previewUrl,
  previewDevice = "desktop",
  onPreviewDeviceChange,
  previewRoutes = [],
  previewRoutesLoading = false,
  activePreviewRoute = null,
  onNavigateRoute,
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
  showBlobWarning,
  showBlobConfigWarning,
  integrationError,
  showImagesDisabledWarning,
  showImagesUnsupportedWarning,
  showExternalWarning,
  simplified: _simplified,
  inlineEditMode = false,
  handleToggleInlineEdit,
  onSuggestionClick,
}: PreviewPanelChromeProps) {
  const showPreviewToolbar = Boolean(previewUrl) && !isCodeView;
  const urlBar = previewUrl ? formatUrlForBar(previewUrl) : "";

  return (
    <div className="max-h-[38vh] shrink-0 overflow-y-auto border-b border-border bg-background/95 backdrop-blur-sm">
      {showPreviewToolbar ? (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" className="max-w-xs space-y-1 text-xs">
                <p className={cn("font-medium", surfaceDescriptor.badgeClassName)}>{surfaceDescriptor.label}</p>
                {surfaceDescriptor.detail && (
                  <p className="text-muted-foreground">{surfaceDescriptor.detail}</p>
                )}
                {isOwnEnginePreview && !livePreviewUrlStored && (
                  <p className="text-muted-foreground">Live-preview väntar — ofta miljö, npm install eller byggfel.</p>
                )}
                {previewUrl && isTier2LivePreview && !isOwnEnginePreview && (
                  <p className="text-muted-foreground">Next.js tier-2-preview (VM) — motsvarar lokal utveckling.</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div
            className="flex shrink-0 items-center rounded-lg border border-border bg-muted/30 p-0.5"
            role="group"
            aria-label="Viewport"
          >
            <Button
              type="button"
              variant={previewDevice === "desktop" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7 rounded-md"
              onClick={() => onPreviewDeviceChange?.("desktop")}
              title="Dator"
              aria-label="Dator"
              aria-pressed={previewDevice === "desktop"}
            >
              <Monitor className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant={previewDevice === "tablet" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7 rounded-md"
              onClick={() => onPreviewDeviceChange?.("tablet")}
              title="Surfplatta"
              aria-label="Surfplatta"
              aria-pressed={previewDevice === "tablet"}
            >
              <Tablet className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant={previewDevice === "mobile" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7 rounded-md"
              onClick={() => onPreviewDeviceChange?.("mobile")}
              title="Mobil"
              aria-label="Mobil"
              aria-pressed={previewDevice === "mobile"}
            >
              <Smartphone className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div
            className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted/20 px-2 py-1.5 font-mono text-[11px] text-muted-foreground"
            title={previewUrl ?? undefined}
          >
            {urlBar}
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isLoading || !previewUrl}
            title="Uppdatera"
            aria-label="Uppdatera preview"
            className="h-7 w-7 shrink-0 rounded-lg"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "motion-safe:animate-spin")} />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleOpenInNewTab}
            disabled={!previewUrl}
            title="Öppna i ny flik"
            aria-label="Öppna i ny flik"
            className="h-7 w-7 shrink-0 rounded-lg"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" className="max-w-xs space-y-1 text-xs">
                <p className={cn("font-medium", surfaceDescriptor.badgeClassName)}>{surfaceDescriptor.label}</p>
                {surfaceDescriptor.detail && (
                  <p className="text-muted-foreground">{surfaceDescriptor.detail}</p>
                )}
                {previewUrl && isOwnEnginePreview && !livePreviewUrlStored && (
                  <p className="text-muted-foreground">Live-preview väntar — ofta miljö, npm install eller byggfel.</p>
                )}
                {previewUrl && isTier2LivePreview && !isOwnEnginePreview && (
                  <p className="text-muted-foreground">Next.js tier-2-preview (VM) — motsvarar lokal utveckling.</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="truncate text-[11px] text-muted-foreground">{surfaceDescriptor.label}</span>
        </div>
      )}

      {showPreviewToolbar && onNavigateRoute ? (
        <div
          className="flex items-center gap-1 overflow-x-auto border-t border-border/50 px-3 py-1.5 scrollbar-thin"
          role="tablist"
          aria-label="Rutter"
        >
          {previewRoutesLoading ? (
            <div
              className="h-6 w-32 shrink-0 rounded-full bg-muted/70 motion-safe:animate-pulse motion-reduce:animate-none"
              aria-hidden
            />
          ) : previewRoutes.length > 0 ? (
            (() => {
              const MAX_VISIBLE = 5;
              const activeIdx = previewRoutes.findIndex((r) => routesEqual(activePreviewRoute, r));
              const visible = previewRoutes.slice(0, MAX_VISIBLE);
              const overflow = previewRoutes.slice(MAX_VISIBLE);
              // Always show the active route in the visible set
              const activeInOverflow = activeIdx >= MAX_VISIBLE ? previewRoutes[activeIdx] : null;
              return (
                <>
                  {visible.map((route) => {
                    const active = routesEqual(activePreviewRoute, route);
                    return (
                      <button
                        key={route}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onNavigateRoute(route)}
                        className={cn(
                          "shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors duration-150",
                          active
                            ? "bg-primary/15 text-foreground shadow-sm ring-1 ring-primary/20"
                            : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                        )}
                      >
                        {route}
                      </button>
                    );
                  })}
                  {activeInOverflow && (
                    <button
                      key={activeInOverflow}
                      type="button"
                      role="tab"
                      aria-selected
                      onClick={() => onNavigateRoute(activeInOverflow)}
                      className="shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] bg-primary/15 text-foreground shadow-sm ring-1 ring-primary/20 transition-colors duration-150"
                    >
                      {activeInOverflow}
                    </button>
                  )}
                  {overflow.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="shrink-0 rounded-full px-2.5 py-1 font-mono text-[11px] text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors duration-150"
                        >
                          +{overflow.length}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                        {overflow.map((route) => (
                          <DropdownMenuItem
                            key={route}
                            onClick={() => onNavigateRoute(route)}
                            className={cn(
                              "font-mono text-xs",
                              routesEqual(activePreviewRoute, route) && "bg-primary/10 font-medium",
                            )}
                          >
                            {route}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </>
              );
            })()
          ) : activePreviewRoute ? (
            <span className="truncate font-mono text-[11px] text-muted-foreground">{activePreviewRoute}</span>
          ) : (
            <span className="text-[11px] text-muted-foreground">—</span>
          )}
        </div>
      ) : null}

      <div className="flex items-center gap-0.5 border-t border-border/50 bg-muted/15 px-2 py-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 gap-1 rounded-md px-2 text-muted-foreground hover:text-foreground",
                (composerMode || inspectMode || inlineEditMode || showElementRegistry || viewMode === "code") &&
                  "bg-primary/15 text-foreground",
              )}
            >
              <Wrench className="h-3.5 w-3.5 shrink-0" />
              <span className="text-xs">Verktyg</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[10rem]">
            <DropdownMenuItem
              onClick={handleToggleComposer}
              disabled={!previewUrl || placementMode || inspectMode || inlineEditMode}
              className={cn(composerMode && "bg-primary/15 font-medium")}
            >
              <LayoutGrid className="mr-2 h-3.5 w-3.5" />
              Composer
            </DropdownMenuItem>
            {handleToggleInlineEdit ? (
              <DropdownMenuItem
                onClick={handleToggleInlineEdit}
                disabled={!previewUrl || placementMode || composerMode || inspectMode}
                className={cn(inlineEditMode && "bg-primary/15 font-medium")}
              >
                <MousePointerClick className="mr-2 h-3.5 w-3.5" />
                Redigera
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onClick={handleToggleInspect}
              disabled={!inspectorEnabled || !previewUrl || placementMode || composerMode || inlineEditMode}
              className={cn(inspectMode && "bg-primary/15 font-medium")}
            >
              <Search className="mr-2 h-3.5 w-3.5" />
              Inspektera
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleToggleElementRegistry}
              disabled={!canShowCode || isViewSwitchPending}
              className={cn(showElementRegistry && "bg-primary/15 font-medium")}
            >
              <Code2 className="mr-2 h-3.5 w-3.5" />
              Register
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleToggleCode}
              disabled={!canShowCode || isViewSwitchPending}
              className={cn(viewMode === "code" && "bg-muted font-medium")}
            >
              <FileText className="mr-2 h-3.5 w-3.5" />
              Kod
            </DropdownMenuItem>
            {previewUrl && onClear ? (
              <DropdownMenuItem onClick={handleClear} disabled={isLoading}>
                Rensa
              </DropdownMenuItem>
            ) : null}
            {onSuggestionClick ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onSuggestionClick("Lägg till en undersida")}>
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Lägg till en sida
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSuggestionClick("Ändra färgschema")}>
                  <Palette className="mr-2 h-3.5 w-3.5" />
                  Ändra färgschema
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSuggestionClick("Mer innehåll")}>
                  <Type className="mr-2 h-3.5 w-3.5" />
                  Mer innehåll
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSuggestionClick("Byt bilder")}>
                  <ImageIcon className="mr-2 h-3.5 w-3.5" />
                  Byt bilder
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSuggestionClick("Starkare CTA")}>
                  <Sparkles className="mr-2 h-3.5 w-3.5" />
                  Starkare CTA
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        {composerMode ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={onComposerUndo}
              disabled={
                !previewUrl || placementMode || inspectMode || composerHistoryBusy || !composerCanUndo
              }
              title="Ångra"
              className="h-7 gap-1 rounded-md px-2 text-muted-foreground hover:text-foreground"
            >
              <Undo2 className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden md:inline text-xs">Ångra</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onComposerRedo}
              disabled={
                !previewUrl || placementMode || inspectMode || composerHistoryBusy || !composerCanRedo
              }
              title="Gör om"
              className="h-7 gap-1 rounded-md px-2 text-muted-foreground hover:text-foreground"
            >
              <Redo2 className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden md:inline text-xs">Gör om</span>
            </Button>
          </>
        ) : null}
      </div>

      {alternatePreviewBanner && onNavigatePreviewUrl ? (
        <div className="mx-3 mt-1 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          <span>Live-preview finns för samma version.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-lg text-xs"
            onClick={() => onNavigatePreviewUrl(alternatePreviewBanner.livePreviewUrl)}
          >
            Byt till live-preview
          </Button>
        </div>
      ) : null}

      {previewBuildError ? (
        <Alert variant="destructive" className="mx-3 mt-2 rounded-xl border-destructive/40">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="text-sm">
            {previewBuildError.stage === "sandbox_disabled"
              ? "Tier-2-preview inte tillgänglig"
              : `Tier-2 / build: ${previewBuildError.stage}`}
          </AlertTitle>
          <AlertDescription
            className={cn(
              "max-h-36 overflow-y-auto text-[11px] whitespace-pre-wrap",
              previewBuildError.stage === "sandbox_disabled" ? "font-medium" : "font-mono",
            )}
          >
            {previewBuildError.message}
          </AlertDescription>
        </Alert>
      ) : null}

      {previewProdBuild && !previewBuildError ? (
        previewProdBuild.verified ? (
          <Alert className="mx-3 mt-2 rounded-xl border-border bg-muted/40">
            <CircleCheck className="h-4 w-4 text-primary" />
            <AlertTitle className="text-sm text-foreground">Production build OK</AlertTitle>
            <AlertDescription className="text-[11px] text-muted-foreground">
              <code className="font-mono">npm run build</code> lyckades i verifierings-VM — separat signal från
              dev-preview (<code className="font-mono">npm run dev</code>).
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive" className="mx-3 mt-2 rounded-xl border-destructive/40">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="text-sm">Production build misslyckades</AlertTitle>
            <AlertDescription className="space-y-1 text-[11px]">
              <p>Dev-preview kan ändå fungera. Åtgärda build-fel innan deploy — se loggutdrag nedan.</p>
              {previewProdBuild.logSnippet ? (
                <pre className="max-h-36 overflow-y-auto rounded-lg border border-border bg-muted/50 p-2 font-mono text-[10px] whitespace-pre-wrap">
                  {previewProdBuild.logSnippet}
                </pre>
              ) : null}
            </AlertDescription>
          </Alert>
        )
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
        <div className="border-t border-border/60 bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
          {showExternalWarning ? (
            <div>
              Extern preview kan blockera media. Ladda upp via mediabiblioteket för stabila URL:er.
            </div>
          ) : null}
          {showBlobWarning ? (
            <div>Mediastorage saknas — uppladdningar visas inte fullt ut förrän det är aktiverat.</div>
          ) : null}
          {showImagesDisabledWarning ? <div>AI-bilder är avstängda i den här sessionen.</div> : null}
          {showImagesUnsupportedWarning ? (
            <div>Bildgenerering är inte tillgänglig just nu (AI-konfiguration).</div>
          ) : null}
          {showBlobConfigWarning ? (
            <div>Mediastorage är inte aktivt — bilder kan saknas i preview.</div>
          ) : null}
          {integrationError ? <div>Kunde inte hämta integrationsstatus.</div> : null}
        </div>
      ) : null}
    </div>
  );
}
