"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  CircleCheck,
  Code2,
  ExternalLink,
  FileText,
  LayoutGrid,
  MoreVertical,
  Redo2,
  RefreshCw,
  Search,
  Trash2,
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

const GENERATION_PHASES = [
  { label: "Analyserar din brief...", duration: 8_000 },
  { label: "Planerar sidstruktur...", duration: 12_000 },
  { label: "Genererar kod...", duration: 60_000 },
  { label: "Bygger preview...", duration: 30_000 },
  { label: "Finjusterar detaljer...", duration: 20_000 },
];

function SimplifiedProgressBar() {
  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startRef.current), 500);
    return () => clearInterval(id);
  }, []);

  let cumulative = 0;
  let currentPhase = GENERATION_PHASES[GENERATION_PHASES.length - 1]!;
  for (const phase of GENERATION_PHASES) {
    cumulative += phase.duration;
    if (elapsed < cumulative) {
      currentPhase = phase;
      break;
    }
  }

  const totalDuration = GENERATION_PHASES.reduce((s, p) => s + p.duration, 0);
  const raw = Math.min(elapsed / totalDuration, 1);
  const eased = 1 - Math.pow(1 - raw, 1.6);
  const pct = Math.min(eased * 100, 99);

  return (
    <div className="shrink-0 border-b border-border/30 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          <span className="text-sm font-medium text-foreground">{currentPhase.label}</span>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ToolMenuItem({
  icon,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-xs transition-colors",
        disabled
          ? "cursor-not-allowed text-muted-foreground/40"
          : active
            ? "bg-primary/10 font-medium text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function RouteDropdown({
  previewRoutes,
  activePreviewRoute,
  handleNavigateRoute,
  previewRoutesLoading,
}: {
  previewRoutes: string[];
  activePreviewRoute: string | null;
  handleNavigateRoute: (route: string) => void;
  previewRoutesLoading: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {previewRoutesLoading ? "Laddar..." : activePreviewRoute || "/"}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[140px] rounded-md border border-border bg-popover p-1 shadow-md">
          {previewRoutes.map((route) => (
            <button
              key={route}
              type="button"
              onClick={() => { handleNavigateRoute(route); setOpen(false); }}
              className={cn(
                "block w-full rounded-sm px-2 py-1 text-left text-xs transition-colors hover:bg-muted",
                activePreviewRoute === route ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {route}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SimplifiedToolbar({
  previewRoutes,
  previewRoutesLoading,
  activePreviewRoute,
  handleNavigateRoute,
  handleRefresh,
  handleOpenInNewTab,
  isLoading,
}: {
  previewRoutes: string[];
  previewRoutesLoading: boolean;
  activePreviewRoute: string | null;
  handleNavigateRoute: (route: string) => void;
  handleRefresh: () => void;
  handleOpenInNewTab: () => void;
  isLoading: boolean;
}) {
  const [routeMenuOpen, setRouteMenuOpen] = useState(false);
  const hasRoutes = previewRoutes.length > 1;

  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border/30 px-3 py-1.5">
      <div className="flex items-center gap-1">
        {hasRoutes ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setRouteMenuOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {activePreviewRoute || "/"}
              <ChevronDown className="h-3 w-3" />
            </button>
            {routeMenuOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-[140px] rounded-md border border-border bg-popover p-1 shadow-md">
                {previewRoutes.map((route) => (
                  <button
                    key={route}
                    type="button"
                    onClick={() => {
                      handleNavigateRoute(route);
                      setRouteMenuOpen(false);
                    }}
                    className={cn(
                      "block w-full rounded-sm px-2 py-1 text-left text-xs transition-colors hover:bg-muted",
                      activePreviewRoute === route ? "font-medium text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {route}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <span className="px-2 text-xs text-muted-foreground">
            {previewRoutesLoading ? "Laddar sidor..." : activePreviewRoute || "/"}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          disabled={isLoading}
          title="Uppdatera"
          aria-label="Uppdatera"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleOpenInNewTab}
          title="Öppna i ny flik"
          aria-label="Öppna i ny flik"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
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
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toolsMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setToolsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [toolsMenuOpen]);

  if (simplified) {
    if (isLoading) {
      return <SimplifiedProgressBar />;
    }
    if (previewUrl) {
      return (
        <SimplifiedToolbar
          previewRoutes={previewRoutes}
          previewRoutesLoading={previewRoutesLoading}
          activePreviewRoute={activePreviewRoute}
          handleNavigateRoute={handleNavigateRoute}
          handleRefresh={handleRefresh}
          handleOpenInNewTab={handleOpenInNewTab}
          isLoading={isLoading}
        />
      );
    }
    return null;
  }

  const hasAnyWarning =
    showBlobWarning || showBlobConfigWarning || integrationError ||
    showImagesDisabledWarning || showImagesUnsupportedWarning || showExternalWarning;

  return (
    <div className="shrink-0">
      {/* ── Compact toolbar ────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border/30 px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          {/* Route selector */}
          {previewRoutes.length > 1 ? (
            <RouteDropdown
              previewRoutes={previewRoutes}
              activePreviewRoute={activePreviewRoute}
              handleNavigateRoute={handleNavigateRoute}
              previewRoutesLoading={previewRoutesLoading}
            />
          ) : (
            <span className="px-2 text-xs text-muted-foreground">
              {previewRoutesLoading ? "Laddar..." : activePreviewRoute || "/"}
            </span>
          )}

          {/* Active mode indicator */}
          {composerMode && (
            <Badge variant="outline" className="border-primary/35 bg-primary/10 text-[10px] text-primary">Composer</Badge>
          )}
          {inspectMode && (
            <Badge variant="outline" className="border-primary/35 bg-primary/10 text-[10px] text-primary">Inspektera</Badge>
          )}
          {viewMode === "code" && (
            <Badge variant="outline" className="border-primary/35 bg-primary/10 text-[10px] text-primary">Kod</Badge>
          )}
          {showElementRegistry && viewMode !== "code" && (
            <Badge variant="outline" className="border-primary/35 bg-primary/10 text-[10px] text-primary">Element</Badge>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {composerMode && (
            <>
              <Button variant="ghost" size="icon" onClick={onComposerUndo} disabled={!composerCanUndo || composerHistoryBusy} title="Ångra" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onComposerRedo} disabled={!composerCanRedo || composerHistoryBusy} title="Gör om" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                <Redo2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isLoading} title="Uppdatera" aria-label="Uppdatera" className="h-7 w-7 text-muted-foreground hover:text-foreground">
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleOpenInNewTab} title="Öppna i ny flik" aria-label="Öppna i ny flik" className="h-7 w-7 text-muted-foreground hover:text-foreground">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>

          {/* Tools dropdown */}
          <div className="relative" ref={toolsMenuRef}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setToolsMenuOpen((v) => !v)}
              title="Verktyg"
              aria-label="Verktyg"
              className={cn("h-7 w-7 text-muted-foreground hover:text-foreground", toolsMenuOpen && "bg-muted")}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
            {toolsMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-md">
                <ToolMenuItem
                  icon={<LayoutGrid className="h-3.5 w-3.5" />}
                  label="Composer"
                  active={composerMode}
                  disabled={!previewUrl || placementMode || inspectMode}
                  onClick={() => { handleToggleComposer(); setToolsMenuOpen(false); }}
                />
                <ToolMenuItem
                  icon={<Search className="h-3.5 w-3.5" />}
                  label="Inspektera"
                  active={inspectMode}
                  disabled={!inspectorEnabled || !previewUrl || placementMode || composerMode}
                  onClick={() => { handleToggleInspect(); setToolsMenuOpen(false); }}
                />
                <ToolMenuItem
                  icon={<Code2 className="h-3.5 w-3.5" />}
                  label="Elementregister"
                  active={showElementRegistry}
                  disabled={!canShowCode || isViewSwitchPending}
                  onClick={() => { handleToggleElementRegistry(); setToolsMenuOpen(false); }}
                />
                <ToolMenuItem
                  icon={<FileText className="h-3.5 w-3.5" />}
                  label="Kodvy"
                  active={viewMode === "code"}
                  disabled={!canShowCode || isViewSwitchPending}
                  onClick={() => { handleToggleCode(); setToolsMenuOpen(false); }}
                />
                {previewUrl && onClear ? (
                  <>
                    <div className="my-1 h-px bg-border/40" />
                    <ToolMenuItem
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      label="Rensa"
                      disabled={isLoading}
                      onClick={() => { handleClear(); setToolsMenuOpen(false); }}
                    />
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Alerts (only shown when relevant) ─────────────────── */}
      {alternatePreviewBanner && onNavigatePreviewUrl ? (
        <div className="border-b border-border/30 px-3 py-1.5">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Live-preview tillgänglig.</span>
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => onNavigatePreviewUrl(alternatePreviewBanner.livePreviewUrl)}
            >
              Byt
            </button>
          </div>
        </div>
      ) : null}

      {previewBuildError ? (
        <Alert variant="destructive" className="mx-3 my-1.5">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="text-sm">
            {previewBuildError.stage === "sandbox_disabled"
              ? "Preview inte tillgänglig"
              : `Build: ${previewBuildError.stage}`}
          </AlertTitle>
          <AlertDescription
            className={cn(
              "max-h-28 overflow-y-auto text-[11px] whitespace-pre-wrap",
              previewBuildError.stage === "sandbox_disabled" ? "font-medium" : "font-mono",
            )}
          >
            {previewBuildError.message}
          </AlertDescription>
        </Alert>
      ) : null}

      {previewProdBuild && !previewBuildError ? (
        previewProdBuild.verified ? (
          <div className="border-b border-border/30 px-3 py-1.5">
            <div className="flex items-center gap-1.5 text-[11px] text-primary">
              <CircleCheck className="h-3.5 w-3.5" />
              <span className="font-medium">Build OK</span>
            </div>
          </div>
        ) : (
          <Alert className="mx-3 my-1.5 border-destructive/30 bg-destructive/5">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <AlertTitle className="text-sm">Build misslyckades</AlertTitle>
            <AlertDescription className="space-y-1 text-[11px] text-muted-foreground">
              <p>Preview kan ändå fungera.</p>
              {previewProdBuild.logSnippet ? (
                <pre className="max-h-28 overflow-y-auto rounded border border-border/40 bg-muted/30 p-1.5 font-mono text-[10px] whitespace-pre-wrap">
                  {previewProdBuild.logSnippet}
                </pre>
              ) : null}
            </AlertDescription>
          </Alert>
        )
      ) : null}

      {hasAnyWarning && !showTier2UnifiedStrip && !isCodeView && !isOwnEnginePreview && !isTier2LivePreview ? (
        <div className="border-b border-border/30 px-3 py-1.5 text-[11px] text-muted-foreground">
          {showBlobWarning || showBlobConfigWarning ? <span>Media kan saknas i preview. </span> : null}
          {showImagesDisabledWarning ? <span>AI-bilder avstängda. </span> : null}
          {integrationError ? <span>Integrationsstatus okänd. </span> : null}
        </div>
      ) : null}
    </div>
  );
}
