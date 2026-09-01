"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { Dispatch, DragEvent, MouseEventHandler, RefObject, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import type { FileNode, ElementMapItem } from "@/lib/builder/types";
import { buildJsxElementRegistry, type RegistryMatch } from "@/lib/builder/jsx-element-registry";
import type { InsertionPoint } from "@/lib/builder/section-analyzer";
import {
  PreviewPanelComposerOverlay,
  PreviewPanelComposerPalette,
} from "../composer/PreviewPanelComposer";
import { PreviewPanelAddPanel } from "../composer/PreviewPanelAddPanel";
import type { ShadcnPlacementPicker } from "@/lib/builder/shadcn-insert";
import { PreviewPanelChrome } from "./PreviewPanelChrome";
import { PreviewPanelCode } from "../code/PreviewPanelCode";
import { PreviewPanelCodeSectionEditors } from "../code/PreviewPanelCodeSectionEditors";
import { PreviewPanelFrame } from "./PreviewPanelFrame";
import {
  PreviewInspectMenu,
  PreviewInspectRegionMenu,
  PreviewInspectTextEditor,
} from "../inspect/PreviewInspectMenu";
import type { InspectEngine, InspectPulseMarker, PreviewPanelProps } from "../preview-panel-types";
import type { PreviewRouteInfo } from "../pages/preview-route-helpers";
import {
  describeRegionElement,
  type InspectMenuState,
  type InspectRegionState,
} from "../inspect/preview-panel-inspect-types";
import type { usePreviewPanelCodeDrafts } from "../code/usePreviewPanelCodeDrafts";

const PreviewPanelInspectorDev = dynamic(
  () =>
    import("../inspect/PreviewPanelInspectorDev").then((mod) => ({
      default: mod.PreviewPanelInspectorDev,
    })),
  { ssr: false },
);

// Bildbytet återanvänder den befintliga mediahanteringen — ingen andra bildväg.
const MediaDrawer = dynamic(
  () => import("@/components/media/media-drawer").then((mod) => ({ default: mod.MediaDrawer })),
  { ssr: false },
);

type CodeDrafts = ReturnType<typeof usePreviewPanelCodeDrafts>;

type PreviewPanelSurfaceProps = {
  previewUrl: string | null;
  isOwnEnginePreview: boolean;
  isTier2LivePreview: boolean;
  previewBuildError: PreviewPanelProps["previewBuildError"];
  previewProdBuild: PreviewPanelProps["previewProdBuild"];
  iframeError: boolean;
  iframeErrorMessage: string | null;
  isCodeView: boolean;
  previewRoutesLoading: boolean;
  previewRoutes: PreviewRouteInfo[];
  activePreviewRoute: string | null;
  handleNavigateRoute: (route: string) => void;
  canManagePages: boolean;
  pageOpBusy: boolean;
  onAddPage: (route: string) => void | Promise<void>;
  onRemovePage: (route: string) => void | Promise<void>;
  showPreviewUnifiedStrip: boolean;
  showBlobWarning: boolean;
  showBlobConfigWarning: boolean;
  integrationError: boolean;
  showImagesDisabledWarning: boolean;
  showImagesUnsupportedWarning: boolean;
  showExternalWarning: boolean;
  showElementRegistry: boolean;
  elementRegistry: ReturnType<typeof buildJsxElementRegistry>;
  selectedRegistryId: string | null;
  filesLoading: boolean;
  filesError: string | null;
  setSelectedRegistryId: Dispatch<SetStateAction<string | null>>;
  setSelectedRegistryLine: Dispatch<SetStateAction<number | null>>;
  setSelectedPath: Dispatch<SetStateAction<string | null>>;
  files: FileNode[];
  selectedPath: string | null;
  codeScrollRef: RefObject<HTMLDivElement | null>;
  selectedFile: FileNode | null;
  codeDrafts: CodeDrafts;
  selectedRegistryLine: number | null;
  composerMode: boolean;
  addPanelEnabled: boolean;
  placementMode: boolean;
  composerHistoryBusy: boolean;
  setIsComposerDragging: Dispatch<SetStateAction<boolean>>;
  onShadcnItemInsert?: PreviewPanelProps["onShadcnItemInsert"];
  onPickPlacement?: ShadcnPlacementPicker;
  isLoading: boolean;
  iframeDiagnosticCode: string | null;
  iframeRunbookLines: string[];
  handleOpenInNewTab: () => void;
  onFixPreview?: () => void;
  previewSrc: string;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  handleIframeLoad: () => void;
  handleIframeError: () => void;
  versionMismatchPayload: PreviewPanelProps["versionMismatchPayload"];
  onForcePreviewResync?: PreviewPanelProps["onForcePreviewResync"];
  onPreviewSessionSuspect?: PreviewPanelProps["onPreviewSessionSuspect"];
  showComposerOverlay: boolean;
  iframeLoading: boolean;
  externalLoading: boolean;
  isComposerDragging: boolean;
  hoveredPlacement: InsertionPoint | null;
  handleComposerDragOver: (e: DragEvent<HTMLDivElement>) => void;
  setHoveredPlacement: Dispatch<SetStateAction<InsertionPoint | null>>;
  handleComposerDrop: (e: DragEvent<HTMLDivElement>) => void | Promise<void>;
  handlePlacementMouseMove: MouseEventHandler<HTMLDivElement>;
  lastComposerActionLabel: string | null;
  composerUndoStackLength: number;
  composerRedoStackLength: number;
  handleComposerUndo: () => void | Promise<void>;
  handleComposerRedo: () => void | Promise<void>;
  shouldRenderInspectorDev: boolean;
  showPlacementOverlay: boolean;
  showInspectOverlay: boolean;
  handlePlacementClick: MouseEventHandler<HTMLDivElement>;
  pendingPlacementItem: PreviewPanelProps["pendingPlacementItem"];
  elementMapLoading: boolean;
  sectionZonesCount: number;
  isCapturePending: boolean;
  handleCaptureClick: MouseEventHandler<HTMLDivElement>;
  handleInspectMouseMove?: MouseEventHandler<HTMLDivElement>;
  setHoveredMapElement: Dispatch<SetStateAction<ElementMapItem | null>>;
  inspectEngine: InspectEngine;
  hoveredMapElement: ElementMapItem | null;
  inspectPulse: InspectPulseMarker | null;
  setInspectEngine: (engine: InspectEngine) => void;
  inspectorUnavailable: boolean;
  elementMapCount: number;
  totalAiCostUsd: number;
  lastAiCostDisplay: string | null;
  inspectStatus: string | null;
  lastCodeMatch: RegistryMatch | null;
  handleShowLastCodeMatch: () => void;
  handleToggleInspect: () => void;
  inspectMenu: InspectMenuState | null;
  inspectMenuActions: InspectMenuState["actions"] | null;
  inspectEditBusy: boolean;
  handleInspectDeleteElement: () => void | Promise<void>;
  handleInspectSendPoint: () => void;
  handleInspectShowInCode: () => void;
  setInspectMenu: Dispatch<SetStateAction<InspectMenuState | null>>;
  inspectEditorRect: { x: number; y: number; width: number; height: number } | null;
  inspectEditError: string | null;
  handleInspectSaveText: (next: string) => void | Promise<void>;
  inspectRegion: InspectRegionState | null;
  handleInspectRegionSendPoints: () => void;
  inspectorEnabled: boolean;
  handleInspectRegionSendImage: () => void | Promise<void>;
  regionImagePending: boolean;
  setInspectRegion: Dispatch<SetStateAction<InspectRegionState | null>>;
  handleInspectReplaceImage: (url: string) => void | Promise<void>;
  elementMap: ElementMapItem[];
};

export function PreviewPanelSurface(props: PreviewPanelSurfaceProps) {
  const {
    previewUrl,
    isOwnEnginePreview,
    isTier2LivePreview,
    previewBuildError,
    previewProdBuild,
    iframeError,
    iframeErrorMessage,
    isCodeView,
    previewRoutesLoading,
    previewRoutes,
    activePreviewRoute,
    handleNavigateRoute,
    canManagePages,
    pageOpBusy,
    onAddPage,
    onRemovePage,
    showPreviewUnifiedStrip,
    showBlobWarning,
    showBlobConfigWarning,
    integrationError,
    showImagesDisabledWarning,
    showImagesUnsupportedWarning,
    showExternalWarning,
    showElementRegistry,
    elementRegistry,
    selectedRegistryId,
    filesLoading,
    filesError,
    setSelectedRegistryId,
    setSelectedRegistryLine,
    setSelectedPath,
    files,
    selectedPath,
    codeScrollRef,
    selectedFile,
    codeDrafts,
    selectedRegistryLine,
    composerMode,
    addPanelEnabled,
    placementMode,
    onPickPlacement,
    composerHistoryBusy,
    setIsComposerDragging,
    onShadcnItemInsert,
    isLoading,
    iframeDiagnosticCode,
    iframeRunbookLines,
    handleOpenInNewTab,
    onFixPreview,
    previewSrc,
    iframeRef,
    handleIframeLoad,
    handleIframeError,
    versionMismatchPayload,
    onForcePreviewResync,
    onPreviewSessionSuspect,
    showComposerOverlay,
    iframeLoading,
    externalLoading,
    isComposerDragging,
    hoveredPlacement,
    handleComposerDragOver,
    setHoveredPlacement,
    handleComposerDrop,
    handlePlacementMouseMove,
    lastComposerActionLabel,
    composerUndoStackLength,
    composerRedoStackLength,
    handleComposerUndo,
    handleComposerRedo,
    shouldRenderInspectorDev,
    showPlacementOverlay,
    showInspectOverlay,
    handlePlacementClick,
    pendingPlacementItem,
    elementMapLoading,
    sectionZonesCount,
    isCapturePending,
    handleCaptureClick,
    handleInspectMouseMove,
    setHoveredMapElement,
    inspectEngine,
    hoveredMapElement,
    inspectPulse,
    setInspectEngine,
    inspectorUnavailable,
    elementMapCount,
    totalAiCostUsd,
    lastAiCostDisplay,
    inspectStatus,
    lastCodeMatch,
    handleShowLastCodeMatch,
    handleToggleInspect,
    inspectMenu,
    inspectMenuActions,
    inspectEditBusy,
    handleInspectDeleteElement,
    handleInspectSendPoint,
    handleInspectShowInCode,
    setInspectMenu,
    inspectEditorRect,
    inspectEditError,
    handleInspectSaveText,
    inspectRegion,
    handleInspectRegionSendPoints,
    inspectorEnabled,
    handleInspectRegionSendImage,
    regionImagePending,
    setInspectRegion,
    handleInspectReplaceImage,
    elementMap,
  } = props;

  const {
    rawEditMode,
    setRawEditMode,
    rawCodeDraft,
    setRawCodeDraft,
    rawCodeSaveError,
    setRawCodeSaveError,
    handleSaveRawCode,
    isRawCodeSaving,
    rawCodeDirty,
  } = codeDrafts;

  const PreviewSurface = PreviewPanelFrame;

  return (
    <div className="flex h-full flex-col bg-black/40">
      <PreviewPanelChrome
        isOwnEnginePreview={isOwnEnginePreview}
        isTier2LivePreview={isTier2LivePreview}
        previewBuildError={previewBuildError}
        previewProdBuild={previewProdBuild}
        isCodeView={isCodeView}
        previewRoutesLoading={previewRoutesLoading}
        previewRoutes={previewRoutes}
        activePreviewRoute={activePreviewRoute}
        handleNavigateRoute={handleNavigateRoute}
        canManagePages={canManagePages}
        pageOpBusy={pageOpBusy}
        onAddPage={onAddPage}
        onRemovePage={onRemovePage}
        showTier2UnifiedStrip={showPreviewUnifiedStrip}
        showBlobWarning={showBlobWarning}
        showBlobConfigWarning={showBlobConfigWarning}
        integrationError={integrationError}
        showImagesDisabledWarning={showImagesDisabledWarning}
        showImagesUnsupportedWarning={showImagesUnsupportedWarning}
        showExternalWarning={showExternalWarning}
      />

      {isCodeView ? (
        <PreviewPanelCode
          showElementRegistry={showElementRegistry}
          elementRegistry={elementRegistry}
          selectedRegistryId={selectedRegistryId}
          filesLoading={filesLoading}
          filesError={filesError}
          onRegistrySelect={(item) => {
            setSelectedRegistryId(item.id);
            setSelectedRegistryLine(item.lineNumber);
            setSelectedPath(item.filePath);
          }}
          files={files}
          selectedPath={selectedPath}
          onFileSelect={(file) => {
            setSelectedRegistryId(null);
            setSelectedRegistryLine(null);
            setSelectedPath(file.path);
          }}
          codeScrollRef={codeScrollRef}
          selectedFile={selectedFile}
          headerActions={
            rawEditMode ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRawEditMode(false);
                    setRawCodeDraft(selectedFile?.content || "");
                    setRawCodeSaveError(null);
                  }}
                  disabled={isRawCodeSaving}
                >
                  Avbryt redigering
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleSaveRawCode()}
                  disabled={!rawCodeDirty || isRawCodeSaving}
                >
                  {isRawCodeSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Spara fil
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setRawEditMode(true)}>
                Redigera fil
              </Button>
            )
          }
        >
          <PreviewPanelCodeSectionEditors
            drafts={codeDrafts}
            showElementRegistry={showElementRegistry}
            selectedRegistryLine={selectedRegistryLine}
            rawEditMode={rawEditMode}
            rawCodeDraft={rawCodeDraft}
            setRawCodeDraft={setRawCodeDraft}
            rawCodeSaveError={rawCodeSaveError}
            selectedFile={selectedFile}
          />
        </PreviewPanelCode>
      ) : (
        <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
          {composerMode ? (
            addPanelEnabled ? (
              <PreviewPanelAddPanel
                disabled={!previewUrl || Boolean(placementMode) || composerHistoryBusy}
                onDragStart={() => setIsComposerDragging(true)}
                onDragEnd={() => setIsComposerDragging(false)}
                onInsertShadcnItem={onShadcnItemInsert}
                onPickPlacement={onPickPlacement}
              />
            ) : (
              <PreviewPanelComposerPalette
                disabled={!previewUrl || Boolean(placementMode) || composerHistoryBusy}
                onDragStart={() => setIsComposerDragging(true)}
                onDragEnd={() => setIsComposerDragging(false)}
              />
            )
          ) : null}
          <div className="relative min-h-0 min-w-0 flex-1">
            <PreviewSurface
              isLoading={isLoading}
              iframeError={iframeError}
              iframeErrorMessage={iframeErrorMessage}
              iframeDiagnosticCode={iframeDiagnosticCode}
              iframeRunbookLines={iframeRunbookLines}
              handleOpenInNewTab={handleOpenInNewTab}
              onFixPreview={onFixPreview}
              previewSrc={previewSrc}
              iframeRef={iframeRef}
              handleIframeLoad={handleIframeLoad}
              handleIframeError={handleIframeError}
              bypassLoadingHardCap={isTier2LivePreview && iframeLoading && !externalLoading}
              versionMismatchPayload={versionMismatchPayload}
              onForceRestart={onForcePreviewResync ?? onPreviewSessionSuspect}
            >
              {showComposerOverlay ? (
                <PreviewPanelComposerOverlay
                  show
                  iframeLoading={iframeLoading}
                  externalLoading={externalLoading}
                  isDraggingBlock={isComposerDragging}
                  hoveredPlacement={hoveredPlacement}
                  onDragOver={handleComposerDragOver}
                  onDragLeave={() => setHoveredPlacement(null)}
                  onDrop={(ev) => void handleComposerDrop(ev)}
                  onMouseMove={handlePlacementMouseMove}
                  lastActionLabel={lastComposerActionLabel}
                  canUndo={composerUndoStackLength > 0}
                  canRedo={composerRedoStackLength > 0}
                  historyBusy={composerHistoryBusy}
                  onUndo={() => void handleComposerUndo()}
                  onRedo={() => void handleComposerRedo()}
                />
              ) : null}
              {shouldRenderInspectorDev ? (
                <PreviewPanelInspectorDev
                  showPlacementOverlay={showPlacementOverlay}
                  showInspectOverlay={showInspectOverlay}
                  iframeLoading={iframeLoading}
                  externalLoading={externalLoading}
                  handlePlacementClick={handlePlacementClick}
                  handlePlacementMouseMove={handlePlacementMouseMove}
                  onPlacementMouseLeave={() => setHoveredPlacement(null)}
                  hoveredPlacement={hoveredPlacement}
                  pendingPlacementItem={pendingPlacementItem}
                  elementMapLoading={elementMapLoading}
                  sectionZonesCount={sectionZonesCount}
                  isCapturePending={isCapturePending}
                  handleCaptureClick={handleCaptureClick}
                  handleInspectMouseMove={
                    inspectEngine === "map" && elementMap.length > 0
                      ? handleInspectMouseMove
                      : undefined
                  }
                  onInspectMouseLeave={
                    inspectEngine === "map" ? () => setHoveredMapElement(null) : undefined
                  }
                  inspectEngine={inspectEngine}
                  hoveredMapElement={hoveredMapElement}
                  inspectPulse={inspectPulse}
                  setInspectEngine={setInspectEngine}
                  inspectorUnavailable={inspectorUnavailable}
                  elementMapCount={elementMapCount}
                  totalAiCostUsd={totalAiCostUsd}
                  lastAiCostDisplay={lastAiCostDisplay}
                  inspectStatus={inspectStatus}
                  lastCodeMatch={lastCodeMatch}
                  onShowLastCodeMatch={handleShowLastCodeMatch}
                  handleToggleInspect={handleToggleInspect}
                />
              ) : null}
              {inspectMenu && inspectMenuActions && inspectMenu.mode === "menu" ? (
                <PreviewInspectMenu
                  point={inspectMenu.point}
                  bounds={inspectMenu.bounds}
                  tag={inspectMenu.pick.element.tag}
                  actions={inspectMenuActions}
                  busy={inspectEditBusy}
                  canShowInCode={Boolean(inspectMenu.pick.match)}
                  onEditText={() =>
                    setInspectMenu((current) => (current ? { ...current, mode: "text" } : current))
                  }
                  onReplaceImage={() =>
                    setInspectMenu((current) => (current ? { ...current, mode: "image" } : current))
                  }
                  onDeleteElement={() => void handleInspectDeleteElement()}
                  onSendPointToChat={handleInspectSendPoint}
                  onShowInCode={handleInspectShowInCode}
                  onClose={() => setInspectMenu(null)}
                />
              ) : null}
              {inspectMenu &&
              inspectEditorRect &&
              inspectMenu.mode === "text" &&
              inspectMenu.actions.editText.available ? (
                <PreviewInspectTextEditor
                  rect={inspectEditorRect}
                  bounds={inspectMenu.bounds}
                  initialValue={inspectMenu.actions.editText.target.current}
                  busy={inspectEditBusy}
                  error={inspectEditError}
                  onSave={(next) => void handleInspectSaveText(next)}
                  onCancel={() =>
                    setInspectMenu((current) => (current ? { ...current, mode: "menu" } : current))
                  }
                />
              ) : null}
              {inspectRegion ? (
                <PreviewInspectRegionMenu
                  point={inspectRegion.point}
                  bounds={inspectRegion.bounds}
                  labels={inspectRegion.region.elements.map((entry) =>
                    describeRegionElement(entry.element),
                  )}
                  onSendToChat={handleInspectRegionSendPoints}
                  onSendImageToChat={
                    inspectorEnabled ? () => void handleInspectRegionSendImage() : undefined
                  }
                  imagePending={regionImagePending}
                  onClose={() => setInspectRegion(null)}
                />
              ) : null}
            </PreviewSurface>
            {inspectMenu?.mode === "image" ? (
              <MediaDrawer
                isOpen
                onClose={() =>
                  setInspectMenu((current) => (current ? { ...current, mode: "menu" } : current))
                }
                onFileSelect={(item) => {
                  setInspectMenu((current) => (current ? { ...current, mode: "menu" } : current));
                  void handleInspectReplaceImage(item.url);
                }}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
