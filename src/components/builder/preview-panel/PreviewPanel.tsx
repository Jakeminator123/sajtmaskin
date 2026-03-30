"use client";

import dynamic from "next/dynamic";
import {
  Loader2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CodeBlock, CodeBlockCopyButton } from "@/components/ai-elements/code-block";
import { buildFileTree } from "@/lib/builder/fileTree";
import { isBuilderInspectorEnabled } from "@/lib/builder/inspector-feature";
import type { FileNode } from "@/lib/builder/types";
import { buildJsxElementRegistry, type RegistryMatch } from "@/lib/builder/jsx-element-registry";
import { PreviewPanelChrome } from "./PreviewPanelChrome";
import { PreviewPanelCode } from "./PreviewPanelCode";
import { PreviewPanelEmptyState } from "./PreviewPanelEmptyState";
import { PreviewPanelSandbox } from "./PreviewPanelSandbox";
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
import type { InspectEngine, PreviewPanelProps, PreviewViewMode } from "./preview-panel-types";
import {
  buildExternalRoutePreviewUrl,
  buildOwnEngineRoutePreviewUrl,
} from "./preview-route-helpers";
import { findFileNodeByPath, getLanguageFromFileName } from "./code-file-tree-utils";
import { useIntegrationStatus } from "@/lib/hooks/useIntegrationStatus";
import {
  buildAlternatePreviewBannerState,
  isCompatibilityShimPreviewUrl,
  isSandboxPreviewUrl,
} from "@/lib/gen/preview";
import { describePreviewDiagnosticCode, previewRunbookLinesForCode } from "@/lib/gen/preview-diagnostics";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PreviewPanelInspectorDev = dynamic(
  () =>
    import("./PreviewPanelInspectorDev").then((mod) => ({
      default: mod.PreviewPanelInspectorDev,
    })),
  { ssr: false },
);

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
  sandboxBuildError = null,
  sandboxProdBuild = null,
  sandboxPending = false,
  activeSandboxId = null,
  previewLifecycle,
  onPreviewSessionSuspect,
  placementMode = false,
  pendingPlacementItem = null,
  onPlacementComplete,
}: PreviewPanelProps) {
  const [viewMode, setViewMode] = useState<PreviewViewMode>("preview");
  const isCodeView = viewMode !== "preview";
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
  const { previewRoutes, previewRoutesLoading } = usePreviewPanelPreviewRoutes(chatId, versionId);
  const selectedFile = useMemo(() => {
    if (!selectedPath) return null;
    return findFileNodeByPath(files, selectedPath);
  }, [files, selectedPath]);

  const {
    metadataDraft,
    setMetadataDraft,
    metadataSaveError,
    isMetadataSaving,
    heroDraft,
    setHeroDraft,
    heroSaveError,
    isHeroSaving,
    serviceItemsDraft,
    setServiceItemsDraft,
    servicesSaveError,
    isServicesSaving,
    contactDraft,
    setContactDraft,
    contactSaveError,
    isContactSaving,
    faqItemsDraft,
    setFaqItemsDraft,
    faqSaveError,
    isFaqSaving,
    testimonialItemsDraft,
    setTestimonialItemsDraft,
    testimonialsSaveError,
    isTestimonialsSaving,
    teamMembersDraft,
    setTeamMembersDraft,
    teamSaveError,
    isTeamSaving,
    statItemsDraft,
    setStatItemsDraft,
    statsSaveError,
    isStatsSaving,
    processStepsDraft,
    setProcessStepsDraft,
    processSaveError,
    isProcessSaving,
    productItemsDraft,
    setProductItemsDraft,
    productsSaveError,
    isProductsSaving,
    pricingCardsDraft,
    setPricingCardsDraft,
    pricingSaveError,
    isPricingSaving,
    pricingFeatureCardsDraft,
    setPricingFeatureCardsDraft,
    pricingFeaturesSaveError,
    isPricingFeaturesSaving,
    categoryItemsDraft,
    setCategoryItemsDraft,
    categorySaveError,
    isCategorySaving,
    navItemsDraft,
    setNavItemsDraft,
    navSaveError,
    isNavSaving,
    buttonLabelsDraft,
    setButtonLabelsDraft,
    buttonLabelsSaveError,
    isButtonLabelsSaving,
    blogPostsDraft,
    setBlogPostsDraft,
    blogPostsSaveError,
    isBlogPostsSaving,
    footerLinkGroupsDraft,
    setFooterLinkGroupsDraft,
    footerLinksSaveError,
    isFooterLinksSaving,
    rawEditMode,
    setRawEditMode,
    rawCodeDraft,
    setRawCodeDraft,
    rawCodeSaveError,
    setRawCodeSaveError,
    isRawCodeSaving,
    editableMetadata,
    editableHeroContent,
    editableServiceItems,
    editableContactDetails,
    editableFaqItems,
    editableTestimonialItems,
    editableTeamMembers,
    editableStatItems,
    editableProcessSteps,
    editableProductItems,
    editablePricingCards,
    editablePricingFeatureCards,
    editableCategoryItems,
    editableNavItems,
    editableButtonLabels,
    editableBlogPosts,
    editableFooterLinkGroups,
    metadataDirty,
    heroDirty,
    servicesDirty,
    contactDirty,
    faqDirty,
    testimonialsDirty,
    teamDirty,
    statsDirty,
    processDirty,
    productsDirty,
    pricingDirty,
    pricingFeaturesDirty,
    categoryDirty,
    navDirty,
    buttonLabelsDirty,
    blogPostsDirty,
    footerLinksDirty,
    rawCodeDirty,
    handleSaveMetadata,
    handleSaveHeroContent,
    handleSaveServiceItems,
    handleSaveContactDetails,
    handleSaveFaqItems,
    handleSaveTestimonialItems,
    handleSaveTeamMembers,
    handleSaveStatItems,
    handleSaveProcessSteps,
    handleSaveProductItems,
    handleSavePricingCards,
    handleSavePricingFeatures,
    handleSaveCategoryItems,
    handleSaveNavItems,
    handleSaveButtonLabels,
    handleSaveBlogPosts,
    handleSaveFooterLinks,
    handleSaveRawCode,
  } = usePreviewPanelCodeDrafts({ selectedFile, saveSelectedFileContent });

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
  const reportOwnEngineRenderFailureSink = useRef<(payload: PreviewIssuePayload) => void>(() => {});
  const reportOwnEngineRenderFailure = useCallback((payload: PreviewIssuePayload) => {
    reportOwnEngineRenderFailureSink.current(payload);
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

  usePreviewPanelOwnEnginePreviewTelemetry({
    chatId,
    versionId,
    previewUrl,
    iframeRef,
    setIframeLoading,
    setIframeError,
    setIframeErrorMessage,
    onNavigatePreviewUrl,
    reportOwnEngineRenderFailureSink,
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
  }, [chatId, versionId, files.length]);

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
      return current.pathname || "/";
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
    [previewUrl, isOwnEnginePreview, onNavigatePreviewUrl],
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
  const isSandboxPreview = useMemo(() => {
    if (!previewUrl) return false;
    return isSandboxPreviewUrl(previewUrl);
  }, [previewUrl]);

  usePreviewHeartbeat({
    chatId,
    versionId,
    previewUrl,
    activeSandboxId,
    previewLifecycle,
    onSessionSuspect: onPreviewSessionSuspect,
  });

  const handleIframeError = useCallback(() => {
    clearPreviewReadyTimer();
    setIframeLoading(false);
    setIframeError(true);
    setIframeDiagnosticCode("preview_transport_error");
    setIframeErrorMessage(describePreviewDiagnosticCode("preview_transport_error"));
    if (isSandboxPreview) {
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
    isSandboxPreview,
    onPreviewSessionSuspect,
    reportOwnEngineRenderFailure,
  ]);

  const isV0Preview = Boolean(
    previewUrl && !isOwnEnginePreview && previewUrl.includes("vusercontent.net"),
  );
  /** True när versionen har en sandbox-URL sparad — då kan användaren byta till live-preview. */
  const sandboxUrlPresent = Boolean(alternatePreviewUrls?.sandboxUrl?.trim());
  const surfaceDescriptor = useMemo(() => {
    if (viewMode === "registry") {
      return {
        label: "Elementregister",
        detail: "Kodläge för att matcha UI-element mot filer och rader.",
        className: "border-purple-900/40 bg-purple-950/25 text-purple-100",
        badgeClassName: "border-purple-500/30 bg-purple-500/10 text-purple-200",
      };
    }
    if (viewMode === "code") {
      return {
        label: "Kodvy",
        detail: "Visar versionsfilerna direkt i buildern.",
        className: "border-zinc-800 bg-zinc-950/50 text-zinc-200",
        badgeClassName: "border-zinc-500/30 bg-zinc-500/10 text-zinc-200",
      };
    }
    if (isOwnEnginePreview) {
      if (previewLifecycle === "recovering") {
        return {
          label: "Live-preview",
          detail:
            "Sandbox svarade inte som förväntat — vi kontrollerar sessionen mot servern och startar om vid behov.",
          className: "border-amber-900/40 bg-amber-950/30 text-amber-100",
          badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-200",
        };
      }
      if (sandboxPending) {
        return {
          label: "Live-preview",
          detail:
            "Sandbox startar eller laddar om (Next dev i VM). Vänta tills URL:en är klar — då laddas live-preview om automatiskt.",
          className: "border-amber-900/40 bg-amber-950/30 text-amber-100",
          badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-200",
        };
      }
      if (!sandboxUrlPresent) {
        return {
          label: "Kompatibilitetsvy",
          detail:
            "Sandbox är primär previewväg. Den här kompatibilitetsvyn (äldre shim) är fallback tills live-preview finns.",
          className: "border-sky-900/40 bg-sky-950/30 text-sky-100",
          badgeClassName: "border-sky-500/30 bg-sky-500/10 text-sky-200",
        };
      }
      return {
        label: "Kompatibilitetsvy",
        detail:
          "Du tittar på shim-/kompatibilitetsvyn. Live-preview med Next.js i sandbox är den primära körbara ytan — byt när sandbox-URL finns.",
        className: "border-sky-900/40 bg-sky-950/30 text-sky-100",
        badgeClassName: "border-sky-500/30 bg-sky-500/10 text-sky-200",
      };
    }
    if (isSandboxPreview) {
      if (previewLifecycle === "recovering") {
        return {
          label: "Live-preview",
          detail:
            "Återansluter till sandbox — sessionen verifieras mot servern och preview startas om vid behov.",
          className: "border-amber-900/40 bg-amber-950/30 text-amber-100",
          badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-200",
        };
      }
      return {
        label: "Live-preview",
        detail:
          "Din genererade sajt körs här med Next.js (motsvarar npm run dev) i en isolerad miljö.",
        className: "border-amber-900/40 bg-amber-950/30 text-amber-100",
        badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-200",
      };
    }
    if (isV0Preview) {
      return {
        label: "Fallback preview",
        detail:
          "Visar en extern previewyta. Bra för snabb kontroll, men den kan avvika från lokal runtime och publicerad build.",
        className: "border-yellow-900/40 bg-yellow-950/30 text-yellow-100",
        badgeClassName: "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
      };
    }
    return {
      label: "Extern preview",
      detail: "Visar den aktuella preview-URL:en för vald version.",
      className: "border-zinc-800 bg-zinc-950/50 text-zinc-200",
      badgeClassName: "border-zinc-500/30 bg-zinc-500/10 text-zinc-200",
    };
  }, [
    viewMode,
    isOwnEnginePreview,
    isSandboxPreview,
    isV0Preview,
    sandboxPending,
    sandboxUrlPresent,
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
  /** Tier 2: one user-facing strip for media/env limits — no env-var name dump (`preview-deploy.md`). */
  const showSandboxUnifiedStrip = Boolean(
    !isCodeView &&
      previewUrl &&
      !isOwnEnginePreview &&
      isSandboxPreview &&
      (showBlobWarning ||
        showBlobConfigWarning ||
        integrationError ||
        showImagesDisabledWarning ||
        showImagesUnsupportedWarning),
  );
  const showPlacementOverlay = inspectorEnabled && placementMode && Boolean(previewUrl);
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
  }, [lastCodeMatch, startViewSwitchTransition]);
  const PreviewSurface = PreviewPanelSandbox;

  if (!previewUrl && !isCodeView) {
    return (
      <PreviewPanelEmptyState
        chatId={chatId}
        versionId={versionId}
        externalLoading={externalLoading}
        awaitingInput={awaitingInput}
        awaitingInputQuestion={awaitingInputQuestion}
        awaitingInputOptions={awaitingInputOptions}
        sandboxPending={sandboxPending}
        sandboxBuildError={sandboxBuildError}
        onFixPreview={onFixPreview}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-black/40">
      <PreviewPanelChrome
        previewUrl={previewUrl}
        surfaceDescriptor={surfaceDescriptor}
        isOwnEnginePreview={isOwnEnginePreview}
        isSandboxPreview={isSandboxPreview}
        sandboxUrlPresent={sandboxUrlPresent}
        inspectorEnabled={inspectorEnabled}
        handleToggleInspect={handleToggleInspect}
        placementMode={placementMode}
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
        sandboxBuildError={sandboxBuildError}
        sandboxProdBuild={sandboxProdBuild}
        isCodeView={isCodeView}
        previewRoutesLoading={previewRoutesLoading}
        previewRoutes={previewRoutes}
        activePreviewRoute={activePreviewRoute}
        handleNavigateRoute={handleNavigateRoute}
        showSandboxUnifiedStrip={showSandboxUnifiedStrip}
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
                {metadataDraft && editableMetadata ? (
                  <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-cyan-100">Metadata-editor</div>
                        <div className="text-xs text-cyan-200/80">
                          Spara title och description direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveMetadata()}
                        disabled={!metadataDirty || isMetadataSaving}
                      >
                        {isMetadataSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara metadata
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      <div className="grid gap-1">
                        <label className="text-xs font-medium text-cyan-100" htmlFor="metadata-title">
                          Title
                        </label>
                        <Input
                          id="metadata-title"
                          value={metadataDraft.title}
                          onChange={(event) =>
                            setMetadataDraft((prev) =>
                              prev ? { ...prev, title: event.target.value } : prev,
                            )
                          }
                        />
                      </div>
                      <div className="grid gap-1">
                        <label
                          className="text-xs font-medium text-cyan-100"
                          htmlFor="metadata-description"
                        >
                          Description
                        </label>
                        <Textarea
                          id="metadata-description"
                          value={metadataDraft.description}
                          onChange={(event) =>
                            setMetadataDraft((prev) =>
                              prev ? { ...prev, description: event.target.value } : prev,
                            )
                          }
                          rows={3}
                        />
                      </div>
                      {metadataSaveError ? (
                        <div className="text-xs text-rose-300">{metadataSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {heroDraft && editableHeroContent ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-amber-100">Hero-editor</div>
                        <div className="text-xs text-amber-200/80">
                          Uppdatera hero-rubrik, ingress och CTA direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveHeroContent()}
                        disabled={!heroDirty || isHeroSaving}
                      >
                        {isHeroSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara hero
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      <div className="grid gap-1">
                        <label className="text-xs font-medium text-amber-100" htmlFor="hero-title">
                          Rubrik
                        </label>
                        <Input
                          id="hero-title"
                          value={heroDraft.title}
                          onChange={(event) =>
                            setHeroDraft((prev) =>
                              prev ? { ...prev, title: event.target.value } : prev,
                            )
                          }
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-xs font-medium text-amber-100" htmlFor="hero-intro">
                          Ingress
                        </label>
                        <Textarea
                          id="hero-intro"
                          value={heroDraft.intro}
                          onChange={(event) =>
                            setHeroDraft((prev) =>
                              prev ? { ...prev, intro: event.target.value } : prev,
                            )
                          }
                          rows={3}
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-xs font-medium text-amber-100" htmlFor="hero-cta">
                          CTA-text
                        </label>
                        <Input
                          id="hero-cta"
                          value={heroDraft.ctaLabel}
                          onChange={(event) =>
                            setHeroDraft((prev) =>
                              prev ? { ...prev, ctaLabel: event.target.value } : prev,
                            )
                          }
                        />
                      </div>
                      {heroSaveError ? (
                        <div className="text-xs text-rose-300">{heroSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {serviceItemsDraft && editableServiceItems ? (
                  <div className="rounded-md border border-fuchsia-500/30 bg-fuchsia-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-fuchsia-100">Tjänsteeditor</div>
                        <div className="text-xs text-fuchsia-200/80">
                          Uppdatera tjänstetitlar och beskrivningar direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveServiceItems()}
                        disabled={!servicesDirty || isServicesSaving}
                      >
                        {isServicesSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara tjänster
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {serviceItemsDraft.map((item, index) => (
                        <div
                          key={`service-item-${index}`}
                          className="rounded-md border border-fuchsia-500/20 bg-black/10 p-3"
                        >
                          <div className="mb-2 text-xs font-medium text-fuchsia-100">
                            Tjänst {index + 1}
                          </div>
                          <div className="grid gap-3">
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-fuchsia-100"
                                htmlFor={`service-title-${index}`}
                              >
                                Titel
                              </label>
                              <Input
                                id={`service-title-${index}`}
                                value={item.title}
                                onChange={(event) =>
                                  setServiceItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, title: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-fuchsia-100"
                                htmlFor={`service-description-${index}`}
                              >
                                Beskrivning
                              </label>
                              <Textarea
                                id={`service-description-${index}`}
                                value={item.description}
                                onChange={(event) =>
                                  setServiceItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, description: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                                rows={3}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {servicesSaveError ? (
                        <div className="text-xs text-rose-300">{servicesSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {faqItemsDraft && editableFaqItems ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-amber-100">FAQ-editor</div>
                        <div className="text-xs text-amber-200/80">
                          Uppdatera frågor och svar direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveFaqItems()}
                        disabled={!faqDirty || isFaqSaving}
                      >
                        {isFaqSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara FAQ
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {faqItemsDraft.map((item, index) => (
                        <div
                          key={`faq-item-${index}`}
                          className="rounded-md border border-amber-500/20 bg-black/10 p-3"
                        >
                          <div className="mb-2 text-xs font-medium text-amber-100">
                            FAQ {index + 1}
                          </div>
                          <div className="grid gap-3">
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-amber-100"
                                htmlFor={`faq-question-${index}`}
                              >
                                Fråga
                              </label>
                              <Input
                                id={`faq-question-${index}`}
                                value={item.question}
                                onChange={(event) =>
                                  setFaqItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, question: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-amber-100"
                                htmlFor={`faq-answer-${index}`}
                              >
                                Svar
                              </label>
                              <Textarea
                                id={`faq-answer-${index}`}
                                value={item.answer}
                                onChange={(event) =>
                                  setFaqItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, answer: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                                rows={3}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {faqSaveError ? (
                        <div className="text-xs text-rose-300">{faqSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {testimonialItemsDraft && editableTestimonialItems ? (
                  <div className="rounded-md border border-sky-500/30 bg-sky-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-sky-100">Omdömeseditor</div>
                        <div className="text-xs text-sky-200/80">
                          Uppdatera namn, roll och citat direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveTestimonialItems()}
                        disabled={!testimonialsDirty || isTestimonialsSaving}
                      >
                        {isTestimonialsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara omdömen
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {testimonialItemsDraft.map((item, index) => (
                        <div
                          key={`testimonial-item-${index}`}
                          className="rounded-md border border-sky-500/20 bg-black/10 p-3"
                        >
                          <div className="mb-2 text-xs font-medium text-sky-100">
                            Omdöme {index + 1}
                          </div>
                          <div className="grid gap-3">
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-sky-100"
                                htmlFor={`testimonial-name-${index}`}
                              >
                                Namn
                              </label>
                              <Input
                                id={`testimonial-name-${index}`}
                                value={item.name}
                                onChange={(event) =>
                                  setTestimonialItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, name: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-sky-100"
                                htmlFor={`testimonial-role-${index}`}
                              >
                                Roll
                              </label>
                              <Input
                                id={`testimonial-role-${index}`}
                                value={item.role}
                                onChange={(event) =>
                                  setTestimonialItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, role: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-sky-100"
                                htmlFor={`testimonial-quote-${index}`}
                              >
                                Citat
                              </label>
                              <Textarea
                                id={`testimonial-quote-${index}`}
                                value={item.quote}
                                onChange={(event) =>
                                  setTestimonialItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, quote: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                                rows={3}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {testimonialsSaveError ? (
                        <div className="text-xs text-rose-300">{testimonialsSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {teamMembersDraft && editableTeamMembers ? (
                  <div className="rounded-md border border-teal-500/30 bg-teal-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-teal-100">Teameditor</div>
                        <div className="text-xs text-teal-200/80">
                          Uppdatera namn, roll och beskrivning för teammedlemmar.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveTeamMembers()}
                        disabled={!teamDirty || isTeamSaving}
                      >
                        {isTeamSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara team
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {teamMembersDraft.map((member, index) => (
                        <div
                          key={`team-member-${index}`}
                          className="rounded-md border border-teal-500/20 bg-black/10 p-3"
                        >
                          <div className="mb-2 text-xs font-medium text-teal-100">
                            Medlem {index + 1}
                          </div>
                          <div className="grid gap-3">
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-teal-100"
                                htmlFor={`team-name-${index}`}
                              >
                                Namn
                              </label>
                              <Input
                                id={`team-name-${index}`}
                                value={member.name}
                                onChange={(event) =>
                                  setTeamMembersDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, name: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-teal-100"
                                htmlFor={`team-role-${index}`}
                              >
                                Roll
                              </label>
                              <Input
                                id={`team-role-${index}`}
                                value={member.role}
                                onChange={(event) =>
                                  setTeamMembersDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, role: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-teal-100"
                                htmlFor={`team-bio-${index}`}
                              >
                                Beskrivning
                              </label>
                              <Textarea
                                id={`team-bio-${index}`}
                                value={member.bio}
                                onChange={(event) =>
                                  setTeamMembersDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, bio: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                                rows={2}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {teamSaveError ? (
                        <div className="text-xs text-rose-300">{teamSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {statItemsDraft && editableStatItems ? (
                  <div className="rounded-md border border-violet-500/30 bg-violet-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-violet-100">Nyckeltalseditor</div>
                        <div className="text-xs text-violet-200/80">
                          Uppdatera etiketter och värden direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveStatItems()}
                        disabled={!statsDirty || isStatsSaving}
                      >
                        {isStatsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara nyckeltal
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {statItemsDraft.map((item, index) => (
                        <div
                          key={`stat-item-${index}`}
                          className="rounded-md border border-violet-500/20 bg-black/10 p-3"
                        >
                          <div className="mb-2 text-xs font-medium text-violet-100">
                            Nyckeltal {index + 1}
                          </div>
                          <div className="grid gap-3">
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-violet-100"
                                htmlFor={`stat-label-${index}`}
                              >
                                Etikett
                              </label>
                              <Input
                                id={`stat-label-${index}`}
                                value={item.label}
                                onChange={(event) =>
                                  setStatItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, label: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-violet-100"
                                htmlFor={`stat-value-${index}`}
                              >
                                Värde
                              </label>
                              <Input
                                id={`stat-value-${index}`}
                                value={item.value}
                                onChange={(event) =>
                                  setStatItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, value: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {statsSaveError ? (
                        <div className="text-xs text-rose-300">{statsSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {processStepsDraft && editableProcessSteps ? (
                  <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-orange-100">Processtegeditor</div>
                        <div className="text-xs text-orange-200/80">
                          Uppdatera process-/steps-listan direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveProcessSteps()}
                        disabled={!processDirty || isProcessSaving}
                      >
                        {isProcessSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara processteg
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {processStepsDraft.map((item, index) => (
                        <div
                          key={`process-step-${index}`}
                          className="rounded-md border border-orange-500/20 bg-black/10 p-3"
                        >
                          <div className="mb-2 text-xs font-medium text-orange-100">
                            Steg {index + 1}
                          </div>
                          <div className="grid gap-1">
                            <label
                              className="text-xs font-medium text-orange-100"
                              htmlFor={`process-step-${index}`}
                            >
                              Text
                            </label>
                            <Textarea
                              id={`process-step-${index}`}
                              value={item.text}
                              onChange={(event) =>
                                setProcessStepsDraft((prev) =>
                                  prev
                                    ? prev.map((entry, entryIndex) =>
                                        entryIndex === index
                                          ? { ...entry, text: event.target.value }
                                          : entry,
                                      )
                                    : prev,
                                )
                              }
                              rows={3}
                            />
                          </div>
                        </div>
                      ))}
                      {processSaveError ? (
                        <div className="text-xs text-rose-300">{processSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {productItemsDraft && editableProductItems ? (
                  <div className="rounded-md border border-pink-500/30 bg-pink-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-pink-100">Produkteditor</div>
                        <div className="text-xs text-pink-200/80">
                          Uppdatera produktnamn och pris direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveProductItems()}
                        disabled={!productsDirty || isProductsSaving}
                      >
                        {isProductsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara produkter
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {productItemsDraft.map((item, index) => (
                        <div
                          key={`product-item-${index}`}
                          className="rounded-md border border-pink-500/20 bg-black/10 p-3"
                        >
                          <div className="mb-2 text-xs font-medium text-pink-100">
                            Produkt {index + 1}
                          </div>
                          <div className="grid gap-3">
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-pink-100"
                                htmlFor={`product-name-${index}`}
                              >
                                Namn
                              </label>
                              <Input
                                id={`product-name-${index}`}
                                value={item.name}
                                onChange={(event) =>
                                  setProductItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, name: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-pink-100"
                                htmlFor={`product-price-${index}`}
                              >
                                Pris
                              </label>
                              <Input
                                id={`product-price-${index}`}
                                value={item.price}
                                onChange={(event) =>
                                  setProductItemsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, price: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {productsSaveError ? (
                        <div className="text-xs text-rose-300">{productsSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {pricingCardsDraft && editablePricingCards ? (
                  <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-cyan-100">Pricing-editor</div>
                        <div className="text-xs text-cyan-200/80">
                          Uppdatera namn, pris och beskrivning för prisplaner i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSavePricingCards()}
                        disabled={!pricingDirty || isPricingSaving}
                      >
                        {isPricingSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara pricing
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {pricingCardsDraft.map((item, index) => (
                        <div
                          key={`pricing-card-${index}`}
                          className="rounded-md border border-cyan-500/20 bg-black/10 p-3"
                        >
                          <div className="mb-2 text-xs font-medium text-cyan-100">
                            Prisplan {index + 1}
                          </div>
                          <div className="grid gap-3">
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-cyan-100"
                                htmlFor={`pricing-name-${index}`}
                              >
                                Namn
                              </label>
                              <Input
                                id={`pricing-name-${index}`}
                                value={item.name}
                                onChange={(event) =>
                                  setPricingCardsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, name: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-cyan-100"
                                htmlFor={`pricing-price-${index}`}
                              >
                                Pris
                              </label>
                              <Input
                                id={`pricing-price-${index}`}
                                value={item.price}
                                onChange={(event) =>
                                  setPricingCardsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, price: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-cyan-100"
                                htmlFor={`pricing-description-${index}`}
                              >
                                Beskrivning
                              </label>
                              <Textarea
                                id={`pricing-description-${index}`}
                                value={item.description}
                                onChange={(event) =>
                                  setPricingCardsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, description: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                                rows={3}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {pricingSaveError ? (
                        <div className="text-xs text-rose-300">{pricingSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {pricingFeatureCardsDraft && editablePricingFeatureCards ? (
                  <div className="rounded-md border border-teal-500/30 bg-teal-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-teal-100">
                          Pricing features-editor
                        </div>
                        <div className="text-xs text-teal-200/80">
                          Uppdatera feature-listorna för prisplaner direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSavePricingFeatures()}
                        disabled={!pricingFeaturesDirty || isPricingFeaturesSaving}
                      >
                        {isPricingFeaturesSaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        Spara features
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {pricingFeatureCardsDraft.map((card, cardIndex) => (
                        <div
                          key={`pricing-feature-card-${cardIndex}`}
                          className="rounded-md border border-teal-500/20 bg-black/10 p-3"
                        >
                          <div className="mb-2 text-xs font-medium text-teal-100">
                            {card.name}
                          </div>
                          <div className="grid gap-3">
                            {card.features.map((feature, featureIndex) => (
                              <div
                                key={`pricing-feature-${cardIndex}-${featureIndex}`}
                                className="grid gap-1"
                              >
                                <label
                                  className="text-xs font-medium text-teal-100"
                                  htmlFor={`pricing-feature-${cardIndex}-${featureIndex}`}
                                >
                                  Feature {featureIndex + 1}
                                </label>
                                <Input
                                  id={`pricing-feature-${cardIndex}-${featureIndex}`}
                                  value={feature}
                                  onChange={(event) =>
                                    setPricingFeatureCardsDraft((prev) =>
                                      prev
                                        ? prev.map((entry, entryIndex) =>
                                            entryIndex === cardIndex
                                              ? {
                                                  ...entry,
                                                  features: entry.features.map(
                                                    (entryFeature, entryFeatureIndex) =>
                                                      entryFeatureIndex === featureIndex
                                                        ? event.target.value
                                                        : entryFeature,
                                                  ),
                                                }
                                              : entry,
                                          )
                                        : prev,
                                    )
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {pricingFeaturesSaveError ? (
                        <div className="text-xs text-rose-300">{pricingFeaturesSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {categoryItemsDraft && editableCategoryItems ? (
                  <div className="rounded-md border border-lime-500/30 bg-lime-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-lime-100">Kategorieditor</div>
                        <div className="text-xs text-lime-200/80">
                          Uppdatera kategorinamnen direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveCategoryItems()}
                        disabled={!categoryDirty || isCategorySaving}
                      >
                        {isCategorySaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara kategorier
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {categoryItemsDraft.map((item, index) => (
                        <div
                          key={`category-item-${index}`}
                          className="rounded-md border border-lime-500/20 bg-black/10 p-3"
                        >
                          <div className="mb-2 text-xs font-medium text-lime-100">
                            Kategori {index + 1}
                          </div>
                          <div className="grid gap-1">
                            <label
                              className="text-xs font-medium text-lime-100"
                              htmlFor={`category-name-${index}`}
                            >
                              Namn
                            </label>
                            <Input
                              id={`category-name-${index}`}
                              value={item.name}
                              onChange={(event) =>
                                setCategoryItemsDraft((prev) =>
                                  prev
                                    ? prev.map((entry, entryIndex) =>
                                        entryIndex === index
                                          ? { ...entry, name: event.target.value }
                                          : entry,
                                      )
                                    : prev,
                                )
                              }
                            />
                          </div>
                        </div>
                      ))}
                      {categorySaveError ? (
                        <div className="text-xs text-rose-300">{categorySaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {navItemsDraft && editableNavItems ? (
                  <div className="rounded-md border border-indigo-500/30 bg-indigo-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-indigo-100">Navigationeditor</div>
                        <div className="text-xs text-indigo-200/80">
                          Uppdatera navigationsetiketter direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveNavItems()}
                        disabled={!navDirty || isNavSaving}
                      >
                        {isNavSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara navigation
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {navItemsDraft.map((item, index) => (
                        <div
                          key={`nav-item-${index}`}
                          className="rounded-md border border-indigo-500/20 bg-black/10 p-3"
                        >
                          <div className="mb-2 text-xs font-medium text-indigo-100">
                            Menyval {index + 1}
                          </div>
                          <div className="grid gap-1">
                            <label
                              className="text-xs font-medium text-indigo-100"
                              htmlFor={`nav-label-${index}`}
                            >
                              Etikett
                            </label>
                            <Input
                              id={`nav-label-${index}`}
                              value={item.label}
                              onChange={(event) =>
                                setNavItemsDraft((prev) =>
                                  prev
                                    ? prev.map((entry, entryIndex) =>
                                        entryIndex === index
                                          ? { ...entry, label: event.target.value }
                                          : entry,
                                      )
                                    : prev,
                                )
                              }
                            />
                          </div>
                        </div>
                      ))}
                      {navSaveError ? (
                        <div className="text-xs text-rose-300">{navSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {buttonLabelsDraft && editableButtonLabels ? (
                  <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-rose-100">CTA-editor</div>
                        <div className="text-xs text-rose-200/80">
                          Uppdatera vanliga Button-etiketter direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveButtonLabels()}
                        disabled={!buttonLabelsDirty || isButtonLabelsSaving}
                      >
                        {isButtonLabelsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara CTA
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {buttonLabelsDraft.map((item, index) => (
                        <div
                          key={`button-label-${index}`}
                          className="rounded-md border border-rose-500/20 bg-black/10 p-3"
                        >
                          <div className="mb-2 text-xs font-medium text-rose-100">
                            Knapp {index + 1}
                          </div>
                          <div className="grid gap-1">
                            <label
                              className="text-xs font-medium text-rose-100"
                              htmlFor={`button-label-${index}`}
                            >
                              Etikett
                            </label>
                            <Input
                              id={`button-label-${index}`}
                              value={item.label}
                              onChange={(event) =>
                                setButtonLabelsDraft((prev) =>
                                  prev
                                    ? prev.map((entry, entryIndex) =>
                                        entryIndex === index
                                          ? { ...entry, label: event.target.value }
                                          : entry,
                                      )
                                    : prev,
                                )
                              }
                            />
                          </div>
                        </div>
                      ))}
                      {buttonLabelsSaveError ? (
                        <div className="text-xs text-rose-300">{buttonLabelsSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {blogPostsDraft && editableBlogPosts ? (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-amber-100">Inläggseditor</div>
                        <div className="text-xs text-amber-200/80">
                          Uppdatera blogginläggens titlar och ingresser direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveBlogPosts()}
                        disabled={!blogPostsDirty || isBlogPostsSaving}
                      >
                        {isBlogPostsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara inlägg
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {blogPostsDraft.map((item, index) => (
                        <div
                          key={`blog-post-${index}`}
                          className="rounded-md border border-amber-500/20 bg-black/10 p-3"
                        >
                          <div className="mb-2 text-xs font-medium text-amber-100">
                            Inlägg {index + 1}
                          </div>
                          <div className="grid gap-3">
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-amber-100"
                                htmlFor={`blog-post-title-${index}`}
                              >
                                Titel
                              </label>
                              <Input
                                id={`blog-post-title-${index}`}
                                value={item.title}
                                onChange={(event) =>
                                  setBlogPostsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, title: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-amber-100"
                                htmlFor={`blog-post-excerpt-${index}`}
                              >
                                Ingress
                              </label>
                              <Textarea
                                id={`blog-post-excerpt-${index}`}
                                value={item.excerpt}
                                onChange={(event) =>
                                  setBlogPostsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === index
                                            ? { ...entry, excerpt: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                                rows={3}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {blogPostsSaveError ? (
                        <div className="text-xs text-rose-300">{blogPostsSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {footerLinkGroupsDraft && editableFooterLinkGroups ? (
                  <div className="rounded-md border border-slate-500/30 bg-slate-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-slate-100">Footereditor</div>
                        <div className="text-xs text-slate-200/80">
                          Uppdatera footergrupper och länketiketter direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveFooterLinks()}
                        disabled={!footerLinksDirty || isFooterLinksSaving}
                      >
                        {isFooterLinksSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara footer
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      {footerLinkGroupsDraft.map((group, groupIndex) => (
                        <div
                          key={`footer-group-${groupIndex}`}
                          className="rounded-md border border-slate-500/20 bg-black/10 p-3"
                        >
                          <div className="grid gap-3">
                            <div className="grid gap-1">
                              <label
                                className="text-xs font-medium text-slate-100"
                                htmlFor={`footer-group-heading-${groupIndex}`}
                              >
                                Gruppnamn
                              </label>
                              <Input
                                id={`footer-group-heading-${groupIndex}`}
                                value={group.heading}
                                onChange={(event) =>
                                  setFooterLinkGroupsDraft((prev) =>
                                    prev
                                      ? prev.map((entry, entryIndex) =>
                                          entryIndex === groupIndex
                                            ? { ...entry, heading: event.target.value }
                                            : entry,
                                        )
                                      : prev,
                                  )
                                }
                              />
                            </div>
                            {group.items.map((item, itemIndex) => (
                              <div
                                key={`footer-group-${groupIndex}-item-${itemIndex}`}
                                className="grid gap-1"
                              >
                                <label
                                  className="text-xs font-medium text-slate-100"
                                  htmlFor={`footer-group-${groupIndex}-item-${itemIndex}`}
                                >
                                  Länk {itemIndex + 1}
                                </label>
                                <Input
                                  id={`footer-group-${groupIndex}-item-${itemIndex}`}
                                  value={item}
                                  onChange={(event) =>
                                    setFooterLinkGroupsDraft((prev) =>
                                      prev
                                        ? prev.map((entry, entryIndex) =>
                                            entryIndex === groupIndex
                                              ? {
                                                  ...entry,
                                                  items: entry.items.map(
                                                    (entryItem, entryItemIndex) =>
                                                      entryItemIndex === itemIndex
                                                        ? event.target.value
                                                        : entryItem,
                                                  ),
                                                }
                                              : entry,
                                          )
                                        : prev,
                                    )
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {footerLinksSaveError ? (
                        <div className="text-xs text-rose-300">{footerLinksSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {contactDraft && editableContactDetails ? (
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-emerald-100">Kontakteditor</div>
                        <div className="text-xs text-emerald-200/80">
                          Uppdatera `mailto:` och `tel:` direkt i den aktiva versionen.
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => void handleSaveContactDetails()}
                        disabled={!contactDirty || isContactSaving}
                      >
                        {isContactSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Spara kontakt
                      </Button>
                    </div>
                    <div className="grid gap-3">
                      <div className="grid gap-1">
                        <label className="text-xs font-medium text-emerald-100" htmlFor="contact-email">
                          E-post
                        </label>
                        <Input
                          id="contact-email"
                          value={contactDraft.email}
                          onChange={(event) =>
                            setContactDraft((prev) =>
                              prev ? { ...prev, email: event.target.value } : prev,
                            )
                          }
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-xs font-medium text-emerald-100" htmlFor="contact-phone">
                          Telefon
                        </label>
                        <Input
                          id="contact-phone"
                          value={contactDraft.phone}
                          onChange={(event) =>
                            setContactDraft((prev) =>
                              prev ? { ...prev, phone: event.target.value } : prev,
                            )
                          }
                        />
                      </div>
                      {contactSaveError ? (
                        <div className="text-xs text-rose-300">{contactSaveError}</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {showElementRegistry && selectedRegistryLine && (
                  <div className="text-xs text-purple-300">Målrad: {selectedRegistryLine}</div>
                )}
                {rawEditMode ? (
                  <div className="space-y-2">
                    <Textarea
                      value={rawCodeDraft}
                      onChange={(event) => setRawCodeDraft(event.target.value)}
                      className="min-h-[420px] font-mono text-xs"
                    />
                    {rawCodeSaveError ? (
                      <div className="text-xs text-rose-300">{rawCodeSaveError}</div>
                    ) : null}
                  </div>
                ) : (
                  <CodeBlock
                    code={selectedFile?.content || ""}
                    language={getLanguageFromFileName(selectedFile?.name || "")}
                    showLineNumbers
                  >
                    <CodeBlockCopyButton className="text-gray-300 hover:text-white" />
                  </CodeBlock>
                )}
        </PreviewPanelCode>
      ) : (
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
        >
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
              onInspectMouseLeave={inspectEngine === "map" ? () => setHoveredMapElement(null) : undefined}
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
      )}
    </div>
  );
}
