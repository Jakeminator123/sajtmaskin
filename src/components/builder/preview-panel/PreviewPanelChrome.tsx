"use client";

import {
  AlertCircle,
  Check,
  ChevronDown,
  CircleCheck,
  Code2,
  ExternalLink,
  FileText,
  LayoutGrid,
  Loader2,
  Plus,
  Redo2,
  Search,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { PreviewLifecycleState } from "@/lib/builder/preview-lifecycle";
import {
  formatRepairPassProgress,
  type VersionDisplayStatus,
} from "@/lib/builder/version-status-display";
import { localizeVerificationSummary } from "@/lib/builder/version-history-status-labels";
import { PreviewPanelF3Trigger } from "./PreviewPanelF3Trigger";
import { PreviewPanelDossiers } from "./PreviewPanelDossiers";
import type { PreviewRouteInfo } from "./preview-route-helpers";
import { cn } from "@/lib/utils";

interface PreviewPanelChromeProps {
  previewUrl: string | null;
  isOwnEnginePreview: boolean;
  isTier2LivePreview: boolean;
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
  handleToggleCode: () => void;
  viewMode: "preview" | "code" | "registry";
  onClear?: (() => void) | null;
  handleClear: () => void;
  isLoading: boolean;
  handleOpenInNewTab: () => void;
  previewBuildError?: { stage: string; message: string } | null;
  previewProdBuild?: { verified: boolean; logSnippet?: string | null } | null;
  previewPending: boolean;
  previewLifecycle?: PreviewLifecycleState;
  activeVersionStatus?: VersionDisplayStatus | null;
  activeVersionSummary?: string | null;
  activeVersionIsLatest?: boolean;
  /** Latest repair pass index (0 when none), for bounded "Reparerar (X/2)" copy. */
  activeVersionRepairPassIndex?: number;
  iframeError: boolean;
  iframeErrorMessage?: string | null;
  isCodeView: boolean;
  previewRoutesLoading: boolean;
  previewRoutes: PreviewRouteInfo[];
  activePreviewRoute: string | null;
  handleNavigateRoute: (route: string) => void;
  /** Whether the +/- page controls should be shown (own-engine/tier-2 only). */
  canManagePages?: boolean;
  /** True while an add/remove page edit is in flight. */
  pageOpBusy?: boolean;
  onAddPage?: (route: string) => void;
  onRemovePage?: (route: string) => void;
  showTier2UnifiedStrip: boolean;
  showBlobWarning: boolean;
  showBlobConfigWarning: boolean;
  integrationError: boolean;
  showImagesDisabledWarning: boolean;
  showImagesUnsupportedWarning: boolean;
  showExternalWarning: boolean;
  /** F3 trigger context — undefined props hide the button. */
  chatId?: string | null;
  versionId?: string | null;
  lifecycleStage?: "design" | "integrations" | null;
  onF3MissingEnv?: (payload: {
    parentVersionId: string;
    projectId?: string | null;
    chatId?: string | null;
    missingByIntegration: Array<{ key: string; name: string; missing: string[] }>;
  }) => void;
  onF3Status?: (status: {
    tone: "info" | "warning" | "error" | "success";
    title: string;
    description: string;
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
  onF3ReleaseSettled?: (payload: {
    versionId: string;
    selectVersion: boolean;
  }) => void;
  /** Forwarded to the Byggblock-panelens katalog-tab. See preview-panel-types.ts. */
  onRequestDossier?: (payload: { id: string; label: string }) => void;
  /** Disables catalog rows while a generation streams / a question is pending. */
  catalogPickDisabled?: boolean;
}

export function PreviewPanelChrome({
  previewUrl,
  isOwnEnginePreview,
  isTier2LivePreview,
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
  handleToggleCode,
  viewMode,
  onClear,
  handleClear,
  isLoading,
  handleOpenInNewTab,
  previewBuildError,
  previewProdBuild,
  previewPending,
  previewLifecycle,
  activeVersionStatus,
  activeVersionSummary,
  activeVersionIsLatest = true,
  activeVersionRepairPassIndex = 0,
  iframeError,
  iframeErrorMessage,
  isCodeView,
  previewRoutesLoading,
  previewRoutes,
  activePreviewRoute,
  handleNavigateRoute,
  canManagePages = false,
  pageOpBusy = false,
  onAddPage,
  onRemovePage,
  showTier2UnifiedStrip,
  showBlobWarning,
  showBlobConfigWarning,
  integrationError,
  showImagesDisabledWarning,
  showImagesUnsupportedWarning,
  showExternalWarning,
  chatId,
  versionId,
  lifecycleStage,
  isBusy = false,
  onF3MissingEnv,
  onF3Status,
  onF3Ready,
  onF3ReleaseSettled,
  onRequestDossier,
  catalogPickDisabled = false,
}: PreviewPanelChromeProps) {
  const [addingPage, setAddingPage] = useState(false);
  const [newPagePath, setNewPagePath] = useState("");
  // Lightweight "Kod" view-switcher menu. Deliberately not a Radix
  // DropdownMenu: this repo can't drive Radix pointer-event flows in jsdom
  // (see SeoOptInPanel.test.tsx), and the existing code-view tests need a
  // synthetic-click-friendly menu item. The menu itself is portaled to
  // document.body with fixed positioning so the toolbar wrapper's
  // overflow-y-auto cannot clip it into the info banner below.
  const [codeMenuOpen, setCodeMenuOpen] = useState(false);
  const [codeMenuPosition, setCodeMenuPosition] = useState({ top: 0, right: 0 });
  const codeMenuTriggerRef = useRef<HTMLButtonElement>(null);

  const handleToggleCodeMenu = () => {
    if (!codeMenuOpen) {
      const rect = codeMenuTriggerRef.current?.getBoundingClientRect();
      if (rect) {
        setCodeMenuPosition({
          top: rect.bottom + 4,
          right: Math.max(0, window.innerWidth - rect.right),
        });
      }
    }
    setCodeMenuOpen((prev) => !prev);
  };

  // The menu is portaled with fixed positioning captured once at open time, so
  // any scroll (incl. the toolbar wrapper's own overflow-y-auto — hence capture)
  // or resize would leave it detached from the trigger. Close it instead of
  // letting it drift; the user reopens it in the new position.
  useEffect(() => {
    if (!codeMenuOpen) return;
    const close = () => setCodeMenuOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [codeMenuOpen]);

  // Synchronous guard so a double Enter/click cannot dispatch two add flows
  // before `pageOpBusy` re-renders (mirrors the ref lock in PreviewPanel).
  const submitLockRef = useRef(false);

  const submitNewPage = () => {
    const value = newPagePath.trim();
    if (!value || pageOpBusy || submitLockRef.current) return;
    submitLockRef.current = true;
    onAddPage?.(value);
    setNewPagePath("");
    setAddingPage(false);
    // Release on the next tick; by then the form is closed and `pageOpBusy`
    // has taken over as the disable signal.
    setTimeout(() => {
      submitLockRef.current = false;
    }, 0);
  };

  const showF3Trigger =
    typeof chatId === "string" &&
    chatId.length > 0 &&
    lifecycleStage !== "integrations";
  const localizedVersionSummary = localizeVerificationSummary(activeVersionSummary);
  const versionWorkInProgress =
    activeVersionStatus === "generating" ||
    activeVersionStatus === "autofixing" ||
    activeVersionStatus === "validating" ||
    activeVersionStatus === "preflighting" ||
    activeVersionStatus === "verifying" ||
    activeVersionStatus === "repairing" ||
    (activeVersionStatus === "retrying" && !activeVersionIsLatest);
  const previewTruth = (() => {
    if (isCodeView || !previewUrl) return null;
    if (iframeError) {
      return {
        tone: "error" as const,
        title: "Preview-iframe är trasig",
        detail:
          iframeErrorMessage ||
          "Iframen kunde inte ladda previewn. Öppna i ny flik eller reparera previewn.",
      };
    }
    if (previewBuildError) {
      return {
        tone: "error" as const,
        title: "Live-preview misslyckades",
        detail: `Steg: ${previewBuildError.stage}. ${previewBuildError.message}`,
      };
    }
    if (previewLifecycle === "recovering") {
      return {
        tone: "pending" as const,
        title: "Återansluter till live-preview",
        detail: "Sessionen verifieras mot servern och preview startas om vid behov.",
      };
    }
    if (previewPending || previewLifecycle === "bootstrapping") {
      return {
        tone: "pending" as const,
        title: "Preview startar",
        detail:
          "VM-previewn bootar och iframen är inte verifierad ännu. Grön/klar status väntar tills lifecycle-signalen har landat.",
      };
    }
    if (activeVersionStatus === "generating") {
      return {
        tone: "pending" as const,
        title: "Genererar version",
        detail: localizedVersionSummary || "own-engine streamar fortfarande kod och innehåll.",
      };
    }
    if (activeVersionStatus === "autofixing") {
      return {
        tone: "pending" as const,
        title: "Kör mekanisk autofix",
        detail:
          localizedVersionSummary ||
          "Deterministiska fixers kör innan previewn ska läsas som färdig.",
      };
    }
    if (activeVersionStatus === "validating") {
      return {
        tone: "pending" as const,
        title: "Validerar kod",
        detail: localizedVersionSummary || "Syntax och typecheck valideras innan versionen sparas.",
      };
    }
    if (activeVersionStatus === "preflighting") {
      return {
        tone: "pending" as const,
        title: "Sparar och preflightar",
        detail: localizedVersionSummary || "Filer finaliseras och preflight avgör om preview får starta.",
      };
    }
    if (activeVersionStatus === "verifying") {
      return {
        tone: "pending" as const,
        title: "Verifierar version",
        detail:
          localizedVersionSummary ||
          "Preview är startad men verify/QG kör fortfarande. Vänta innan du tolkar den som klar.",
      };
    }
    if (activeVersionStatus === "repairing") {
      const progress = formatRepairPassProgress(activeVersionRepairPassIndex);
      return {
        tone: "warning" as const,
        title: progress ? `Reparerar version (${progress})` : "Reparerar version",
        detail:
          localizedVersionSummary ||
          "Servern reparerar fel i bakgrunden (max 2 försök). Nuvarande iframe kan vara trasig eller äldre.",
      };
    }
    if (activeVersionStatus === "retrying" && !activeVersionIsLatest) {
      return {
        tone: "warning" as const,
        title: "Byter till reparerad version",
        detail: localizedVersionSummary || "En nyare reparerad version tar över som aktiv preview.",
      };
    }
    if (activeVersionStatus === "degraded") {
      return {
        tone: "warning" as const,
        title: "Preview klar med luckor",
        detail:
          localizedVersionSummary ||
          "Verifiering eller produkt-postcheck saknas eller hittade blockerande produktfel.",
      };
    }
    if (activeVersionStatus === "blocked") {
      return {
        tone: "warning" as const,
        title: "Preview blockerad",
        detail:
          localizedVersionSummary ||
          "Preview eller verifiering har öppna blockers. Öppna diagnostik för detaljer.",
      };
    }
    if (activeVersionStatus === "failed") {
      return {
        tone: "error" as const,
        title: "Verifiering misslyckades",
        detail:
          localizedVersionSummary ||
          "Verifiering hittade blockerande fel. Reparera versionen innan den används som klar.",
      };
    }
    // Resting states (promoted/ready/design-klar/ej-verifierad) carry no
    // actionable signal — they only repeated what the version panel already
    // shows. Declutter: the truth bar now surfaces ONLY active work (pending),
    // warnings and errors. All calm/success/info states render nothing.
    return null;
  })();
  const previewTruthClassName =
    previewTruth?.tone === "error"
      ? "border-rose-900/55 bg-rose-950/45 text-rose-50"
      : previewTruth?.tone === "warning"
        ? "border-amber-900/50 bg-amber-950/40 text-amber-50"
        : "border-sky-900/45 bg-sky-950/30 text-sky-50";
  const previewTruthTitleClassName =
    previewTruth?.tone === "error"
      ? "text-rose-100"
      : previewTruth?.tone === "warning"
        ? "text-amber-100"
        : "text-sky-100";
  const previewTruthDescriptionClassName =
    previewTruth?.tone === "error"
      ? "text-rose-200/95"
      : previewTruth?.tone === "warning"
        ? "text-amber-200/90"
        : "text-sky-200/90";
  return (
    <div className="max-h-[40%] shrink-0 overflow-y-auto">
      <div className="flex items-center justify-end border-b border-gray-800 px-4 py-2">
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {showF3Trigger ? (
            <PreviewPanelF3Trigger
              chatId={chatId as string}
              versionId={versionId ?? null}
              onMissingEnv={onF3MissingEnv}
              onStatus={onF3Status}
              onReady={onF3Ready}
              onReleaseSettled={onF3ReleaseSettled}
              isBusy={isBusy}
              className="h-7 bg-violet-600 px-2 text-[12px] text-white hover:bg-violet-500"
            />
          ) : null}
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
          <div className="relative">
            <Button
              ref={codeMenuTriggerRef}
              variant="ghost"
              size="sm"
              onClick={handleToggleCodeMenu}
              disabled={!canShowCode || isViewSwitchPending}
              aria-haspopup="menu"
              aria-expanded={codeMenuOpen}
              title={
                canShowCode
                  ? "Visa kod — Kodvy eller Elementregister"
                  : "Ingen kod tillgänglig än"
              }
              className={cn(
                "text-gray-400 hover:text-white",
                viewMode !== "preview" && "bg-gray-800 text-white hover:text-white",
              )}
            >
              <Code2 className="mr-1 h-4 w-4" />
              Kod
              <ChevronDown className="ml-1 h-3.5 w-3.5" />
            </Button>
            {codeMenuOpen && typeof document !== "undefined"
              ? createPortal(
                  <>
                    <button
                      type="button"
                      aria-hidden="true"
                      tabIndex={-1}
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setCodeMenuOpen(false)}
                    />
                    {/* Portalad till body med fixed-position: den gamla inline-menyn
                        klipptes av toolbar-wrapperns overflow-y-auto och hamnade
                        "under" info-bandet nedanför. */}
                    <div
                      role="menu"
                      aria-label="Kodvyer"
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setCodeMenuOpen(false);
                      }}
                      style={{
                        position: "fixed",
                        top: codeMenuPosition.top,
                        right: codeMenuPosition.right,
                      }}
                      className="z-50 min-w-44 rounded-md border border-gray-800 bg-gray-950 p-1 shadow-md"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setCodeMenuOpen(false);
                          handleToggleCode();
                        }}
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-gray-200 hover:bg-gray-800"
                      >
                        <FileText className="h-4 w-4" />
                        <span className="flex-1 text-left">Kodvy</span>
                        {viewMode === "code" ? (
                          <Check className="h-4 w-4 text-emerald-400" />
                        ) : null}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setCodeMenuOpen(false);
                          handleToggleElementRegistry();
                        }}
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-gray-200 hover:bg-gray-800"
                      >
                        <Code2 className="h-4 w-4" />
                        <span className="flex-1 text-left">Elementregister</span>
                        {viewMode === "registry" ? (
                          <Check className="h-4 w-4 text-emerald-400" />
                        ) : null}
                      </button>
                    </div>
                  </>,
                  document.body,
                )
              : null}
          </div>
          {chatId ? (
            <PreviewPanelDossiers
              chatId={chatId}
              versionId={versionId ?? null}
              lifecycleStage={lifecycleStage ?? null}
              onRequestDossier={onRequestDossier}
              catalogPickDisabled={catalogPickDisabled}
            />
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

      {previewTruth ? (
        <Alert className={cn("mx-4 mt-2", previewTruthClassName)}>
          {previewTruth.tone === "error" ? (
            <AlertCircle className="h-4 w-4 text-rose-400" />
          ) : versionWorkInProgress || previewTruth.tone === "pending" ? (
            <Loader2 className="h-4 w-4 animate-spin text-sky-300" />
          ) : (
            <AlertCircle className="h-4 w-4 text-amber-300" />
          )}
          <AlertTitle className={cn("text-sm", previewTruthTitleClassName)}>
            {previewTruth.title}
          </AlertTitle>
          <AlertDescription className={cn("text-[11px]", previewTruthDescriptionClassName)}>
            {previewTruth.detail}
          </AlertDescription>
        </Alert>
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
          <Alert className="mx-4 mt-2 border-sky-900/45 bg-sky-950/25 text-sky-50">
            <CircleCheck className="h-4 w-4 text-sky-300" />
            <AlertTitle className="text-sm text-sky-100">Verify-lane: build OK</AlertTitle>
            <AlertDescription className="text-[11px] text-sky-200/90">
              <code className="font-mono">npm run build</code> lyckades i verifierings-VM. Detta är
              bara verify-lanen — helhetsstatusen avgörs av iframe/lifecycle-raden ovan.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="mx-4 mt-2 border-amber-900/50 bg-amber-950/40 text-amber-50">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <AlertTitle className="text-sm text-amber-100">Verify-lane: build misslyckades</AlertTitle>
            <AlertDescription className="space-y-1 text-[11px] text-amber-200/90">
              <p>
                Dev-preview kan ändå fungera. Läs detta som verify-lane, inte som iframens
                helhetsstatus. Åtgärda build-fel innan deploy — se loggutdrag nedan.
              </p>
              {previewProdBuild.logSnippet ? (
                <pre className="max-h-36 overflow-y-auto rounded border border-amber-900/40 bg-black/30 p-2 font-mono text-[10px] whitespace-pre-wrap text-amber-100/95">
                  {previewProdBuild.logSnippet}
                </pre>
              ) : null}
            </AlertDescription>
          </Alert>
        )
      ) : null}

      {!isCodeView && (previewRoutesLoading || previewRoutes.length > 0 || canManagePages) ? (
        <div className="border-b border-gray-800 bg-black/30 px-4 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-gray-300">
            <span>Sidor i skapad preview</span>
            {pageOpBusy ? <Loader2 className="h-3 w-3 animate-spin text-gray-400" /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {previewRoutesLoading && previewRoutes.length === 0 ? (
              <span className="text-[11px] text-gray-500">Läser routes från versionens filer...</span>
            ) : (
              previewRoutes.map((info) => {
                const isHome = info.route === "/";
                const isActive = activePreviewRoute === info.route;
                // Removal cleanup only strips exact route matches, so a dynamic
                // (bracketed) route cannot be removed reliably — hide the control.
                const removable = canManagePages && !isHome && !info.dynamic;
                // Orphan = the page file exists but is not linked from the site
                // nav (added without an auto-link, or a follow-up dropped the
                // link). Shown with a dashed amber chip + badge so it stays
                // visible and removable instead of becoming an invisible dead end.
                const isOrphan = !info.reachable && !isHome;
                return (
                  <span
                    key={info.route}
                    className={cn(
                      "inline-flex items-center overflow-hidden rounded-md border",
                      isActive
                        ? "border-sky-500/60 bg-sky-500/10"
                        : isOrphan
                          ? "border-dashed border-amber-700/60 bg-amber-500/5"
                          : "border-gray-700 bg-transparent",
                    )}
                  >
                    <button
                      type="button"
                      disabled={!info.navigable || pageOpBusy}
                      className={cn(
                        "h-6 px-2 text-[11px]",
                        info.navigable
                          ? "text-gray-300 hover:bg-gray-800 hover:text-white"
                          : "cursor-default text-gray-500",
                        isActive && "text-sky-200",
                      )}
                      onClick={() => info.navigable && handleNavigateRoute(info.route)}
                      title={
                        info.navigable
                          ? `Visa ${info.label}`
                          : `${info.label} är en dynamisk route och kan inte öppnas direkt`
                      }
                    >
                      {info.label}
                    </button>
                    {isOrphan ? (
                      <span
                        className="px-1 text-[9px] font-medium tracking-wide text-amber-300/80 uppercase"
                        title="Sidan finns men är inte länkad från menyn"
                      >
                        olänkad
                      </span>
                    ) : null}
                    {removable ? (
                      <button
                        type="button"
                        disabled={pageOpBusy}
                        aria-label={`Ta bort sidan ${info.label}`}
                        title={`Ta bort sidan ${info.label}`}
                        className="flex h-6 w-5 items-center justify-center border-l border-gray-700 text-gray-500 hover:bg-rose-900/40 hover:text-rose-200 disabled:opacity-50"
                        onClick={() => onRemovePage?.(info.route)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    ) : null}
                  </span>
                );
              })
            )}

            {canManagePages ? (
              addingPage ? (
                <span className="inline-flex items-center gap-1">
                  <input
                    autoFocus
                    value={newPagePath}
                    onChange={(e) => setNewPagePath(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitNewPage();
                      if (e.key === "Escape") {
                        setNewPagePath("");
                        setAddingPage(false);
                      }
                    }}
                    placeholder="/om"
                    disabled={pageOpBusy}
                    className="h-6 w-24 rounded-md border border-gray-700 bg-black/40 px-2 text-[11px] text-gray-200 placeholder:text-gray-600 focus:border-sky-500/60 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={pageOpBusy || !newPagePath.trim()}
                    onClick={submitNewPage}
                    className="flex h-6 items-center rounded-md border border-emerald-700/60 bg-emerald-900/30 px-2 text-[11px] text-emerald-200 hover:bg-emerald-900/50 disabled:opacity-50"
                  >
                    Lägg till
                  </button>
                  <button
                    type="button"
                    aria-label="Avbryt"
                    onClick={() => {
                      setNewPagePath("");
                      setAddingPage(false);
                    }}
                    className="flex h-6 w-5 items-center justify-center rounded-md text-gray-500 hover:text-gray-300"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={pageOpBusy}
                  onClick={() => setAddingPage(true)}
                  title="Lägg till en ny sida"
                  aria-label="Lägg till en ny sida"
                  className="flex h-6 items-center gap-1 rounded-md border border-dashed border-gray-600 px-2 text-[11px] text-gray-400 hover:border-emerald-600/60 hover:text-emerald-200 disabled:opacity-50"
                >
                  <Plus className="h-3 w-3" />
                  Sida
                </button>
              )
            ) : null}
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
