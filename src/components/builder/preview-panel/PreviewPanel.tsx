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
  useTransition,
  type DragEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { buildFileTree } from "@/lib/builder/fileTree";
import { isBuilderInspectorEnabled } from "@/lib/builder/inspector-feature";
import type { ElementMapItem, FileNode } from "@/lib/builder/types";
import { buildJsxElementRegistry, type RegistryMatch } from "@/lib/builder/jsx-element-registry";
import {
  buildComposerDropDetail,
  PAGE_BLOCK_DND_TYPE,
  PreviewPanelComposerOverlay,
  PreviewPanelComposerPalette,
} from "./PreviewPanelComposer";
import { PreviewPanelChrome } from "./PreviewPanelChrome";
import { PreviewPanelCode } from "./PreviewPanelCode";
import { PreviewPanelCodeSectionEditors } from "./PreviewPanelCodeSectionEditors";
import { PreviewPanelEmptyState } from "./PreviewPanelEmptyState";
import { PreviewPanelFrame } from "./PreviewPanelFrame";
import { GenerationProgress } from "./GenerationProgress";
import type { PreviewIssuePayload } from "./iframe-diagnostics";
import { fetchChatVersionFilesJson } from "./chat-version-files-fetch";
import { usePreviewHeartbeat } from "./hooks/usePreviewHeartbeat";
import { usePreviewIframe } from "./hooks/usePreviewIframe";
import { usePreviewPanelCodeDrafts } from "./hooks/usePreviewPanelCodeDrafts";
import { usePreviewPanelInspectCapture } from "./hooks/usePreviewPanelInspectCapture";
import { usePreviewPanelInspectMapPlacement } from "./hooks/usePreviewPanelInspectMapPlacement";
import { usePreviewPanelOwnEnginePreviewTelemetry } from "./hooks/usePreviewPanelOwnEnginePreviewTelemetry";
import { usePreviewPanelCodeFiles } from "./hooks/usePreviewPanelCodeFiles";
import { usePreviewPanelPreviewRoutes } from "./hooks/usePreviewPanelPreviewRoutes";
import type {
  ComposerAiFallbackPayload,
  InspectEngine,
  PreviewPanelProps,
  PreviewViewMode,
} from "./preview-panel-types";
import { findFileNodeByPath } from "./code-file-tree-utils";
import { useIntegrationStatus } from "@/lib/hooks/useIntegrationStatus";
import { EditModeOverlay, type EditModeClickEvent } from "./EditModeOverlay";
import { InlineEditPopup } from "./InlineEditPopup";
import {
  buildAlternatePreviewBannerState,
  isCompatibilityShimPreviewUrl,
  isTier2LivePreviewUrl,
} from "@/lib/gen/preview/legacy/compatibility-shim";
import { describePreviewDiagnosticCode, previewRunbookLinesForCode } from "@/lib/gen/preview/diagnostics";
import {
  buildOwnEngineRoutePreviewUrl,
  buildExternalRoutePreviewUrl,
  extractTier2AppRoute,
} from "./preview-route-helpers";
import { toast } from "sonner";
import { getPageBlockById } from "@/lib/builder/page-blocks-catalog";
import {
  resolveHomePageFilePath,
  tryInsertPageBlockIntoHomePage,
} from "@/lib/builder/page-block-patch";
import { patchEngineChatFile } from "@/lib/builder/engine-files-patch";

const PreviewPanelInspectorDev = dynamic(
  () =>
    import("./PreviewPanelInspectorDev").then((mod) => ({
      default: mod.PreviewPanelInspectorDev,
    })),
  { ssr: false },
);

type ComposerPatchHistoryEntry = {
  fileName: string;
  before: string;
  after: string;
};

export function PreviewPanel({
  chatId,
  versionId,
  previewUrl,
  alternatePreviewUrls,
  onNavigatePreviewUrl,
  isLoading: externalLoading = false,
  onClear,
  onFixPreview,
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
  onPreviewSessionSuspect,
  placementMode = false,
  pendingPlacementItem = null,
  onPlacementComplete,
  simplified = false,
  onComposerAiFallback,
  generationPhase,
  onInlineEditPrompt,
  onSuggestionClick,
  onBuildOutRouteRequest,
}: PreviewPanelProps) {
  const [viewMode, setViewMode] = useState<PreviewViewMode>("preview");
  const isCodeView = viewMode !== "preview";
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [composerMode, setComposerMode] = useState(false);
  const [inlineEditMode, setInlineEditMode] = useState(false);
  const [inlineEditTarget, setInlineEditTarget] = useState<{
    element: ElementMapItem;
    posX: number;
    posY: number;
    containerWidth: number;
    containerHeight: number;
  } | null>(null);
  const [isComposerDragging, setIsComposerDragging] = useState(false);
  const [composerUndoStack, setComposerUndoStack] = useState<ComposerPatchHistoryEntry[]>([]);
  const [composerRedoStack, setComposerRedoStack] = useState<ComposerPatchHistoryEntry[]>([]);
  const [composerHistoryBusy, setComposerHistoryBusy] = useState(false);
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
  const { previewRoutes, previewRoutesLoading, shellRoutePaths } = usePreviewPanelPreviewRoutes(
    chatId,
    versionId,
  );
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
  const inspectorEnabled = isBuilderInspectorEnabled();
  const [isViewSwitchPending, startViewSwitchTransition] = useTransition();
  const [inspectEngine, setInspectEngine] = useState<InspectEngine>("map");
  const [inspectStatus, setInspectStatus] = useState<string | null>(null);
  const [lastCodeMatch, setLastCodeMatch] = useState<RegistryMatch | null>(null);
  const [lastAiCostDisplay, setLastAiCostDisplay] = useState<string | null>(null);
  const [totalAiCostUsd, setTotalAiCostUsd] = useState(0);
  const codeScrollRef = useRef<HTMLDivElement | null>(null);
  const elementRegistryRef = useRef<ReturnType<typeof buildJsxElementRegistry>>([]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const reportOwnEngineRenderFailureSinkRef = useRef<(payload: PreviewIssuePayload) => void>(() => {});
  const reportOwnEngineRenderFailure = useCallback((payload: PreviewIssuePayload) => {
    reportOwnEngineRenderFailureSinkRef.current(payload);
  }, []);

  const buildPreviewSrc = useCallback((url: string, token?: number) => {
    let src = url;
    if (token) {
      const separator = src.includes("?") ? "&" : "?";
      src = `${src}${separator}t=${token}`;
    }
    return src;
  }, []);

  const isOwnEnginePreview = useMemo(() => {
    if (!previewUrl) return false;
    return isCompatibilityShimPreviewUrl(previewUrl);
  }, [previewUrl]);

  const triggerBuildOut = useCallback(
    (routePath: string) => {
      if (!routePath) return;
      if (onBuildOutRouteRequest) {
        onBuildOutRouteRequest(routePath);
        return;
      }
      onSuggestionClick?.(
        `Bygg ut sidan ${routePath} med fullt innehåll och design som matchar resten av sajten.`,
      );
    },
    [onBuildOutRouteRequest, onSuggestionClick],
  );

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
    hasEverLoaded: iframeHasEverLoaded,
    vmReady,
    markVmReady,
    notifyPreviewStarting,
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

  usePreviewPanelOwnEnginePreviewTelemetry({
    chatId,
    versionId,
    previewUrl,
    iframeRef,
    setIframeLoading,
    setIframeError,
    setIframeErrorMessage,
    onNavigatePreviewUrl,
    onBuildOutRouteRequest: (path) => triggerBuildOut(path),
    onPreviewLifecycleChange: (phase) => {
      if (phase === "ready") {
        markVmReady();
        return;
      }
      if (phase === "starting") {
        // Preview-hostens fallback-stub har just renderats i iframen. Tala
        // om det för iframe-hooken så att efterföljande onLoad inte
        // felaktigt markerar VM:en som klar under cross-origin-boot.
        notifyPreviewStarting();
      }
    },
    reportOwnEngineRenderFailureSinkRef,
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
    if (placementMode) {
      setComposerMode(false);
      setInlineEditMode(false);
      setInlineEditTarget(null);
    }
  }, [placementMode]);

  useEffect(() => {
    if (isCodeView) {
      setComposerMode(false);
      setInlineEditMode(false);
      setInlineEditTarget(null);
    }
  }, [isCodeView]);

  useEffect(() => {
    setComposerUndoStack([]);
    setComposerRedoStack([]);
    setComposerHistoryBusy(false);
    setLastComposerActionLabel(null);
    setInlineEditMode(false);
    setInlineEditTarget(null);
  }, [chatId, versionId]);

  useEffect(() => {
    if (!composerMode) {
      setIsComposerDragging(false);
    }
  }, [composerMode]);

  const {
    inspectMode,
    setInspectMode,
    elementMap,
    elementMapLoading,
    inspectorUnavailable,
    hoveredMapElement,
    setHoveredMapElement,
    hoveredPlacement,
    setHoveredPlacement,
    handleToggleInspect,
    sectionZones,
    handlePlacementMouseMove,
    handlePlacementClick,
    handleInspectMouseMove,
  } = usePreviewPanelInspectMapPlacement({
    inspectorEnabled,
    previewUrl,
    versionId,
    placementMode: Boolean(placementMode),
    composerMode,
    inlineEditMode,
    iframeLoading,
    externalLoading,
    iframeRef,
    buildPreviewSrc,
    setIframeLoading,
    setIframeError,
    setIframeErrorMessage,
    fetchFilesForRegistry,
    setInspectStatus,
    setLastCodeMatch,
    onPlacementComplete,
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

  const iframeRunbookLines = useMemo(
    () => (iframeError ? previewRunbookLinesForCode(iframeDiagnosticCode) : []),
    [iframeError, iframeDiagnosticCode],
  );

  const canShowCode = Boolean(chatId && versionId);
  const showElementRegistry = viewMode === "registry";

  const handleToggleCode = useCallback(() => {
    if (!canShowCode) return;
    startViewSwitchTransition(() => {
      setViewMode((prev) => (prev === "code" ? "preview" : "code"));
      setSelectedRegistryId(null);
      setSelectedRegistryLine(null);
    });
  }, [canShowCode, startViewSwitchTransition]);

  const handleToggleComposer = useCallback(() => {
    if (!previewUrl || placementMode) return;
    setInspectMode(false);
    setInlineEditMode(false);
    setInlineEditTarget(null);
    setComposerMode((v) => !v);
  }, [previewUrl, placementMode, setInspectMode]);

  const handleToggleInlineEdit = useCallback(() => {
    if (!previewUrl || placementMode) return;
    setComposerMode(false);
    setInspectMode(false);
    setInlineEditTarget(null);
    setInlineEditMode((v) => !v);
  }, [previewUrl, placementMode, setInspectMode]);

  const handleInlineEditClick = useCallback((event: EditModeClickEvent) => {
    setInlineEditTarget({
      element: event.element,
      posX: event.clientX - event.containerRect.left,
      posY: event.clientY - event.containerRect.top,
      containerWidth: event.containerRect.width,
      containerHeight: event.containerRect.height,
    });
  }, []);

  const handleInlineEditSave = useCallback((prompt: string, file?: File) => {
    setInlineEditTarget(null);
    setInlineEditMode(false);
    onInlineEditPrompt?.(prompt, file);
  }, [onInlineEditPrompt]);

  const handleComposerDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

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

  const handleComposerUndo = useCallback(async () => {
    if (!chatId || !versionId || composerHistoryBusy) return;
    const last = composerUndoStack[composerUndoStack.length - 1];
    if (!last) return;

    setComposerHistoryBusy(true);
    try {
      const saved = await patchEngineChatFile({
        chatId,
        versionId,
        fileName: last.fileName,
        content: last.before,
      });
      if (!saved.ok) {
        toast.error(saved.error);
        return;
      }
      setComposerUndoStack((prev) => prev.slice(0, -1));
      setComposerRedoStack((prev) => [last, ...prev].slice(0, 20));
      setLastComposerActionLabel("Ångra direkt patch");
      toast.success("Senaste composer-patch ångrad.");
      onFilesSaved?.();
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
      const saved = await patchEngineChatFile({
        chatId,
        versionId,
        fileName: next.fileName,
        content: next.after,
      });
      if (!saved.ok) {
        toast.error(saved.error);
        return;
      }
      setComposerRedoStack((prev) => prev.slice(1));
      setComposerUndoStack((prev) => [...prev.slice(-19), next]);
      setLastComposerActionLabel("Gör om direkt patch");
      toast.success("Composer-patch återställd igen.");
      onFilesSaved?.();
    } finally {
      setComposerHistoryBusy(false);
    }
  }, [chatId, versionId, composerHistoryBusy, composerRedoStack, onFilesSaved]);

  const handleComposerDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsComposerDragging(false);
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

      try {
        const { response, data } = await fetchChatVersionFilesJson(chatId, versionId);
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
          versionId,
          fileName: path,
          content: patchResult.content,
        });

        if (!saved.ok) {
          toast.error(saved.error);
          await runComposerAiFallback({
            ...fallbackBase,
            homePageContent,
          });
          return;
        }

        setComposerUndoStack((prev) => [
          ...prev.slice(-19),
          { fileName: path, before: homePageContent, after: patchResult.content },
        ]);
        setComposerRedoStack([]);
        setLastComposerActionLabel(`Direkt patch (${detail.placementLabel})`);
        toast.success(`Sektion infogad direkt (${path})`);
        onFilesSaved?.();
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
    ],
  );

  const handleToggleElementRegistry = useCallback(() => {
    if (!canShowCode) return;
    startViewSwitchTransition(() => {
      setViewMode((prev) => (prev === "registry" ? "preview" : "registry"));
    });
  }, [canShowCode, startViewSwitchTransition]);

  const elementRegistry = useMemo(() => buildJsxElementRegistry(files), [files]);
  elementRegistryRef.current = elementRegistry;

  useEffect(() => {
    if (!showElementRegistry || !selectedRegistryLine) return;
    const container = codeScrollRef.current;
    if (!container) return;
    const approxLineHeight = 18;
    container.scrollTo({
      top: Math.max(0, (selectedRegistryLine - 4) * approxLineHeight),
      behavior: "smooth",
    });
  }, [showElementRegistry, selectedRegistryLine, selectedPath]);

  const handleRefresh = () => {
    clearPreviewReadyTimer();
    setIframeLoading(true);
    setIframeError(false);
    setIframeErrorMessage(null);
    const iframe = iframeRef.current;
    if (iframe) {
      const base = previewUrl || iframe.src;
      if (!base) return;
      iframe.src = buildPreviewSrc(base, Date.now());
    }
  };

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
      onNavigatePreviewUrl?.(nextUrl);
      setIframeLoading(true);
      setIframeError(false);
      setIframeErrorMessage(null);
    },
    [
      previewUrl,
      isOwnEnginePreview,
      onNavigatePreviewUrl,
      setIframeLoading,
      setIframeError,
      setIframeErrorMessage,
    ],
  );


  const handleClear = () => {
    if (!onClear) return;
    clearPreviewReadyTimer();
    setIframeLoading(true);
    setIframeError(false);
    setIframeErrorMessage(null);
    onClear();
  };

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
    activeSandboxId: activePreviewSessionId,
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
  /** True när versionen har en live-preview-URL sparad — då kan användaren byta till live-preview. */
  const previewUrlPresent = Boolean(alternatePreviewUrls?.storedLivePreviewUrl?.trim());
  const surfaceDescriptor = useMemo(() => {
    const badgeMuted = "border-border bg-muted/60 text-muted-foreground";
    const badgeAccent = "border-primary/25 bg-primary/10 text-foreground";
    const badgeAttention = "border-primary/35 bg-primary/15 text-foreground";

    if (viewMode === "registry") {
      return {
        label: "Elementregister",
        detail: "Kodläge för att matcha UI-element mot filer och rader.",
        className: "",
        badgeClassName: badgeAccent,
      };
    }
    if (viewMode === "code") {
      return {
        label: "Kodvy",
        detail: "Visar versionsfilerna direkt i buildern.",
        className: "",
        badgeClassName: badgeMuted,
      };
    }
    if (isOwnEnginePreview) {
      if (previewLifecycle === "recovering") {
        return {
          label: "Live-preview",
          detail:
            "Förhandsgranskningen svarade inte som förväntat — vi kontrollerar och startar om vid behov.",
          className: "",
          badgeClassName: badgeAttention,
        };
      }
      if (previewPending) {
        return {
          label: "Live-preview",
          detail:
            "Förhandsgranskningen startar eller laddar om. Vänta tills den är klar — då uppdateras live-preview automatiskt.",
          className: "",
          badgeClassName: badgeAttention,
        };
      }
      if (!previewUrlPresent) {
        return {
          label: "Kompatibilitetsvy",
          detail:
            "VM-preview är primär previewväg. Den här kompatibilitetsvyn (äldre shim) är fallback tills live-preview finns.",
          className: "",
          badgeClassName: badgeMuted,
        };
      }
      return {
        label: "Kompatibilitetsvy",
        detail:
          "Du tittar på shim-/kompatibilitetsvyn. Live-preview med Next.js i VM är den primära körbara ytan — byt när tier-2-URL finns.",
        className: "",
        badgeClassName: badgeMuted,
      };
    }
    if (isTier2LivePreview) {
      if (previewLifecycle === "recovering") {
        return {
          label: "Live-preview",
          detail:
            "Återansluter till live-preview — sessionen verifieras mot servern och preview startas om vid behov.",
          className: "",
          badgeClassName: badgeAttention,
        };
      }
      return {
        label: "Live-preview",
        detail:
          "Din genererade sajt körs här med Next.js (motsvarar npm run dev) i en isolerad miljö.",
        className: "",
        badgeClassName: badgeAccent,
      };
    }
    if (isV0Preview) {
      return {
        label: "Fallback preview",
        detail:
          "Visar en extern previewyta. Bra för snabb kontroll, men den kan avvika från lokal runtime och publicerad build.",
        className: "",
        badgeClassName: badgeAttention,
      };
    }
    return {
      label: "Extern preview",
      detail: "Visar den aktuella preview-URL:en för vald version.",
      className: "",
      badgeClassName: badgeMuted,
    };
  }, [
    viewMode,
    isOwnEnginePreview,
    isTier2LivePreview,
    isV0Preview,
    previewPending,
    previewUrlPresent,
    previewLifecycle,
  ]);

  const alternatePreviewBanner = useMemo(() => {
    return buildAlternatePreviewBannerState({ currentUrl: previewUrl, alternatePreviewUrls });
  }, [previewUrl, alternatePreviewUrls]);

  const isLoading = externalLoading || iframeLoading;
  const previewSrc = previewUrl ? buildPreviewSrc(previewUrl, refreshToken) : "";
  const showBlobWarning = Boolean(
    previewUrl && !isOwnEnginePreview && blobStatus && !blobStatus.enabled,
  );
  const showExternalWarning = Boolean(previewUrl && isV0Preview);
  const showImagesDisabledWarning = Boolean(previewUrl && !imageGenerationsEnabled);
  const showImagesUnsupportedWarning = Boolean(
    previewUrl && imageGenerationsEnabled && !imageGenerationsSupported,
  );
  const showBlobConfigWarning = Boolean(previewUrl && imageGenerationsEnabled && !isBlobConfigured);
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
  const showPlacementOverlay = inspectorEnabled && placementMode && Boolean(previewUrl);
  const showComposerOverlay =
    composerMode && Boolean(previewUrl) && !placementMode && !isCodeView;
  const showInspectOverlay = inspectorEnabled && inspectMode && !showPlacementOverlay;
  const shouldRenderInspectorDev = inspectorEnabled && (showPlacementOverlay || showInspectOverlay);
  const handleShowLastCodeMatch = useCallback(() => {
    if (!lastCodeMatch) return;
    setInspectMode(false);
    startViewSwitchTransition(() => {
      setViewMode("registry");
      setSelectedRegistryId(lastCodeMatch.item.id);
      setSelectedRegistryLine(lastCodeMatch.item.lineNumber);
      setSelectedPath(lastCodeMatch.item.filePath);
    });
  }, [
    lastCodeMatch,
    startViewSwitchTransition,
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
        onFixPreview={onFixPreview}
        simplified={simplified}
        generationPhase={generationPhase}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-muted/30">
      <PreviewPanelChrome
        previewUrl={previewUrl}
        previewDevice={previewDevice}
        onPreviewDeviceChange={setPreviewDevice}
        previewRoutes={previewRoutes}
        previewRoutesLoading={previewRoutesLoading}
        shellRoutePaths={shellRoutePaths}
        activePreviewRoute={activePreviewRoute}
        onNavigateRoute={handleNavigateRoute}
        onRequestBuildOutRoute={(route) => triggerBuildOut(route)}
        surfaceDescriptor={surfaceDescriptor}
        isOwnEnginePreview={isOwnEnginePreview}
        isTier2LivePreview={isTier2LivePreview}
        livePreviewUrlStored={previewUrlPresent}
        inspectorEnabled={inspectorEnabled}
        handleToggleInspect={handleToggleInspect}
        placementMode={placementMode}
        composerMode={composerMode}
        handleToggleComposer={handleToggleComposer}
        composerCanUndo={composerUndoStack.length > 0}
        composerCanRedo={composerRedoStack.length > 0}
        composerHistoryBusy={composerHistoryBusy}
        onComposerUndo={() => void handleComposerUndo()}
        onComposerRedo={() => void handleComposerRedo()}
        inspectMode={inspectMode}
        handleToggleElementRegistry={handleToggleElementRegistry}
        canShowCode={canShowCode}
        isViewSwitchPending={isViewSwitchPending}
        showElementRegistry={showElementRegistry}
        handleToggleCode={handleToggleCode}
        viewMode={viewMode}
        onClear={onClear}
        handleClear={handleClear}
        isLoading={isLoading}
        handleRefresh={handleRefresh}
        handleOpenInNewTab={handleOpenInNewTab}
        alternatePreviewBanner={alternatePreviewBanner}
        onNavigatePreviewUrl={onNavigatePreviewUrl}
        previewBuildError={previewBuildError}
        previewProdBuild={previewProdBuild}
        isCodeView={isCodeView}
        showBlobWarning={showBlobWarning}
        showBlobConfigWarning={showBlobConfigWarning}
        integrationError={integrationError}
        showImagesDisabledWarning={showImagesDisabledWarning}
        showImagesUnsupportedWarning={showImagesUnsupportedWarning}
        showExternalWarning={showExternalWarning}
        simplified={simplified}
        inlineEditMode={inlineEditMode}
        handleToggleInlineEdit={onInlineEditPrompt ? handleToggleInlineEdit : undefined}
        onSuggestionClick={onSuggestionClick}
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
            <PreviewPanelComposerPalette
              disabled={!previewUrl || Boolean(placementMode) || composerHistoryBusy}
              onDragStart={() => setIsComposerDragging(true)}
              onDragEnd={() => setIsComposerDragging(false)}
            />
          ) : null}
          <div className="relative min-h-0 min-w-0 flex-1">
            {/*
              Medan VM:ens Next.js fortfarande bootar serverar preview-hosten
              en blank starting-stub som annars skulle synas som en "tom"
              iframe. Vi låter iframen vara mountad (så den kan ladda och
              signalera `preview-ready`) men lägger en overlay med vår riktiga
              GenerationProgress ovanpå tills vmReady blir true.
            */}
            {previewUrl && !vmReady && !iframeError ? (
              <div
                className="pointer-events-none absolute inset-0 z-20 bg-background"
                role="status"
                aria-live="polite"
                aria-busy="true"
              >
                <GenerationProgress phase={generationPhase ?? "preview"} />
              </div>
            ) : null}
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
              deviceMode={previewDevice}
              hasEverLoaded={iframeHasEverLoaded}
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
                />
              ) : null}
              <EditModeOverlay
                active={inlineEditMode && !iframeLoading && !externalLoading}
                elementMap={elementMap}
                loading={elementMapLoading}
                onElementClick={handleInlineEditClick}
              />
              {inlineEditTarget && (
                <InlineEditPopup
                  element={inlineEditTarget.element}
                  posX={inlineEditTarget.posX}
                  posY={inlineEditTarget.posY}
                  containerWidth={inlineEditTarget.containerWidth}
                  containerHeight={inlineEditTarget.containerHeight}
                  onSave={handleInlineEditSave}
                  onClose={() => setInlineEditTarget(null)}
                />
              )}
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
            </PreviewSurface>
          </div>
        </div>
      )}
    </div>
  );
}
