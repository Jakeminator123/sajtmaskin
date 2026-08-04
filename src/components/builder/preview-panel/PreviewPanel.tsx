"use client";

import dynamic from "next/dynamic";
import {
  Loader2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { buildFileTree } from "@/lib/builder/fileTree";
import { isBuilderInspectorEnabled } from "@/lib/builder/inspector-feature";
import {
  INSPECT_BRIDGE_QUERY_PARAM,
  isInspectBridgeEnabled,
} from "@/lib/builder/inspect-bridge-feature";
import type { FileNode } from "@/lib/builder/types";
import { buildJsxElementRegistry, type RegistryMatch } from "@/lib/builder/jsx-element-registry";
import {
  buildComposerDropDetail,
  PAGE_BLOCK_DND_TYPE,
  PreviewPanelComposerOverlay,
  PreviewPanelComposerPalette,
} from "./PreviewPanelComposer";
import { PreviewPanelAddPanel } from "./PreviewPanelAddPanel";
import { isAddPanelEnabled } from "@/lib/builder/add-panel-feature";
import { PreviewPanelChrome } from "./PreviewPanelChrome";
import { PreviewPanelCode } from "./PreviewPanelCode";
import { PreviewPanelCodeSectionEditors } from "./PreviewPanelCodeSectionEditors";
import { PreviewPanelEmptyState } from "./PreviewPanelEmptyState";
import { PreviewPanelFrame } from "./PreviewPanelFrame";
import type { PreviewIssuePayload } from "./iframe-diagnostics";
import { fetchChatVersionFilesJson } from "./chat-version-files-fetch";
import { usePreviewHeartbeat } from "./hooks/usePreviewHeartbeat";
import { usePreviewIframe } from "./hooks/usePreviewIframe";
import { usePreviewPanelCodeDrafts } from "./hooks/usePreviewPanelCodeDrafts";
import { usePreviewPanelInspectCapture } from "./hooks/usePreviewPanelInspectCapture";
import { usePreviewPanelInspectMapPlacement } from "./hooks/usePreviewPanelInspectMapPlacement";
import {
  dispatchBridgeInspectPoint,
  usePreviewInspectBridge,
  type BridgePick,
  type BridgeRect,
  type BridgeRegion,
} from "./hooks/usePreviewInspectBridge";
import {
  PreviewInspectMenu,
  PreviewInspectRegionMenu,
  PreviewInspectTextEditor,
} from "./PreviewInspectMenu";
import {
  buildDeleteElementOps,
  buildImageEditOps,
  buildTextEditOps,
  classifyInspectedElement,
  describeInspectQuickEditError,
  validateInspectImageInput,
  validateInspectTextInput,
  type InspectElementActions,
} from "@/lib/builder/inspect-element-actions";
import { usePreviewPanelCodeFiles } from "./hooks/usePreviewPanelCodeFiles";
import { usePreviewPanelPreviewRoutes } from "./hooks/usePreviewPanelPreviewRoutes";
import type {
  CaptureResponse,
  ComposerAiFallbackPayload,
  InspectEngine,
  PreviewPanelProps,
} from "./preview-panel-types";
import {
  dispatchInspectCaptureEvent,
  type PlacementSelectEventDetail,
} from "@/lib/builder/inspect-events";
import { usePreviewSurfaceMode } from "./usePreviewSurfaceMode";
import {
  buildExternalRoutePreviewUrl,
  buildOwnEngineRoutePreviewUrl,
  extractTier2AppRoute,
} from "./preview-route-helpers";
import { findFileNodeByPath } from "./code-file-tree-utils";
import { useIntegrationStatus } from "@/lib/hooks/useIntegrationStatus";
import { isCompatibilityShimPreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";
import { isTier2LivePreviewUrl } from "@/lib/gen/preview/preview-url-classifier";
import { describePreviewDiagnosticCode, previewRunbookLinesForCode } from "@/lib/gen/preview/diagnostics";
import { toast } from "sonner";
import { getPageBlockById } from "@/lib/builder/page-blocks-catalog";
import {
  parseShadcnDragPayload,
  SHADCN_ITEM_DND_TYPE,
  type ShadcnInsertSelection,
  type ShadcnPlacementPickResult,
} from "@/lib/builder/shadcn-insert";
import {
  resolveHomePageFilePath,
  tryInsertPageBlockIntoHomePage,
} from "@/lib/builder/page-block-patch";
import { patchEngineChatFile, quickEditChatFiles } from "@/lib/builder/engine-files-patch";
import {
  buildAddNavLinkOps,
  buildNewPageContent,
  buildRemoveNavLinkOps,
  defaultLabelForRoute,
  detectAppDir,
  findRouteFilePaths,
  normalizePageRouteInput,
  pageFilePathForRoute,
  routeHasPageFile,
} from "@/lib/builder/preview-page-ops";
import type { QuickEditClientOp, QuickEditClientResult } from "@/lib/builder/engine-files-patch";
import type { SendMessageOutcome } from "@/lib/hooks/chat/types";

const PreviewPanelInspectorDev = dynamic(
  () =>
    import("./PreviewPanelInspectorDev").then((mod) => ({
      default: mod.PreviewPanelInspectorDev,
    })),
  { ssr: false },
);

// Bildbytet återanvänder den befintliga mediahanteringen — ingen andra bildväg.
const MediaDrawer = dynamic(
  () => import("@/components/media/media-drawer").then((mod) => ({ default: mod.MediaDrawer })),
  { ssr: false },
);

/** Elementmenyns lägen: menyn själv, textrutan, eller mediabiblioteket. */
type InspectMenuMode = "menu" | "text" | "image";

type InspectMenuState = {
  pick: BridgePick;
  actions: InspectElementActions;
  point: { x: number; y: number };
  rect: BridgeRect | null;
  bounds: { width: number; height: number };
  mode: InspectMenuMode;
};

type InspectRegionState = {
  point: { x: number; y: number };
  bounds: { width: number; height: number };
  region: BridgeRegion;
};

function describeRegionElement(element: { tag: string; text?: string | null }): string {
  const text = element.text?.trim();
  return text ? `${element.tag} — ${text.slice(0, 40)}` : element.tag;
}

/** Hur många markerade element som skickas som punkter i ett svep. */
const MAX_REGION_POINTS = 10;

type ComposerPatchHistoryEntry = {
  fileName: string;
  before: string;
  after: string;
};

/**
 * Status line for a registry-block drop. Exhaustive over `SendMessageOutcome`
 * so a new outcome cannot silently inherit another one's copy — the previous
 * `else` branch claimed the block was sent even when the send failed.
 */
function composerDropStatusLabel(
  outcome: SendMessageOutcome,
  placementLabel: string,
): string {
  const suffix = ` (${placementLabel})`;
  switch (outcome.status) {
    case "started":
      return `Registry-block skickat till AI${suffix}`;
    case "settled":
      // Prompten hanterades men gav inget nytt bygge (F3-ReleaseGate-runda).
      return `Registry-block skickat — se status i chatten${suffix}`;
    case "rejected":
      return `Registry-block skickades inte${suffix}`;
    case "aborted":
      return `Registry-block avbröts${suffix}`;
    case "failed":
      return `Registry-block misslyckades${suffix}`;
  }
}

export function PreviewPanel({
  chatId,
  versionId,
  designTheme,
  onDesignThemeChange,
  themeLocked = false,
  previewUrl,
  onNavigatePreviewUrl,
  isLoading: externalLoading = false,
  isGenerating = false,
  onFixPreview,
  versionlessAborted = false,
  onRestartGeneration,
  refreshToken,
  onFilesSaved,
  imageGenerationsEnabled = true,
  imageGenerationsSupported = true,
  isBlobConfigured = false,
  awaitingInput = false,
  awaitingInputQuestion = null,
  awaitingInputOptions = [],
  previewBuildError = null,
  previewProdBuild = null,
  previewPending = false,
  activePreviewSessionId = null,
  previewLifecycle,
  activeVersionStatus = null,
  activeVersionSummary = null,
  activeVersionIsLatest = true,
  activeVersionRepairPassIndex = 0,
  versionMismatchPayload = null,
  onPreviewSessionSuspect,
  onForcePreviewResync,
  placementMode = false,
  pendingPlacementItem = null,
  onPlacementComplete,
  onComposerAiFallback,
  onShadcnItemInsert,
  lifecycleStage = null,
  surface: surfaceProp,
}: PreviewPanelProps) {
  const inspectorEnabled = isBuilderInspectorEnabled();
  const canShowCode = Boolean(chatId && versionId);
  // Lägena ägs normalt av builderskalet (kontrollerna sitter i chatpanelen och
  // headern). Den lokala ägaren finns kvar för isolerad rendering av panelen.
  const localSurface = usePreviewSurfaceMode({ previewUrl, canShowCode, inspectorEnabled });
  const surface = surfaceProp ?? localSurface;
  const {
    composerMode,
    setComposerMode,
    inspectMode,
    setInspectMode,
    viewMode,
    setViewMode,
    runViewSwitch,
  } = surface;
  const isCodeView = viewMode !== "preview";
  // "Lägg till"-ytan (tabbad panel) — flag-gated via NEXT_PUBLIC_SAJTMASKIN_ADD_PANEL.
  // Läs EFTER mount (initial false) för att undvika SSR/CSR-hydratmismatch, samma
  // mönster som inspect-bridge-flaggan. Flagga av = dagens fristående Composer-palette.
  const [addPanelEnabled, setAddPanelEnabled] = useState(false);
  useEffect(() => {
    setAddPanelEnabled(isAddPanelEnabled());
  }, []);
  const [isComposerDragging, setIsComposerDragging] = useState(false);
  const [composerUndoStack, setComposerUndoStack] = useState<ComposerPatchHistoryEntry[]>([]);
  const [composerRedoStack, setComposerRedoStack] = useState<ComposerPatchHistoryEntry[]>([]);
  const [composerHistoryBusy, setComposerHistoryBusy] = useState(false);
  // Klick-väg från Bläddra/Beskriv: aktivera befintligt placeringsläge (overlay +
  // toast) i stället för att skicka utan ankare. Shell-ägda placementMode-props
  // förblir externa; detta är den lokala pickern som kopplar Add-panelen.
  const [shadcnPlacementPickItem, setShadcnPlacementPickItem] = useState<{
    title: string;
    description?: string | null;
  } | null>(null);
  const shadcnPlacementPickResolverRef = useRef<
    ((value: ShadcnPlacementPickResult) => void) | null
  >(null);
  const [lastComposerActionLabel, setLastComposerActionLabel] = useState<string | null>(null);
  const {
    files,
    setFiles,
    selectedPath,
    setSelectedPath,
    filesLoading,
    filesError,
    saveSelectedFileContent,
  } = usePreviewPanelCodeFiles({
    isCodeView,
    chatId,
    versionId,
    refreshToken,
    onFilesSaved,
  });
  const { previewRoutes, previewRoutesLoading } = usePreviewPanelPreviewRoutes(
    chatId,
    versionId,
    refreshToken,
  );
  const [pageOpBusy, setPageOpBusy] = useState(false);
  // Synchronous lock: `pageOpBusy` updates async, so two submits in the same
  // tick could both pass the guard and fork version history. The ref flips
  // immediately so the second call bails.
  const pageOpInFlightRef = useRef(false);
  const selectedFile = useMemo(() => {
    if (!selectedPath) return null;
    return findFileNodeByPath(files, selectedPath);
  }, [files, selectedPath]);

  const codeDrafts = usePreviewPanelCodeDrafts({ selectedFile, saveSelectedFileContent });
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

  const [selectedRegistryId, setSelectedRegistryId] = useState<string | null>(null);
  const [selectedRegistryLine, setSelectedRegistryLine] = useState<number | null>(null);
  const { integrationStatus, integrationError } = useIntegrationStatus(previewUrl);
  const bridgeEnabled = inspectorEnabled && isInspectBridgeEnabled();
  const [inspectEngine, setInspectEngine] = useState<InspectEngine>(
    bridgeEnabled ? "bridge" : "map",
  );
  const [inspectStatus, setInspectStatus] = useState<string | null>(null);
  const [lastCodeMatch, setLastCodeMatch] = useState<RegistryMatch | null>(null);
  const [inspectMenu, setInspectMenu] = useState<InspectMenuState | null>(null);
  const [inspectRegion, setInspectRegion] = useState<InspectRegionState | null>(null);
  const [regionImagePending, setRegionImagePending] = useState(false);
  const [inspectEditBusy, setInspectEditBusy] = useState(false);
  const [inspectEditError, setInspectEditError] = useState<string | null>(null);
  // Synkron spärr: `inspectEditBusy` hinner inte uppdateras innan ett andra
  // klick i samma tick, och två parallella snabbändringar skulle grena
  // versionshistoriken.
  const inspectEditInFlightRef = useRef(false);
  const [lastAiCostDisplay, setLastAiCostDisplay] = useState<string | null>(null);
  const [totalAiCostUsd, setTotalAiCostUsd] = useState(0);
  const codeScrollRef = useRef<HTMLDivElement | null>(null);
  const elementRegistryRef = useRef<ReturnType<typeof buildJsxElementRegistry>>([]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // F1-shim telemetry sink. The legacy compatibility-shim path is no longer
  // minted by the API, but `usePreviewIframe` still references this callback
  // inside `if (isOwnEnginePreview)` guards for type compatibility.
  const reportOwnEngineRenderFailure = useCallback((_payload: PreviewIssuePayload) => {}, []);

  const buildPreviewSrc = useCallback((url: string, token?: number) => {
    let src = url;
    if (token) {
      const separator = src.includes("?") ? "&" : "?";
      src = `${src}${separator}t=${token}`;
    }
    return src;
  }, []);

  // Bridge-opt-in decorator: appends `?inspect=1` for own-engine/tier-2 previews
  // when the bridge flag is on. Shared by the rendered previewSrc AND the
  // imperative iframe.src writes (refresh / route-nav) so the bridge script keeps
  // getting injected after a reload instead of silently dropping out of bridge mode.
  const withInspectParam = useCallback(
    (src: string, url: string | null) => {
      if (!bridgeEnabled || !url) return src;
      if (!isCompatibilityShimPreviewUrl(url) && !isTier2LivePreviewUrl(url)) return src;
      const separator = src.includes("?") ? "&" : "?";
      return `${src}${separator}${INSPECT_BRIDGE_QUERY_PARAM}=1`;
    },
    [bridgeEnabled],
  );

  const isOwnEnginePreview = useMemo(() => {
    if (!previewUrl) return false;
    return isCompatibilityShimPreviewUrl(previewUrl);
  }, [previewUrl]);

  const {
    iframeLoading,
    setIframeLoading,
    iframeError,
    setIframeError,
    iframeErrorMessage,
    setIframeErrorMessage,
    iframeDiagnosticCode,
    setIframeDiagnosticCode,
    clearPreviewReadyTimer,
    handleIframeLoad,
  } = usePreviewIframe({
    previewUrl,
    refreshToken,
    chatId,
    versionId,
    isOwnEnginePreview,
    onPreviewSessionSuspect,
    reportOwnEngineRenderFailure,
    iframeRef,
  });

  const fetchFilesForRegistry = useCallback(async () => {
    if (!chatId || !versionId || files.length > 0) return;
    try {
      const { response, data } = await fetchChatVersionFilesJson(chatId, versionId);
      if (!response.ok) return;
      const flatFiles = Array.isArray(data?.files)
        ? data.files.map((f) => ({
            name: f.name,
            content: f.content ?? "",
            locked: f.locked,
          }))
        : [];
      if (flatFiles.length > 0) {
        setFiles(buildFileTree(flatFiles));
      }
    } catch {
      /* best-effort */
    }
  }, [chatId, versionId, files.length, setFiles]);

  useEffect(() => {
    if (placementMode) setComposerMode(false);
  }, [placementMode, setComposerMode]);

  useEffect(() => {
    if (isCodeView) setComposerMode(false);
  }, [isCodeView, setComposerMode]);

  useEffect(() => {
    setComposerUndoStack([]);
    setComposerRedoStack([]);
    setComposerHistoryBusy(false);
    setLastComposerActionLabel(null);
  }, [chatId, versionId]);

  useEffect(() => {
    if (!composerMode) {
      setIsComposerDragging(false);
    }
  }, [composerMode]);

  const resolveShadcnPlacementPick = useCallback((value: ShadcnPlacementPickResult) => {
    const resolve = shadcnPlacementPickResolverRef.current;
    if (!resolve) return;
    shadcnPlacementPickResolverRef.current = null;
    setShadcnPlacementPickItem(null);
    resolve(value);
  }, []);

  // Chatt-/versionsbyte medan placeringsvalet pågår: avbryt HELT (ingen
  // insättning). Utan detta kunde ett val som startade i en chatt fullföljas
  // mot den nya aktiva chatten, eller lämna insertingRef låst (bugbot-fynd).
  // Första hydreringen är inget byte: placeringsläget kräver bara `previewUrl`,
  // som kan finnas innan versionslistan laddat, så en abort när `versionId` går
  // från tomt till sitt första värde hade tyst svalt ett val användaren redan
  // startat. Bara ett skifte FRÅN ett satt id räknas därför som byte.
  const placementScopeRef = useRef({ chatId, versionId });
  useEffect(() => {
    const previous = placementScopeRef.current;
    placementScopeRef.current = { chatId, versionId };
    const chatSwitched = Boolean(previous.chatId) && previous.chatId !== chatId;
    const versionSwitched = Boolean(previous.versionId) && previous.versionId !== versionId;
    if (chatSwitched || versionSwitched) resolveShadcnPlacementPick("aborted");
  }, [chatId, versionId, resolveShadcnPlacementPick]);

  const handlePickShadcnPlacement = useCallback(
    (selection: ShadcnInsertSelection) => {
      // Utan inspector/preview kan overlayn inte visas — behåll dagens default.
      if (!inspectorEnabled || !previewUrl) {
        return Promise.resolve(null);
      }
      if (shadcnPlacementPickResolverRef.current) {
        // Ett nytt val ersätter ett pågående — det gamla får aldrig insättas.
        shadcnPlacementPickResolverRef.current("aborted");
        shadcnPlacementPickResolverRef.current = null;
      }
      return new Promise<ShadcnPlacementPickResult>((resolve) => {
        shadcnPlacementPickResolverRef.current = resolve;
        setShadcnPlacementPickItem({
          title: selection.title?.trim() || selection.name,
          description: selection.description ?? null,
        });
      });
    },
    [inspectorEnabled, previewUrl],
  );

  const handlePlacementCompleteMerged = useCallback(
    (detail: PlacementSelectEventDetail) => {
      onPlacementComplete?.(detail);
      if (!shadcnPlacementPickResolverRef.current) return;
      resolveShadcnPlacementPick({
        placement: detail.placement,
        placementLabel: detail.placementLabel,
        anchorSectionLabel: detail.anchorSection?.label,
      });
    },
    [onPlacementComplete, resolveShadcnPlacementPick],
  );

  // Esc / klick utanför overlay → avbryt HELT (ingen insättning). Klick på
  // fryst chrome (disablad panel, tabbar) är inte "sätt in längst ner" —
  // bugbot-fynd: null här startade en oavsiktlig generation. Default-insättning
  // utan ankare finns kvar bara när overlayn inte kan visas alls (pickern
  // resolvar null direkt i handlePickShadcnPlacement).
  useEffect(() => {
    if (!shadcnPlacementPickItem) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      resolveShadcnPlacementPick("aborted");
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-testid="placement-overlay"]')) return;
      resolveShadcnPlacementPick("aborted");
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [shadcnPlacementPickItem, resolveShadcnPlacementPick]);

  useEffect(() => {
    return () => {
      if (!shadcnPlacementPickResolverRef.current) return;
      // Unmount = användaren lämnade ytan — avbryt utan insättning
      // (bugbot-fynd: `null` här startade en oavsiktlig generation).
      shadcnPlacementPickResolverRef.current("aborted");
      shadcnPlacementPickResolverRef.current = null;
    };
  }, []);

  const effectivePlacementMode = Boolean(placementMode || shadcnPlacementPickItem);
  const effectivePendingPlacementItem = pendingPlacementItem ?? shadcnPlacementPickItem;

  const {
    elementMap,
    elementMapLoading,
    inspectorUnavailable,
    hoveredMapElement,
    setHoveredMapElement,
    hoveredPlacement,
    setHoveredPlacement,
    handleToggleInspect,
    sectionZones,
    applyBridgeSectionCandidates,
    handlePlacementMouseMove,
    handlePlacementClick,
    handleInspectMouseMove,
  } = usePreviewPanelInspectMapPlacement({
    inspectorEnabled,
    previewUrl,
    versionId,
    placementMode: effectivePlacementMode,
    composerMode,
    inspectMode,
    setInspectMode,
    iframeLoading,
    externalLoading,
    iframeRef,
    fetchFilesForRegistry,
    setInspectStatus,
    setLastCodeMatch,
    onPlacementComplete: handlePlacementCompleteMerged,
    inspectEngine,
  });

  const flatFilesForAi = useMemo(() => {
    const result: Array<{ name: string; content: string }> = [];
    const walk = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.type === "file" && node.content)
          result.push({ name: node.path, content: node.content });
        if (node.children?.length) walk(node.children);
      }
    };
    walk(files);
    return result;
  }, [files]);

  const { isCapturePending, inspectPulse, handleCaptureClick } = usePreviewPanelInspectCapture({
    inspectorEnabled,
    previewUrl,
    inspectMode,
    iframeLoading,
    externalLoading,
    inspectEngine,
    hoveredMapElement,
    chatId,
    versionId,
    flatFilesForAi,
    elementRegistryRef,
    setFiles,
    setInspectStatus,
    setLastCodeMatch,
    setLastAiCostDisplay,
    setTotalAiCostUsd,
  });

  // Klick i inspect-läge öppnar elementmenyn i stället för att direkt skicka en
  // punkt till chatten. Klassificeringen (vad som går att göra) körs mot den
  // inlästa filen — refen håller den färsk utan att göra handlern instabil.
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const showMatchInCode = useCallback(
    (match: RegistryMatch) => {
      setInspectMode(false);
      runViewSwitch(() => {
        setViewMode("registry");
        setSelectedRegistryId(match.item.id);
        setSelectedRegistryLine(match.item.lineNumber);
        setSelectedPath(match.item.filePath);
      });
    },
    [
      setInspectMode,
      runViewSwitch,
      setViewMode,
      setSelectedRegistryId,
      setSelectedRegistryLine,
      setSelectedPath,
    ],
  );

  const handleBridgePick = useCallback((pick: BridgePick) => {
    const location = pick.match
      ? { filePath: pick.match.item.filePath, lineNumber: pick.match.item.lineNumber }
      : null;
    const fileContent = location
      ? (findFileNodeByPath(filesRef.current, location.filePath)?.content ?? null)
      : null;
    const actions = classifyInspectedElement({
      element: {
        tag: pick.element.tag,
        ownText: pick.element.ownText ?? null,
        text: pick.element.text ?? null,
        src: pick.element.src ?? null,
        childElementCount: pick.element.childElementCount ?? 0,
      },
      location,
      fileContent,
    });
    setInspectRegion(null);
    setInspectEditError(null);
    setInspectMenu({
      pick,
      actions,
      point: pick.click,
      rect: pick.rect,
      bounds: { width: pick.viewport.w, height: pick.viewport.h },
      mode: "menu",
    });
  }, []);

  const handleBridgeRect = useCallback((rect: BridgeRect) => {
    setInspectMenu((current) => (current ? { ...current, rect } : current));
  }, []);

  const handleBridgeRegion = useCallback((region: BridgeRegion) => {
    setInspectMenu(null);
    setInspectRegion({
      point: { x: region.rect.x + region.rect.width, y: region.rect.y + region.rect.height },
      bounds: { width: region.viewport.w, height: region.viewport.h },
      region,
    });
  }, []);

  usePreviewInspectBridge({
    enabled: bridgeEnabled,
    active: inspectEngine === "bridge",
    inspectMode,
    previewUrl,
    iframeRef,
    elementRegistryRef,
    fetchFilesForRegistry,
    setInspectStatus,
    setLastCodeMatch,
    onPick: handleBridgePick,
    onRect: handleBridgeRect,
    onRegion: handleBridgeRegion,
    // A-fix (#164/#197): bron annonserade aldrig `ready` → previewn saknar
    // injektionen. Växla till kartmotorn i stället för en inert inspektor.
    onBridgeUnavailable: () => setInspectEngine("map"),
    // Placement/composer behöver sektionsankare i prod (ingen Playwright-map).
    // effectivePlacementMode: även klick-pickerns lokala placeringsläge
    // (Bläddra/Beskriv) ska trigga zon-hämtning, inte bara shell-propen.
    requestSections:
      bridgeEnabled &&
      inspectEngine === "bridge" &&
      (effectivePlacementMode || composerMode),
    onSections: applyBridgeSectionCandidates,
  });

  // Menyn hör till inspect-läget: lämnar man läget (eller previewen byts) ska
  // ingen meny bli kvar svävande över en yta den inte längre beskriver.
  useEffect(() => {
    if (inspectMode) return;
    setInspectMenu(null);
    setInspectRegion(null);
  }, [inspectMode]);
  useEffect(() => {
    setInspectMenu(null);
    setInspectRegion(null);
  }, [previewUrl, isCodeView]);

  const iframeRunbookLines = useMemo(
    () => (iframeError ? previewRunbookLinesForCode(iframeDiagnosticCode) : []),
    [iframeError, iframeDiagnosticCode],
  );

  const showElementRegistry = viewMode === "registry";

  // Kodvyn visar filer, inte registerträffar. Vy-bytet ägs av headerns
  // Kod-meny, så valet nollställs här i stället för i menyn.
  useEffect(() => {
    if (viewMode !== "code") return;
    setSelectedRegistryId(null);
    setSelectedRegistryLine(null);
  }, [viewMode]);

  const handleComposerDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      // Under en HTML5-drag fyrar INTE mousemove — utan detta uppdateras
      // placeringslinjen ("Längst upp"/"Efter Hero"/…) aldrig medan man drar.
      // DragEvent ärver MouseEvent (clientY/currentTarget), så samma handler
      // som hover-läget kan återanvändas rakt av.
      handlePlacementMouseMove(e);
    },
    [handlePlacementMouseMove],
  );

  const runComposerAiFallback = useCallback(
    async (
      payload: ComposerAiFallbackPayload,
      mode: "ai-fallback" | "visual-reorder" = "ai-fallback",
    ) => {
      setLastComposerActionLabel(
        mode === "visual-reorder"
          ? `Visuell omordning (${payload.placementLabel}) → AI-fallback`
          : `AI-fallback (${payload.placementLabel})`,
      );
      if (!onComposerAiFallback) return;
      try {
        await onComposerAiFallback(payload);
      } catch {
        toast.error("Kunde inte skicka AI-fallback till own-engine.");
      }
    },
    [onComposerAiFallback],
  );

  // FEL-2: chain rapid composer actions off the version each one creates, so a
  // second drop/undo/redo fired before the parent re-renders builds on the
  // first instead of forking from the stale `versionId` prop (mirrors the code
  // view's baseVersionRef in usePreviewPanelCodeFiles). Re-synced when the
  // selected version prop changes.
  const composerBaseVersionRef = useRef<string | null>(versionId);
  useEffect(() => {
    composerBaseVersionRef.current = versionId;
  }, [versionId]);

  const handleComposerUndo = useCallback(async () => {
    if (!chatId || !versionId || composerHistoryBusy) return;
    const last = composerUndoStack[composerUndoStack.length - 1];
    if (!last) return;

    setComposerHistoryBusy(true);
    try {
      const base = composerBaseVersionRef.current ?? versionId;
      const saved = await patchEngineChatFile({
        chatId,
        versionId: base,
        fileName: last.fileName,
        content: last.before,
        // Composer chains off the version each action creates (FEL-2); forward
        // that base as the latest-known signal so the server's stale-base 409
        // fires when another writer advanced the chat head past it.
        engineLatestKnownVersionId: base,
        // History restore, not new machine content: the snapshot is a state
        // the file has already been in (possibly a deliberately saved broken
        // draft from the code view). Gating it would strand the user with no
        // way back — and unlike the composer drop there is no AI fallback.
        guardSyntax: false,
      });
      if (!saved.ok) {
        toast.error(saved.error);
        return;
      }
      if (saved.versionId) composerBaseVersionRef.current = saved.versionId;
      setComposerUndoStack((prev) => prev.slice(0, -1));
      setComposerRedoStack((prev) => [last, ...prev].slice(0, 20));
      setLastComposerActionLabel("Ångra direkt patch");
      toast.success("Senaste composer-patch ångrad.");
      onFilesSaved?.({
        versionId: saved.versionId,
        previewUrl: saved.previewUrl,
        previewSessionId: saved.previewSessionId,
        previewMode: saved.previewMode,
      });
    } finally {
      setComposerHistoryBusy(false);
    }
  }, [chatId, versionId, composerHistoryBusy, composerUndoStack, onFilesSaved]);

  const handleComposerRedo = useCallback(async () => {
    if (!chatId || !versionId || composerHistoryBusy) return;
    const next = composerRedoStack[0];
    if (!next) return;

    setComposerHistoryBusy(true);
    try {
      const base = composerBaseVersionRef.current ?? versionId;
      const saved = await patchEngineChatFile({
        chatId,
        versionId: base,
        fileName: next.fileName,
        content: next.after,
        // See handleComposerUndo: chain off the latest composer version (FEL-2)
        // and forward it as the latest-known signal for the stale-base 409.
        engineLatestKnownVersionId: base,
        // History restore — same rationale as handleComposerUndo above.
        guardSyntax: false,
      });
      if (!saved.ok) {
        toast.error(saved.error);
        return;
      }
      if (saved.versionId) composerBaseVersionRef.current = saved.versionId;
      setComposerRedoStack((prev) => prev.slice(1));
      setComposerUndoStack((prev) => [...prev.slice(-19), next]);
      setLastComposerActionLabel("Gör om direkt patch");
      toast.success("Composer-patch återställd igen.");
      onFilesSaved?.({
        versionId: saved.versionId,
        previewUrl: saved.previewUrl,
        previewSessionId: saved.previewSessionId,
        previewMode: saved.previewMode,
      });
    } finally {
      setComposerHistoryBusy(false);
    }
  }, [chatId, versionId, composerHistoryBusy, composerRedoStack, onFilesSaved]);

  const handleComposerDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsComposerDragging(false);
      setHoveredPlacement(null);

      // Registry-kort (Bläddra/Beskriv) → insättnings-lane v1 med placerings-
      // ankare. Kollas FÖRE page-block-payloaden: en registry-drag har aldrig
      // PAGE_BLOCK_DND_TYPE satt och föll tidigare tyst ur handlern.
      const shadcnRaw = e.dataTransfer.getData(SHADCN_ITEM_DND_TYPE);
      if (shadcnRaw) {
        if (!chatId || iframeLoading || externalLoading || composerHistoryBusy) return;
        const selection = parseShadcnDragPayload(shadcnRaw);
        if (!selection) {
          toast.error("Kunde inte läsa det dragna blocket.");
          return;
        }
        if (!onShadcnItemInsert) {
          toast.error("Insättning är inte tillgänglig här ännu.");
          return;
        }
        const detail = buildComposerDropDetail(e, sectionZones);
        try {
          const outcome = await onShadcnItemInsert({
            ...selection,
            placement: detail.placement,
            placementLabel: detail.placementLabel,
            anchorSectionLabel: detail.anchorSection?.label,
          });
          // Utfallskontraktet (BB#shadcn-lane1) ersätter den tidigare neutrala
          // copyn: bara ett startat bygge får en success-toast (avslag och fel
          // har redan sin egen toast från sändvägen), och statusraden namnger
          // varje utfall i stället för att bunta ihop dem — en `switch` så ett
          // framtida utfall inte tyst ärver fel copy (bugbot på #610).
          setLastComposerActionLabel(
            composerDropStatusLabel(outcome, detail.placementLabel),
          );
          if (outcome.status === "started") {
            toast.success(`Bygger in blocket (${detail.placementLabel}).`);
          }
        } catch {
          // Fel-toasten ägs av insert-handlern (busy/chattbyte/etc.).
          setLastComposerActionLabel(
            `Registry-block skickades inte (${detail.placementLabel})`,
          );
        }
        return;
      }

      const blockId = e.dataTransfer.getData(PAGE_BLOCK_DND_TYPE);
      if (
        !blockId ||
        !chatId ||
        !versionId ||
        iframeLoading ||
        externalLoading ||
        composerHistoryBusy
      ) {
        return;
      }

      const block = getPageBlockById(blockId);
      if (!block) {
        toast.error("Okänt sajblock.");
        return;
      }

      const detail = buildComposerDropDetail(e, sectionZones);
      const fallbackBase = {
        blockId,
        placement: detail.placement,
        placementLabel: detail.placementLabel,
        anchorSection: detail.anchorSection,
      };

      const base = composerBaseVersionRef.current ?? versionId;
      try {
        const { response, data } = await fetchChatVersionFilesJson(chatId, base);
        if (!response.ok || !data?.files || !Array.isArray(data.files)) {
          toast.error("Kunde inte läsa versionens filer.");
          await runComposerAiFallback({
            ...fallbackBase,
            homePageContent: null,
          });
          return;
        }

        const flatFiles = data.files.map((f) => ({
          name: f.name,
          content: f.content ?? "",
        }));
        const path = resolveHomePageFilePath(flatFiles);
        const homePageContent = path
          ? (flatFiles.find((f) => f.name === path)?.content ?? "")
          : "";

        if (!path) {
          toast.message("Ingen startsida hittades", {
            description: "Förväntade app/page.tsx — skickar till AI istället.",
          });
          await runComposerAiFallback({
            ...fallbackBase,
            homePageContent: null,
          });
          return;
        }

        const patchResult = tryInsertPageBlockIntoHomePage(
          homePageContent,
          block.jsxSnippet,
          detail.placement,
        );

        if (!patchResult.ok) {
          toast.message("Composer → AI", {
            description: patchResult.reason,
          });
          const fallbackMode =
            detail.placement === "top" || detail.placement === "bottom"
              ? "ai-fallback"
              : "visual-reorder";
          await runComposerAiFallback({
            ...fallbackBase,
            homePageContent,
          }, fallbackMode);
          return;
        }

        const saved = await patchEngineChatFile({
          chatId,
          versionId: base,
          fileName: path,
          content: patchResult.content,
          // See handleComposerUndo: chain off the latest composer version (FEL-2)
          // and forward it as the latest-known signal for the stale-base 409.
          engineLatestKnownVersionId: base,
        });

        if (!saved.ok) {
          toast.error(saved.error);
          await runComposerAiFallback({
            ...fallbackBase,
            homePageContent,
          });
          return;
        }

        if (saved.versionId) composerBaseVersionRef.current = saved.versionId;
        setComposerUndoStack((prev) => [
          ...prev.slice(-19),
          { fileName: path, before: homePageContent, after: patchResult.content },
        ]);
        setComposerRedoStack([]);
        setLastComposerActionLabel(`Direkt patch (${detail.placementLabel})`);
        toast.success(`Sektion infogad direkt (${path})`);
        onFilesSaved?.({
          versionId: saved.versionId,
          previewUrl: saved.previewUrl,
          previewSessionId: saved.previewSessionId,
          previewMode: saved.previewMode,
        });
      } catch {
        toast.error("Något gick fel vid infogning.");
        await runComposerAiFallback({
          ...fallbackBase,
          homePageContent: null,
        });
      }
    },
    [
      chatId,
      versionId,
      sectionZones,
      iframeLoading,
      externalLoading,
      composerHistoryBusy,
      runComposerAiFallback,
      onFilesSaved,
      onShadcnItemInsert,
      setHoveredPlacement,
    ],
  );

  const elementRegistry = useMemo(() => buildJsxElementRegistry(files), [files]);
  // Sync ref to latest registry without mutating during render — async inspect callbacks read this.
  useEffect(() => {
    elementRegistryRef.current = elementRegistry;
  }, [elementRegistry]);

  useEffect(() => {
    if (!showElementRegistry || selectedRegistryLine === null) return;
    const container = codeScrollRef.current;
    if (!container) return;
    const approxLineHeight = 18;
    container.scrollTo({
      top: Math.max(0, (selectedRegistryLine - 4) * approxLineHeight),
      behavior: "smooth",
    });
  }, [showElementRegistry, selectedRegistryLine, selectedPath]);

  const handleOpenInNewTab = () => {
    if (previewUrl) window.open(previewUrl, "_blank", "noopener,noreferrer");
  };

  const activePreviewRoute = useMemo(() => {
    if (!previewUrl) return null;
    try {
      if (isOwnEnginePreview) {
        const current = new URL(previewUrl, window.location.origin);
        return current.searchParams.get("route") || "/";
      }
      const current = new URL(previewUrl, window.location.origin);
      return extractTier2AppRoute(current.pathname);
    } catch {
      return null;
    }
  }, [previewUrl, isOwnEnginePreview]);

  const handleNavigateRoute = useCallback(
    (route: string) => {
      if (!previewUrl) return;
      const nextUrl = isOwnEnginePreview
        ? buildOwnEngineRoutePreviewUrl(previewUrl, route)
        : buildExternalRoutePreviewUrl(previewUrl, route);
      if (!nextUrl || nextUrl === previewUrl) return;
      // Single reload owner: the parent updates `previewUrl`, whose prop
      // change rewrites the iframe src (one load). The previous imperative
      // `iframe.src = …` here raced that prop-driven write and double-loaded
      // the preview on every page-tab click.
      onNavigatePreviewUrl?.(nextUrl);
      setIframeError(false);
      setIframeErrorMessage(null);
    },
    [
      previewUrl,
      isOwnEnginePreview,
      onNavigatePreviewUrl,
      setIframeError,
      setIframeErrorMessage,
    ],
  );

  // Quick-edit op cap (mirrors the route's zod `.max(50)`). Page removal of a
  // heavily colocated route can exceed it, so ops are chunked into sequential
  // minor versions chaining off each previous result.
  const QUICK_EDIT_OPS_PER_CALL = 50;
  const runQuickEditChunked = useCallback(
    async (
      activeChatId: string,
      baseVersionId: string,
      ops: QuickEditClientOp[],
      summary: string,
    ): Promise<QuickEditClientResult> => {
      let currentBase = baseVersionId;
      let last: QuickEditClientResult | null = null;
      for (let i = 0; i < ops.length; i += QUICK_EDIT_OPS_PER_CALL) {
        const slice = ops.slice(i, i + QUICK_EDIT_OPS_PER_CALL);
        const res = await quickEditChatFiles({
          chatId: activeChatId,
          baseVersionId: currentBase,
          // First chunk's base is the page op's base version; later chunks chain
          // off the previous result. Forwarding `currentBase` as latest-known
          // means the stale-base 409 only fires when another writer advanced the
          // head past our base, never on our own chain.
          engineLatestKnownVersionId: currentBase,
          ops: slice,
          summary,
        });
        if (!res.ok) return res;
        currentBase = res.versionId;
        last = res;
      }
      return last ?? { ok: false, error: "Inga ändringar att tillämpa." };
    },
    [],
  );

  const handleAddPage = useCallback(
    async (rawRoute: string) => {
      if (!chatId || !versionId || pageOpInFlightRef.current) return;
      const route = normalizePageRouteInput(rawRoute);
      if (!route) {
        toast.error("Ogiltig sökväg. Använd t.ex. /om eller /tjanster/pris.");
        return;
      }
      pageOpInFlightRef.current = true;
      setPageOpBusy(true);
      try {
        const { response, data } = await fetchChatVersionFilesJson(chatId, versionId);
        if (!response.ok || !data?.files || !Array.isArray(data.files)) {
          toast.error("Kunde inte läsa versionens filer.");
          return;
        }
        const files = data.files.map((f) => ({ name: f.name, content: f.content ?? "" }));
        if (routeHasPageFile(files, route)) {
          toast.error(`Sidan ${route} finns redan.`);
          return;
        }
        const appDir = detectAppDir(files);
        const pagePath = pageFilePathForRoute(route, appDir);
        const label = defaultLabelForRoute(route);
        const nav = buildAddNavLinkOps(files, route, label);
        const pageOp: QuickEditClientOp = {
          kind: "replace_content",
          path: pagePath,
          content: buildNewPageContent(route, label),
        };
        const runOps = (ops: QuickEditClientOp[]) =>
          quickEditChatFiles({
            chatId,
            baseVersionId: versionId,
            // Forward the active version as the latest-known signal so the server's
            // stale-base 409 fires if another writer advanced the chat head.
            engineLatestKnownVersionId: versionId,
            ops,
            summary: `La till sidan ${route}`,
          });
        let result = await runOps([pageOp, ...nav.ops]);
        let navRejected = false;
        if (!result.ok && result.reason === "parse_regression" && nav.ops.length > 0) {
          // The server's syntax gate rejected the menu rewrite. The page itself
          // is independent of it, so create the page without the link instead of
          // dropping the whole action.
          navRejected = true;
          result = await runOps([pageOp]);
        }
        if (!result.ok) {
          toast.error(result.error || "Kunde inte skapa sidan.");
          return;
        }
        if (navRejected) {
          toast.message(`Sidan ${route} skapades`, {
            description:
              "Menyn kunde inte uppdateras automatiskt utan att koden gick sönder — be i chatten att länka sidan.",
          });
        } else if (nav.navUpdated) {
          toast.success(`Sidan ${route} skapades och länkades i menyn.`);
        } else {
          toast.message(`Sidan ${route} skapades`, {
            description:
              "Hittade ingen meny att länka från automatiskt — be i chatten att länka sidan så syns den i menyn.",
          });
        }
        onFilesSaved?.({
          versionId: result.versionId,
          previewUrl: result.previewUrl,
          previewSessionId: result.previewSessionId,
          previewMode: result.previewMode,
        });
      } catch {
        toast.error("Något gick fel när sidan skulle skapas.");
      } finally {
        pageOpInFlightRef.current = false;
        setPageOpBusy(false);
      }
    },
    [chatId, versionId, onFilesSaved],
  );

  const handleRemovePage = useCallback(
    async (route: string) => {
      if (!chatId || !versionId || route === "/" || pageOpInFlightRef.current) return;
      pageOpInFlightRef.current = true;
      setPageOpBusy(true);
      try {
        const { response, data } = await fetchChatVersionFilesJson(chatId, versionId);
        if (!response.ok || !data?.files || !Array.isArray(data.files)) {
          toast.error("Kunde inte läsa versionens filer.");
          return;
        }
        const files = data.files.map((f) => ({ name: f.name, content: f.content ?? "" }));
        const routeFiles = findRouteFilePaths(files, route);
        if (routeFiles.length === 0) {
          toast.error(`Hittade inga filer för sidan ${route}.`);
          return;
        }
        // Exclude the files we are about to delete from nav-cleanup — a file
        // inside the deleted subtree that also links to the route would
        // otherwise get a redundant replace_content op targeting a path that the
        // same batch deletes.
        const deletedPaths = new Set(routeFiles.map((p) => p.replace(/\\/g, "/")));
        const navFiles = files.filter((f) => !deletedPaths.has(f.name.replace(/\\/g, "/")));
        const ops: QuickEditClientOp[] = [
          ...routeFiles.map((path) => ({ kind: "delete_file" as const, path })),
          ...buildRemoveNavLinkOps(navFiles, route),
        ];
        const result = await runQuickEditChunked(
          chatId,
          versionId,
          ops,
          `Tog bort sidan ${route}`,
        );
        if (!result.ok) {
          toast.error(result.error || "Kunde inte ta bort sidan.");
          return;
        }
        toast.success(`Sidan ${route} togs bort.`);
        onFilesSaved?.({
          versionId: result.versionId,
          previewUrl: result.previewUrl,
          previewSessionId: result.previewSessionId,
          previewMode: result.previewMode,
        });
      } catch {
        toast.error("Något gick fel när sidan skulle tas bort.");
      } finally {
        pageOpInFlightRef.current = false;
        setPageOpBusy(false);
      }
    },
    [chatId, versionId, onFilesSaved, runQuickEditChunked],
  );

  /**
   * Snabbändringar skapar en ny minorversion, så den lokalt inlästa filbilden
   * blir gammal direkt. Utan omläsning skulle nästa klick klassificera mot en
   * text som redan är utbytt.
   */
  const reloadFilesForVersion = useCallback(
    async (targetVersionId: string) => {
      if (!chatId) return;
      try {
        const { response, data } = await fetchChatVersionFilesJson(chatId, targetVersionId);
        if (!response.ok || !Array.isArray(data?.files)) return;
        setFiles(
          buildFileTree(
            data.files.map((file) => ({
              name: file.name,
              content: file.content ?? "",
              locked: file.locked,
            })),
          ),
        );
      } catch {
        /* best-effort — klassificeringen faller tillbaka på "hittade inte elementet" */
      }
    },
    [chatId, setFiles],
  );

  /**
   * Alla direktåtgärder i elementmenyn går genom samma deterministiska väg:
   * quick-edit → ny minorversion → patchad preview. Ingen modell, ingen kodvy.
   */
  const applyInspectorEdit = useCallback(
    async (ops: QuickEditClientOp[], summary: string): Promise<boolean> => {
      if (!chatId || !versionId || ops.length === 0) return false;
      if (inspectEditInFlightRef.current) return false;
      inspectEditInFlightRef.current = true;
      setInspectEditBusy(true);
      setInspectEditError(null);
      try {
        const base = composerBaseVersionRef.current ?? versionId;
        const result = await quickEditChatFiles({
          chatId,
          baseVersionId: base,
          engineLatestKnownVersionId: base,
          ops,
          summary,
        });
        if (!result.ok) {
          const message = describeInspectQuickEditError(result);
          setInspectEditError(message);
          toast.error(message);
          return false;
        }
        composerBaseVersionRef.current = result.versionId;
        await reloadFilesForVersion(result.versionId);
        toast.success(summary);
        onFilesSaved?.({
          versionId: result.versionId,
          previewUrl: result.previewUrl,
          previewSessionId: result.previewSessionId,
          previewMode: result.previewMode,
        });
        return true;
      } catch {
        const message = "Ändringen kunde inte sparas.";
        setInspectEditError(message);
        toast.error(message);
        return false;
      } finally {
        inspectEditInFlightRef.current = false;
        setInspectEditBusy(false);
      }
    },
    [chatId, versionId, onFilesSaved, reloadFilesForVersion],
  );

  const handleInspectSaveText = useCallback(
    async (next: string) => {
      const menu = inspectMenu;
      if (!menu?.actions.editText.available) return;
      const invalid = validateInspectTextInput(next);
      if (invalid) {
        setInspectEditError(invalid);
        return;
      }
      const ops = buildTextEditOps(menu.actions.editText.target, next);
      if (ops.length === 0) {
        setInspectMenu(null);
        return;
      }
      const saved = await applyInspectorEdit(ops, "Texten uppdaterades");
      if (saved) setInspectMenu(null);
    },
    [inspectMenu, applyInspectorEdit],
  );

  const handleInspectReplaceImage = useCallback(
    async (url: string) => {
      const menu = inspectMenu;
      if (!menu?.actions.replaceImage.available) return;
      const target = menu.actions.replaceImage.target;
      const invalid = validateInspectImageInput(url, target.quote);
      if (invalid) {
        toast.error(invalid);
        return;
      }
      const ops = buildImageEditOps(target, url);
      if (ops.length === 0) {
        setInspectMenu(null);
        return;
      }
      const saved = await applyInspectorEdit(ops, "Bilden byttes ut");
      setInspectMenu((current) => (saved || !current ? null : { ...current, mode: "menu" }));
    },
    [inspectMenu, applyInspectorEdit],
  );

  const handleInspectDeleteElement = useCallback(async () => {
    const menu = inspectMenu;
    if (!menu?.actions.deleteElement.available) return;
    const saved = await applyInspectorEdit(
      buildDeleteElementOps(menu.actions.deleteElement.target),
      "Elementet togs bort",
    );
    if (saved) setInspectMenu(null);
  }, [inspectMenu, applyInspectorEdit]);

  const handleInspectSendPoint = useCallback(() => {
    const menu = inspectMenu;
    if (!menu) return;
    dispatchBridgeInspectPoint(menu.pick, previewUrl);
    const match = menu.pick.match;
    toast.success(
      `Punkt tillagd i chatten: <${menu.pick.element.tag}>${match ? ` i ${match.item.filePath}:${match.item.lineNumber}` : ""}`,
    );
    setInspectMenu(null);
    setInspectMode(false);
  }, [inspectMenu, previewUrl, setInspectMode]);

  const handleInspectShowInCode = useCallback(() => {
    const match = inspectMenu?.pick.match;
    if (!match) return;
    setInspectMenu(null);
    showMatchInCode(match);
  }, [inspectMenu, showMatchInCode]);

  const handleInspectRegionSendPoints = useCallback(() => {
    const region = inspectRegion?.region;
    if (!region || region.elements.length === 0) return;
    const selected = region.elements.slice(0, MAX_REGION_POINTS);
    for (const entry of selected) {
      const rect = entry.element.rect ?? null;
      dispatchBridgeInspectPoint(
        {
          element: entry.element,
          match: entry.match,
          rect,
          click: {
            x: (rect?.x ?? 0) + (rect?.width ?? 0) / 2,
            y: (rect?.y ?? 0) + (rect?.height ?? 0) / 2,
          },
          viewport: region.viewport,
        },
        previewUrl,
      );
    }
    toast.success(
      selected.length === region.elements.length
        ? `${selected.length} punkter tillagda i chatten.`
        : `${selected.length} av ${region.elements.length} punkter tillagda i chatten.`,
    );
    setInspectRegion(null);
    setInspectMode(false);
  }, [inspectRegion, previewUrl, setInspectMode]);

  /**
   * Bild av den uppdragna ytan, bifogad i chatten.
   *
   * Punktvägen finns redan och tar en fast 420×280-ruta runt en koordinat.
   * Den duger för "vad är det här elementet?" men inte för "titta på den här
   * ytan": användaren har redan sagt exakt vilken yta som menas genom att dra
   * rutan, och den avgränsningen är hela poängen. Regionen skickas därför i
   * procent till samma route, som klipper precis den och hoppar över
   * hårkorset — bilden ÄR markeringen.
   */
  const handleInspectRegionSendImage = useCallback(async () => {
    const state = inspectRegion;
    if (!state || !previewUrl || regionImagePending) return;
    const { rect, viewport, scroll } = state.region;
    if (viewport.w <= 0 || viewport.h <= 0) return;

    const captureId = `region-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const centerXPercent = Number((((rect.x + rect.width / 2) / viewport.w) * 100).toFixed(2));
    const centerYPercent = Number((((rect.y + rect.height / 2) / viewport.h) * 100).toFixed(2));

    setRegionImagePending(true);
    try {
      const response = await fetch("/api/inspector-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: previewUrl,
          xPercent: centerXPercent,
          yPercent: centerYPercent,
          viewportWidth: Math.round(viewport.w),
          viewportHeight: Math.round(viewport.h),
          // Rektangeln är viewport-relativ, så fångsten måste rulla dit först
          // — annars fotograferar den sidans topp och kallar det markeringen.
          scrollX: scroll.x,
          scrollY: scroll.y,
          region: {
            xPercent: Number(((rect.x / viewport.w) * 100).toFixed(2)),
            yPercent: Number(((rect.y / viewport.h) * 100).toFixed(2)),
            widthPercent: Number(((rect.width / viewport.w) * 100).toFixed(2)),
            heightPercent: Number(((rect.height / viewport.h) * 100).toFixed(2)),
          },
        }),
      });
      const data = (await response.json().catch(() => null)) as CaptureResponse | null;

      if (!response.ok || !data?.previewDataUrl) {
        toast.error(data?.error || "Kunde inte ta bild av ytan.");
        return;
      }

      dispatchInspectCaptureEvent({
        id: captureId,
        demoUrl: previewUrl,
        xPercent: centerXPercent,
        yPercent: centerYPercent,
        viewportWidth: Math.round(viewport.w),
        viewportHeight: Math.round(viewport.h),
        capturedUrl: data.capturedUrl,
        previewDataUrl: data.previewDataUrl,
        pointSummary:
          data.pointSummary ??
          `Markerad yta ${Math.round(rect.width)}×${Math.round(rect.height)} px`,
        clip: data.clip,
        source: data.source,
      });
      toast.success("Bild av ytan tillagd i chatten.");
      setInspectRegion(null);
      setInspectMode(false);
    } catch {
      toast.error("Nätverksfel när bilden skulle tas.");
    } finally {
      setRegionImagePending(false);
    }
  }, [inspectRegion, previewUrl, regionImagePending, setInspectMode]);

  const blobStatus = useMemo(
    () => integrationStatus?.items.find((item) => item.id === "vercel-blob") || null,
    [integrationStatus],
  );
  const isTier2LivePreview = useMemo(() => {
    if (!previewUrl) return false;
    return isTier2LivePreviewUrl(previewUrl);
  }, [previewUrl]);

  usePreviewHeartbeat({
    chatId,
    versionId,
    previewUrl,
    activePreviewSessionId,
    previewLifecycle,
    onSessionSuspect: onPreviewSessionSuspect,
  });

  const handleIframeError = useCallback(() => {
    clearPreviewReadyTimer();
    setIframeLoading(false);
    setIframeError(true);
    setIframeDiagnosticCode("preview_transport_error");
    setIframeErrorMessage(describePreviewDiagnosticCode("preview_transport_error"));
    if (isTier2LivePreview) {
      onPreviewSessionSuspect?.();
    }
    if (isOwnEnginePreview) {
      reportOwnEngineRenderFailure({
        message: "Preview iframe failed to load.",
        kind: "transport",
        code: "preview_transport_error",
        stage: "iframe",
        source: "preview-iframe",
      });
    }
  }, [
    clearPreviewReadyTimer,
    isOwnEnginePreview,
    isTier2LivePreview,
    onPreviewSessionSuspect,
    reportOwnEngineRenderFailure,
    setIframeLoading,
    setIframeError,
    setIframeDiagnosticCode,
    setIframeErrorMessage,
  ]);

  const isV0Preview = Boolean(
    previewUrl && !isOwnEnginePreview && previewUrl.includes("vusercontent.net"),
  );
  /** +/- page controls: own-engine/tier-2 design versions only (F3 declines quick-edit). */
  const canManagePages = Boolean(
    chatId && versionId && !isV0Preview && lifecycleStage !== "integrations",
  );
  const isLoading = externalLoading || iframeLoading;
  const previewSrc = useMemo(() => {
    if (!previewUrl) return "";
    return withInspectParam(buildPreviewSrc(previewUrl, refreshToken), previewUrl);
  }, [previewUrl, refreshToken, buildPreviewSrc, withInspectParam]);
  const showBlobWarning = Boolean(
    previewUrl && !isOwnEnginePreview && blobStatus && !blobStatus.enabled,
  );
  const showExternalWarning = Boolean(previewUrl && isV0Preview);
  const showImagesDisabledWarning = Boolean(previewUrl && !imageGenerationsEnabled);
  const showImagesUnsupportedWarning = Boolean(
    previewUrl && imageGenerationsEnabled && !imageGenerationsSupported,
  );
  const showBlobConfigWarning = Boolean(previewUrl && imageGenerationsEnabled && !isBlobConfigured);
  /** Tier 2: one user-facing strip for media/env limits — no env-var name dump (`llm-pipeline.md`). */
  const showPreviewUnifiedStrip = Boolean(
    !isCodeView &&
      previewUrl &&
      !isOwnEnginePreview &&
      isTier2LivePreview &&
      (showBlobWarning ||
        showBlobConfigWarning ||
        integrationError ||
        showImagesDisabledWarning ||
        showImagesUnsupportedWarning),
  );
  const showPlacementOverlay = inspectorEnabled && effectivePlacementMode && Boolean(previewUrl);
  const showComposerOverlay =
    composerMode && Boolean(previewUrl) && !effectivePlacementMode && !isCodeView;
  // Bridge-engine renderar INTE den täckande overlayn — preview-iframen måste
  // få mus-eventen själv (det injicerade scriptet ritar highlight + postar pick).
  const showInspectOverlay =
    inspectorEnabled && inspectMode && !showPlacementOverlay && inspectEngine !== "bridge";
  const shouldRenderInspectorDev = inspectorEnabled && (showPlacementOverlay || showInspectOverlay);
  // Bildbytet går genom projektets mediabibliotek. Är biblioteket avstängt är
  // raden gråad med det skälet i stället för att öppna en tom låda.
  const inspectMenuActions = useMemo(() => {
    if (!inspectMenu) return null;
    const actions = inspectMenu.actions;
    if (actions.replaceImage.available && !isBlobConfigured) {
      return {
        ...actions,
        replaceImage: {
          available: false as const,
          reason: "Bildbiblioteket är inte påslaget för det här projektet.",
        },
      };
    }
    return actions;
  }, [inspectMenu, isBlobConfigured]);
  const inspectEditorRect = useMemo(() => {
    if (!inspectMenu) return null;
    return (
      inspectMenu.rect ?? { x: inspectMenu.point.x, y: inspectMenu.point.y, width: 0, height: 0 }
    );
  }, [inspectMenu]);
  const handleShowLastCodeMatch = useCallback(() => {
    if (!lastCodeMatch) return;
    setInspectMode(false);
    runViewSwitch(() => {
      setViewMode("registry");
      setSelectedRegistryId(lastCodeMatch.item.id);
      setSelectedRegistryLine(lastCodeMatch.item.lineNumber);
      setSelectedPath(lastCodeMatch.item.filePath);
    });
  }, [
    lastCodeMatch,
    runViewSwitch,
    setInspectMode,
    setViewMode,
    setSelectedRegistryId,
    setSelectedRegistryLine,
    setSelectedPath,
  ]);
  const PreviewSurface = PreviewPanelFrame;

  if (!previewUrl && !isCodeView) {
    return (
      <PreviewPanelEmptyState
        chatId={chatId}
        versionId={versionId}
        designTheme={designTheme}
        onDesignThemeChange={onDesignThemeChange}
        themeLocked={themeLocked}
        versionlessAborted={versionlessAborted}
        onRestartGeneration={onRestartGeneration}
        externalLoading={externalLoading}
        awaitingInput={awaitingInput}
        awaitingInputQuestion={awaitingInputQuestion}
        awaitingInputOptions={awaitingInputOptions}
        previewPending={previewPending}
        previewBuildError={previewBuildError}
        previewLifecycle={previewLifecycle}
        activeVersionStatus={activeVersionStatus}
        activeVersionSummary={activeVersionSummary}
        activeVersionIsLatest={activeVersionIsLatest}
        activeVersionRepairPassIndex={activeVersionRepairPassIndex}
        onFixPreview={onFixPreview}
        isGenerating={isGenerating}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-black/40">
      <PreviewPanelChrome
        previewUrl={previewUrl}
        isOwnEnginePreview={isOwnEnginePreview}
        isTier2LivePreview={isTier2LivePreview}
        previewBuildError={previewBuildError}
        previewProdBuild={previewProdBuild}
        previewPending={previewPending}
        previewLifecycle={previewLifecycle}
        activeVersionStatus={activeVersionStatus}
        activeVersionSummary={activeVersionSummary}
        activeVersionIsLatest={activeVersionIsLatest}
        activeVersionRepairPassIndex={activeVersionRepairPassIndex}
        iframeError={iframeError}
        iframeErrorMessage={iframeErrorMessage}
        isCodeView={isCodeView}
        previewRoutesLoading={previewRoutesLoading}
        previewRoutes={previewRoutes}
        activePreviewRoute={activePreviewRoute}
        handleNavigateRoute={handleNavigateRoute}
        canManagePages={canManagePages}
        pageOpBusy={pageOpBusy}
        onAddPage={handleAddPage}
        onRemovePage={handleRemovePage}
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
                disabled={!previewUrl || effectivePlacementMode || composerHistoryBusy}
                onDragStart={() => setIsComposerDragging(true)}
                onDragEnd={() => setIsComposerDragging(false)}
                onInsertShadcnItem={onShadcnItemInsert}
                onPickPlacement={
                  onShadcnItemInsert ? handlePickShadcnPlacement : undefined
                }
              />
            ) : (
              <PreviewPanelComposerPalette
                disabled={!previewUrl || effectivePlacementMode || composerHistoryBusy}
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
                  canUndo={composerUndoStack.length > 0}
                  canRedo={composerRedoStack.length > 0}
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
                  pendingPlacementItem={effectivePendingPlacementItem}
                  elementMapLoading={elementMapLoading}
                  sectionZonesCount={sectionZones.length}
                  isCapturePending={isCapturePending}
                  handleCaptureClick={handleCaptureClick}
                  handleInspectMouseMove={
                    inspectEngine === "map" && elementMap.length > 0 ? handleInspectMouseMove : undefined
                  }
                  onInspectMouseLeave={
                    inspectEngine === "map" ? () => setHoveredMapElement(null) : undefined
                  }
                  inspectEngine={inspectEngine}
                  hoveredMapElement={hoveredMapElement}
                  inspectPulse={inspectPulse}
                  setInspectEngine={setInspectEngine}
                  inspectorUnavailable={inspectorUnavailable}
                  elementMapCount={elementMap.length}
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
