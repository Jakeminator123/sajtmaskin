"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { buildFileTree } from "@/lib/builder/file-tree";
import { isBuilderInspectorEnabled } from "@/lib/builder/inspector-feature";
import {
  INSPECT_BRIDGE_QUERY_PARAM,
  isInspectBridgeEnabled,
} from "@/lib/builder/inspect-bridge-feature";
import { reportPreviewClientError } from "@/lib/builder/preview-client-error-report";
import type { PlacementSelectEventDetail } from "@/lib/builder/inspect-events";
import { resolveHomePageFilePath } from "@/lib/builder/page-block-patch";
import type {
  ShadcnInsertSelection,
  ShadcnPlacementPickResult,
} from "@/lib/builder/shadcn-insert";
import type { FileNode } from "@/lib/builder/types";
import { buildJsxElementRegistry, type RegistryMatch } from "@/lib/builder/jsx-element-registry";
import { isAddPanelEnabled } from "@/lib/builder/add-panel-feature";
import { PreviewPanelEmptyState } from "./PreviewPanelEmptyState";
import { PreviewPanelSurface } from "./runtime/PreviewPanelSurface";
import type { PreviewIssuePayload } from "./runtime/iframe-diagnostics";
import { fetchChatVersionFilesJson } from "./code/chat-version-files-fetch";
import { usePreviewHeartbeat } from "./runtime/usePreviewHeartbeat";
import { usePreviewIframe } from "./runtime/usePreviewIframe";
import { usePreviewPanelCodeDrafts } from "./code/usePreviewPanelCodeDrafts";
import { usePreviewPanelInspectCapture } from "./inspect/usePreviewPanelInspectCapture";
import { usePreviewPanelInspectMapPlacement } from "./inspect/usePreviewPanelInspectMapPlacement";
import {
  usePreviewInspectBridge,
  type BridgePick,
  type BridgeRect,
  type BridgeRegion,
} from "./inspect/usePreviewInspectBridge";
import { classifyInspectedElement } from "@/lib/builder/inspect-element-actions";
import { usePreviewPanelCodeFiles } from "./code/usePreviewPanelCodeFiles";
import { usePreviewPanelPreviewRoutes } from "./pages/usePreviewPanelPreviewRoutes";
import { usePreviewPanelComposerActions } from "./composer/usePreviewPanelComposerActions";
import { usePreviewPanelPageActions } from "./pages/usePreviewPanelPageActions";
import { usePreviewPanelInspectorActions } from "./inspect/usePreviewPanelInspectorActions";
import type {
  InspectEngine,
  PreviewPanelProps,
} from "./preview-panel-types";
import type {
  InspectMenuState,
  InspectRegionState,
} from "./inspect/preview-panel-inspect-types";
import { usePreviewSurfaceMode } from "./usePreviewSurfaceMode";
import {
  buildExternalRoutePreviewUrl,
  buildOwnEngineRoutePreviewUrl,
  extractTier2AppRoute,
} from "./pages/preview-route-helpers";
import { findFileNodeByPath } from "./code/code-file-tree-utils";
import { useIntegrationStatus } from "@/lib/hooks/useIntegrationStatus";
import { isCompatibilityShimPreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";
import { isTier2LivePreviewUrl } from "@/lib/gen/preview/preview-url-classifier";
import { describePreviewDiagnosticCode, previewRunbookLinesForCode } from "@/lib/gen/preview/diagnostics";

/**
 * Preview panel facade. Own-engine/tier-2 preview surface that composes
 * composer-, page- and inspector-actions plus the surface/overlays module.
 * Public export surface is unchanged (`export function PreviewPanel`).
 */
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
  // Server-snapshot false + klient-läsning undviker SSR/CSR-hydratmismatch (samma
  // intent som inspect-bridge-flaggan). Flagga av = dagens fristående Composer-palette.
  const addPanelEnabled = useSyncExternalStore(
    () => () => {},
    () => isAddPanelEnabled(),
    () => false,
  );
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
  const selectedFile = useMemo(() => {
    if (!selectedPath) return null;
    return findFileNodeByPath(files, selectedPath);
  }, [files, selectedPath]);

  const codeDrafts = usePreviewPanelCodeDrafts({ selectedFile, saveSelectedFileContent });

  const [selectedRegistryId, setSelectedRegistryId] = useState<string | null>(null);
  const [selectedRegistryLine, setSelectedRegistryLine] = useState<number | null>(null);
  const { integrationStatus, integrationError } = useIntegrationStatus(previewUrl);
  const bridgeEnabled = inspectorEnabled && isInspectBridgeEnabled();
  const [inspectEngine, setInspectEngine] = useState<InspectEngine>(
    bridgeEnabled ? "bridge" : "map",
  );
  // Bara en automatisk nedfällning får återhämtas. Ett manuellt motorval (map/
  // ai/playwright i inspektorpanelen) ska inte ryckas tillbaka av ett sent `ready`.
  const autoFellBackFromBridgeRef = useRef(false);
  const selectInspectEngine = useCallback(
    (engine: InspectEngine) => {
      // Ett klick på den redan valda motorn är inget val — hade det räknats
      // skulle en felklick på Map släcka återhämtningen och lämna inspektorn
      // död i prod, där kartan är 503.
      if (engine !== inspectEngine) autoFellBackFromBridgeRef.current = false;
      setInspectEngine(engine);
    },
    [inspectEngine],
  );
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
    if (!chatSwitched && !versionSwitched) return;
    /* eslint-disable react-hooks/set-state-in-effect -- abort stale placement pick when chat/version switches mid-pick */
    resolveShadcnPlacementPick("aborted");
    /* eslint-enable react-hooks/set-state-in-effect */
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

  // Startsida för kodbaserad sektionszon-fallback (drag/placement utan bridge-zoner).
  const homePageCode = useMemo(() => {
    const flat: Array<{ name: string; content: string }> = [];
    const walk = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.type === "file" && node.content) {
          flat.push({ name: node.path, content: node.content });
        }
        if (node.children?.length) walk(node.children);
      }
    };
    walk(files);
    const path = resolveHomePageFilePath(flat);
    if (!path) return null;
    return flat.find((f) => f.name === path)?.content ?? null;
  }, [files]);

  useEffect(() => {
    if (!composerMode && !effectivePlacementMode) return;
    void fetchFilesForRegistry();
  }, [composerMode, effectivePlacementMode, fetchFilesForRegistry]);

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
    sectionZonesApproximate,
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
    homePageCode,
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

  const handleBridgeClientError = useCallback(
    (payload: unknown) => {
      reportPreviewClientError(chatId, versionId, payload);
    },
    [chatId, versionId],
  );

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
    onClientError: handleBridgeClientError,
    // A-fix (#164/#197): bron annonserade aldrig `ready` → previewn saknar
    // injektionen. Växla till kartmotorn i stället för en inert inspektor.
    onBridgeUnavailable: () => {
      autoFellBackFromBridgeRef.current = true;
      setInspectEngine("map");
    },
    // Kommer `ready` sent (VM:en bootade klart och iframen laddades om) tas
    // sessionen tillbaka till bron i stället för att sitta fast i en död karta.
    onBridgeReady: () => {
      if (!autoFellBackFromBridgeRef.current) return;
      autoFellBackFromBridgeRef.current = false;
      setInspectEngine("bridge");
      setInspectStatus("Inspektera: klicka på ett element i previewn.");
    },
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
    /* eslint-disable react-hooks/set-state-in-effect -- drop floating inspect UI when leaving inspect mode */
    setInspectMenu(null);
    setInspectRegion(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [inspectMode]);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- drop floating inspect UI when preview identity or code view changes */
    setInspectMenu(null);
    setInspectRegion(null);
    /* eslint-enable react-hooks/set-state-in-effect */
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
    /* eslint-disable react-hooks/set-state-in-effect -- clear registry selection when switching to code view */
    setSelectedRegistryId(null);
    setSelectedRegistryLine(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [viewMode]);

  const {
    isComposerDragging,
    setIsComposerDragging,
    composerUndoStack,
    composerRedoStack,
    composerHistoryBusy,
    lastComposerActionLabel,
    composerBaseVersionRef,
    handleComposerDragOver,
    handleComposerUndo,
    handleComposerRedo,
    handleComposerDrop,
  } = usePreviewPanelComposerActions({
    chatId,
    versionId,
    composerMode,
    sectionZones,
    sectionZonesApproximate,
    iframeLoading,
    externalLoading,
    handlePlacementMouseMove,
    setHoveredPlacement,
    onComposerAiFallback,
    onShadcnItemInsert,
    onFilesSaved,
  });

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

  const { pageOpBusy, handleAddPage, handleRemovePage } = usePreviewPanelPageActions({
    chatId,
    versionId,
    onFilesSaved,
  });

  const {
    handleInspectSaveText,
    handleInspectReplaceImage,
    handleInspectDeleteElement,
    handleInspectSendPoint,
    handleInspectShowInCode,
    handleInspectRegionSendPoints,
    handleInspectRegionSendImage,
    inspectMenuActions,
    inspectEditorRect,
    handleShowLastCodeMatch,
  } = usePreviewPanelInspectorActions({
    chatId,
    versionId,
    previewUrl,
    isBlobConfigured,
    inspectMenu,
    setInspectMenu,
    inspectRegion,
    setInspectRegion,
    setInspectMode,
    setFiles,
    composerBaseVersionRef,
    onFilesSaved,
    showMatchInCode,
    lastCodeMatch,
    runViewSwitch,
    setViewMode,
    setSelectedRegistryId,
    setSelectedRegistryLine,
    setSelectedPath,
    regionImagePending,
    setRegionImagePending,
    setInspectEditBusy,
    setInspectEditError,
    inspectEditInFlightRef,
  });

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
    <PreviewPanelSurface
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
      showPreviewUnifiedStrip={showPreviewUnifiedStrip}
      showBlobWarning={showBlobWarning}
      showBlobConfigWarning={showBlobConfigWarning}
      integrationError={integrationError}
      showImagesDisabledWarning={showImagesDisabledWarning}
      showImagesUnsupportedWarning={showImagesUnsupportedWarning}
      showExternalWarning={showExternalWarning}
      showElementRegistry={showElementRegistry}
      elementRegistry={elementRegistry}
      selectedRegistryId={selectedRegistryId}
      filesLoading={filesLoading}
      filesError={filesError}
      setSelectedRegistryId={setSelectedRegistryId}
      setSelectedRegistryLine={setSelectedRegistryLine}
      setSelectedPath={setSelectedPath}
      files={files}
      selectedPath={selectedPath}
      codeScrollRef={codeScrollRef}
      selectedFile={selectedFile}
      codeDrafts={codeDrafts}
      selectedRegistryLine={selectedRegistryLine}
      composerMode={composerMode}
      addPanelEnabled={addPanelEnabled}
      placementMode={effectivePlacementMode}
      composerHistoryBusy={composerHistoryBusy}
      setIsComposerDragging={setIsComposerDragging}
      onShadcnItemInsert={onShadcnItemInsert}
      onPickPlacement={onShadcnItemInsert ? handlePickShadcnPlacement : undefined}
      isLoading={isLoading}
      iframeDiagnosticCode={iframeDiagnosticCode}
      iframeRunbookLines={iframeRunbookLines}
      handleOpenInNewTab={handleOpenInNewTab}
      onFixPreview={onFixPreview}
      previewSrc={previewSrc}
      iframeRef={iframeRef}
      handleIframeLoad={handleIframeLoad}
      handleIframeError={handleIframeError}
      versionMismatchPayload={versionMismatchPayload}
      onForcePreviewResync={onForcePreviewResync}
      onPreviewSessionSuspect={onPreviewSessionSuspect}
      showComposerOverlay={showComposerOverlay}
      iframeLoading={iframeLoading}
      externalLoading={externalLoading}
      isComposerDragging={isComposerDragging}
      hoveredPlacement={hoveredPlacement}
      handleComposerDragOver={handleComposerDragOver}
      setHoveredPlacement={setHoveredPlacement}
      handleComposerDrop={handleComposerDrop}
      handlePlacementMouseMove={handlePlacementMouseMove}
      lastComposerActionLabel={lastComposerActionLabel}
      composerUndoStackLength={composerUndoStack.length}
      composerRedoStackLength={composerRedoStack.length}
      handleComposerUndo={handleComposerUndo}
      handleComposerRedo={handleComposerRedo}
      shouldRenderInspectorDev={shouldRenderInspectorDev}
      showPlacementOverlay={showPlacementOverlay}
      showInspectOverlay={showInspectOverlay}
      handlePlacementClick={handlePlacementClick}
      pendingPlacementItem={effectivePendingPlacementItem}
      elementMapLoading={elementMapLoading}
      sectionZonesCount={sectionZones.length}
      isCapturePending={isCapturePending}
      handleCaptureClick={handleCaptureClick}
      handleInspectMouseMove={handleInspectMouseMove}
      setHoveredMapElement={setHoveredMapElement}
      inspectEngine={inspectEngine}
      hoveredMapElement={hoveredMapElement}
      inspectPulse={inspectPulse}
      setInspectEngine={selectInspectEngine}
      inspectorUnavailable={inspectorUnavailable}
      elementMapCount={elementMap.length}
      totalAiCostUsd={totalAiCostUsd}
      lastAiCostDisplay={lastAiCostDisplay}
      inspectStatus={inspectStatus}
      lastCodeMatch={lastCodeMatch}
      handleShowLastCodeMatch={handleShowLastCodeMatch}
      handleToggleInspect={handleToggleInspect}
      inspectMenu={inspectMenu}
      inspectMenuActions={inspectMenuActions}
      inspectEditBusy={inspectEditBusy}
      handleInspectDeleteElement={handleInspectDeleteElement}
      handleInspectSendPoint={handleInspectSendPoint}
      handleInspectShowInCode={handleInspectShowInCode}
      setInspectMenu={setInspectMenu}
      inspectEditorRect={inspectEditorRect}
      inspectEditError={inspectEditError}
      handleInspectSaveText={handleInspectSaveText}
      inspectRegion={inspectRegion}
      handleInspectRegionSendPoints={handleInspectRegionSendPoints}
      inspectorEnabled={inspectorEnabled}
      handleInspectRegionSendImage={handleInspectRegionSendImage}
      regionImagePending={regionImagePending}
      setInspectRegion={setInspectRegion}
      handleInspectReplaceImage={handleInspectReplaceImage}
      elementMap={elementMap}
    />
  );
}
