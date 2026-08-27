"use client";

import type { ChatMessage } from "@/lib/builder/types";
import { useChat } from "@/lib/hooks/useChat";
import { useCssValidation } from "@/lib/hooks/useCssValidation";
import { usePersistedChatMessages } from "@/lib/hooks/usePersistedChatMessages";
import { useInitBrief } from "@/lib/hooks/useInitBrief";
import { useChatMessaging } from "@/lib/hooks/chat/useChatMessaging";
import { useResumePendingVerification } from "@/lib/hooks/chat/useResumePendingVerification";
import { useVersions } from "@/lib/hooks/useVersions";
import { useChatReadiness } from "@/lib/hooks/useChatReadiness";
import { useAuth } from "@/lib/auth/auth-store";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";

import { useBuilderCallbacks } from "./useBuilderCallbacks";
import { useBuilderDeployActions } from "./useBuilderDeployActions";
import { useBuilderDerivedState, type ChatData } from "./useBuilderDerivedState";
import { useBuilderEffects } from "./useBuilderEffects";
import { useBuilderProjectActions } from "./useBuilderProjectActions";
import { useBuilderPromptActions } from "./useBuilderPromptActions";
import { useBuilderState } from "./useBuilderState";
import { useDeploymentHistory } from "./useDeploymentHistory";
import { useProjectThumbnail } from "./useProjectThumbnail";
import { useBuilderVmPreview } from "./useBuilderVmPreview";
import { usePreviewSession } from "./usePreviewSession";
import { isShimOrMissingPreviewUrl } from "@/lib/gen/preview/legacy/compatibility-shim";
import { useBuilderActiveVersionInfo } from "./page-controller/useBuilderActiveVersionInfo";
import { useBuilderAutoStartGeneration } from "./page-controller/useBuilderAutoStartGeneration";
import { useBuilderDeploymentStatusSync } from "./page-controller/useBuilderDeploymentStatusSync";
import { useBuilderEntryHydration } from "./page-controller/useBuilderEntryHydration";
import { useBuilderFeatureFlags } from "./page-controller/useBuilderFeatureFlags";
import { useBuilderFilesContext } from "./page-controller/useBuilderFilesContext";
import { useBuilderGenerationPreferences } from "./page-controller/useBuilderGenerationPreferences";
import { useBuilderInstructionPreferences } from "./page-controller/useBuilderInstructionPreferences";
import { useBuilderPreviewVersionSync } from "./page-controller/useBuilderPreviewVersionSync";
import { useBuilderProjectHydration } from "./page-controller/useBuilderProjectHydration";
import { useBuilderRouteFeedback } from "./page-controller/useBuilderRouteFeedback";
import { useBuilderVersionNotices } from "./page-controller/useBuilderVersionNotices";
import { useBuilderVersionSelectionSync } from "./page-controller/useBuilderVersionSelectionSync";
import { usePreviewHandoff } from "./page-controller/usePreviewHandoff";

/**
 * Builder page facade. Owns the shared wiring between the builder's hooks and
 * the view model handed to `BuilderShellContent`; the per-responsibility
 * effects live in `./page-controller/*` and are composed here in a fixed order.
 */
export function useBuilderPageController() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startUiTransition] = useTransition();
  const { fetchUser, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [authModalReason, setAuthModalReason] = useState<"builder" | "save" | null>(null);
  const [tipsEnabled, setTipsEnabled] = useState(false);

  const state = useBuilderState(searchParams);

  // Destructure state for clean effect dependency tracking.
  // Setters (from useState) and refs (from useRef) are stable across
  // renders — including them in dep arrays is safe and avoids the need
  // for eslint-disable comments.
  const {
    appProjectId, applyInstructionsOnce, buildIntentParam, buildMethod,
    chatId, chatIdParam, currentPreviewUrl, customInstructions,
    designTheme, enableBlobMedia, enableImageGenerations, enableThinking,
    entry, entryIntentActive, hasEntryParams, isIntentionalReset, paletteState,
    projectParam, promptId, promptParam, resolvedPrompt, selectedModelTier,
    selectedVersionId, serverProjectChatId, serverProjectDemoUrl,
    serverProjectPreviewOverrideUrl, serverProjectPreviewOverrideVersionId,
    clearedPreviewVersionId,
    showStructuredChat, templateId, externalProjectId,
    setApplyInstructionsOnce, setAppProjectId, setAppProjectName,
    setAuditPromptLoaded, setBuildIntent, setBuildMethod, setChatId,
    setCurrentPreviewUrl, setCurrentPageCode, setCustomInstructions,
    setDesignTheme, setEnableBlobMedia,
    setEnableImageGenerations, setEnableThinking, setEntryIntentActive,
    setExistingUiComponents,
    setIsImageGenerationsSupported, setIsIntentionalReset, setIsMediaEnabled,
    setMessages, setPaletteState, setPreviewRefreshToken,
    setResolvedPrompt, setSelectedModelTier, setSelectedVersionId,
    setServerProjectChatId, setServerProjectDemoUrl, setServerProjectMessages,
    setServerProjectPreviewOverrideUrl, setServerProjectPreviewOverrideVersionId,
    setClearedPreviewVersionId,
    setShowStructuredChat, setExternalProjectId,
    applyingGenerationSettingsRef, autoProjectInitRef, featureWarnedRef,
    hasLoadedInstructions, hasLoadedInstructionsOnce, lastActiveVersionIdRef,
    lastPaletteSavedRef, lastProjectIdRef,
    loadedGenerationSettingsChatRef, paletteLoadedRef, pendingBriefRef,
    pendingInstructionsOnceRef, pendingInstructionsRef,
    filesContextKeyRef, promptFetchDoneRef,
    promptFetchInFlightRef,
  } = state;

  const {
    bumpPreviewRefreshToken,
    applyPreviewHandoff,
    currentPreviewUrlRef,
    lastPreviewHandoffKeyRef,
  } = usePreviewHandoff({
    currentPreviewUrl,
    setCurrentPreviewUrl,
    setPreviewRefreshToken,
  });

  // Område 6-3 punkt 1: deterministic post-check completion → version-status
  // refetch. The post-generation check flow calls `onVersionStatusRefresh`
  // in its `finally`, which bumps this nonce; `useVersionStatus` reads it as
  // `refreshNonce` and does a guaranteed final fetch AFTER `/product-postcheck`
  // has emitted any late `version.degraded`. Must stay a stable callback
  // (empty deps; the setState setter is stable) so it never re-triggers
  // downstream effects on every render.
  const [versionStatusNonce, setVersionStatusNonce] = useState(0);
  const bumpVersionStatusRefresh = useCallback(() => {
    setVersionStatusNonce((n) => n + 1);
  }, []);

  const resetRecoverAfterBootstrapRef = useRef<(() => void) | null>(null);
  const shouldHoldChatHooksForFreshEntry = Boolean(
    chatId && !chatIdParam && !templateId && hasEntryParams && entryIntentActive,
  );
  const readyForChatHooks = Boolean(chatId) && !shouldHoldChatHooksForFreshEntry;
  const chatHooksChatId = readyForChatHooks ? chatId : null;

  // ── External data hooks ──────────────────────────────────────────────
  const { chat, mutate: mutateChat, isError: isChatError, isLoading: isChatLoading } =
    useChat(chatHooksChatId);

  const isAnyStreamingEarly = useMemo(
    () => state.messages.some((m) => Boolean(m.isStreaming)),
    [state.messages],
  );

  const { versions, chatStatus, mutate: mutateVersions } = useVersions(chatHooksChatId, {
    isGenerating: isAnyStreamingEarly,
    pauseWhileGenerating: true,
  });

  const { versionlessAborted } = useBuilderVersionNotices({ versions, chatStatus });

  // F2-promotion körs från webbläsaren (post-checks → /quality-gate). Om
  // fliken stängdes/navigerades i fönstret efter finalize blir versionen
  // strandad som draft/pending för alltid (watchdogen rör medvetet inte
  // F2-pending). Denna hook återupptar verify-lanen för en strandad senaste
  // version vid nästa builder-besök. Se useResumePendingVerification.
  useResumePendingVerification({
    chatId: chatHooksChatId,
    versions,
    isStreaming: isAnyStreamingEarly,
    mutateVersions,
    onVersionStatusRefresh: bumpVersionStatusRefresh,
  });

  // ── Derived / memoized state ─────────────────────────────────────────
  const derived = useBuilderDerivedState({
    chatId: state.chatId,
    messages: state.messages,
    selectedVersionId: state.selectedVersionId,
    chat: chat as ChatData,
    versions,
    templateId: state.templateId,
    resolvedPrompt: state.resolvedPrompt,
    auditPromptLoaded: state.auditPromptLoaded,
    isMediaEnabled: state.isMediaEnabled,
    enableBlobMedia: state.enableBlobMedia,
  });

  const {
    selectedVersionIdRef,
    latestVersionIdRef,
    activeVersionFailedWithoutPreviewUrl,
  } = useBuilderActiveVersionInfo({
    selectedVersionId: state.selectedVersionId,
    latestVersionId: derived.latestVersionId,
    activeVersionId: derived.activeVersionId,
    effectiveVersionsList: derived.effectiveVersionsList,
  });

  const {
    readiness: deployReadiness,
    isLoading: isDeployReadinessLoading,
    mutate: mutateDeployReadiness,
  } = useChatReadiness(chatHooksChatId, derived.activeVersionId, {
    isGenerating: isAnyStreamingEarly,
    pauseWhileGenerating: true,
  });
  const handleDeterministicF3Settled = useCallback(
    (payload: { versionId: string; selectVersion: boolean }) => {
      if (payload.selectVersion) {
        setSelectedVersionId(payload.versionId);
      }
      void mutateVersions();
      bumpVersionStatusRefresh();
      void mutateDeployReadiness();
    },
    [
      bumpVersionStatusRefresh,
      mutateDeployReadiness,
      mutateVersions,
      setSelectedVersionId,
    ],
  );

  // ── CSS validation ───────────────────────────────────────────────────
  const { validateAndFix: validateCss } = useCssValidation({ autoFix: true, showToasts: true });

  // ── Project actions ──────────────────────────────────────────────────
  const projectActions = useBuilderProjectActions({
    chatId: state.chatId,
    chatIdParam: state.chatIdParam,
    projectParam: state.projectParam,
    appProjectId: state.appProjectId,
    appProjectName: state.appProjectName,
    pendingProjectName: state.pendingProjectName,
    isAuthenticated,
    isSavingProject: state.isSavingProject,
    messages: state.messages,
    resolvedPrompt: state.resolvedPrompt,
    currentPreviewUrl: state.currentPreviewUrl,
    activeVersionId: derived.activeVersionId,
    mediaEnabled: derived.mediaEnabled,
    paletteState: state.paletteState,
    pendingInstructionsRef: state.pendingInstructionsRef,
    pendingInstructionsOnceRef: state.pendingInstructionsOnceRef,
    pendingBriefRef: state.pendingBriefRef,
    hasLoadedInstructions: state.hasLoadedInstructions,
    hasLoadedInstructionsOnce: state.hasLoadedInstructionsOnce,
    router,
    searchParams,
    startUiTransition,
    setChatId: state.setChatId,
    setAppProjectId: state.setAppProjectId,
    setAppProjectName: state.setAppProjectName,
    setPendingProjectName: state.setPendingProjectName,
    setCurrentPreviewUrl: state.setCurrentPreviewUrl,
    setPreviewRefreshToken: state.setPreviewRefreshToken,
    setMessages: state.setMessages,
    setIsImportModalOpen: state.setIsImportModalOpen,
    setIsSavingProject: state.setIsSavingProject,
    setSelectedModelTier: state.setSelectedModelTier,
    setPromptAssistModel: state.setPromptAssistModel,
    setPromptAssistDeep: state.setPromptAssistDeep,
    setEnableImageGenerations: state.setEnableImageGenerations,
    setDesignTheme: state.setDesignTheme,
    setScaffoldMode: state.setScaffoldMode,
    setScaffoldId: state.setScaffoldId,
    setCustomInstructions: state.setCustomInstructions,
    setApplyInstructionsOnce: state.setApplyInstructionsOnce,
    setDeployNameInput: state.setDeployNameInput,
    setDeployNameDialogOpen: state.setDeployNameDialogOpen,
    setExternalProjectId: state.setExternalProjectId,
    setIsIntentionalReset: state.setIsIntentionalReset,
    setAuthModalReason,
  });

  // ── Publish-state hydration (DB) ────────────────────────────────────
  // Rehydrate the "published"/"publish changes" state on mount so a reload
  // knows the live deployment + hosting project. The SSE stream (below) still
  // drives the in-session build/ready transitions and takes precedence.
  const {
    project: hydratedProject,
    liveDeployment,
    latestFailedDeployment,
    hydrationFailed: deploymentHistoryHydrationFailed,
    refetch: refetchDeploymentHistory,
  } = useDeploymentHistory(chatHooksChatId);
  const hydratedVercelProjectName = hydratedProject?.vercelProjectName ?? null;

  // ── Project thumbnail (Mina projekt) ─────────────────────────────────
  // Fire-and-forget: screenshot the live preview → app_projects.thumbnail_path.
  useProjectThumbnail({
    appProjectId: state.appProjectId,
    previewUrl: state.currentPreviewUrl,
    versionId: derived.activeVersionId,
  });

  // ── Deploy actions ───────────────────────────────────────────────────
  const deployActions = useBuilderDeployActions({
    selectedVersionIdRef,
    latestVersionIdRef,
    chatId: state.chatId,
    activeVersionId: derived.activeVersionId,
    activeDeploymentId: state.activeDeploymentId,
    deployReadiness,
    isDeploying: state.isDeploying,
    isMediaEnabled: state.isMediaEnabled,
    enableBlobMedia: state.enableBlobMedia,
    domainQuery: state.domainQuery,
    deployNameInput: state.deployNameInput,
    isDeployNameSaving: state.isDeployNameSaving,
    appProjectId: state.appProjectId,
    appProjectName: state.appProjectName,
    hydratedProjectName: hydratedVercelProjectName,
    applyInstructionsOnce: state.applyInstructionsOnce,
    pendingInstructionsRef: state.pendingInstructionsRef,
    pendingInstructionsOnceRef: state.pendingInstructionsOnceRef,
    setSelectedVersionId: state.setSelectedVersionId,
    setIsDeploying: state.setIsDeploying,
    setDomainManagerOpen: state.setDomainManagerOpen,
    setSeoReport: state.setSeoReport,
    setLastDeployVercelProjectId: state.setLastDeployVercelProjectId,
    setActiveDeploymentId: state.setActiveDeploymentId,
    setDomainResults: state.setDomainResults,
    setIsDomainSearching: state.setIsDomainSearching,
    setDeployNameDialogOpen: state.setDeployNameDialogOpen,
    setDeployNameError: state.setDeployNameError,
    setDeployNameInput: state.setDeployNameInput,
    setIsDeployNameSaving: state.setIsDeployNameSaving,
    setPendingProjectName: state.setPendingProjectName,
    setAppProjectName: state.setAppProjectName,
    setCustomInstructions: state.setCustomInstructions,
    setApplyInstructionsOnce: state.setApplyInstructionsOnce,
    resolveSuggestedProjectName: projectActions.resolveSuggestedProjectName,
    mutateChat,
    mutateVersions,
    validateCss,
  });
  const fetchHealthFeatures = deployActions.fetchHealthFeatures;

  // ── Deployment status SSE + publish-state hydration ──────────────────
  const deploymentStatus = useBuilderDeploymentStatusSync({
    activeDeploymentId: state.activeDeploymentId,
    setActiveDeploymentId: state.setActiveDeploymentId,
    latestFailedDeployment,
    refetchDeploymentHistory,
  });

  // ── Sandbox preview (Vercel VM) + session recover ───────────────────
  const vmPreview = useBuilderVmPreview({
    isAuthenticated,
    chatId: state.chatId,
    appProjectId: state.appProjectId,
    activeVersionId: derived.activeVersionId,
    effectiveVersionsList: derived.effectiveVersionsList,
    chat: chat as ChatData,
    isAnyStreamingEarly,
    isChatLoading,
    currentPreviewUrl: state.currentPreviewUrl,
    setCurrentPreviewUrl: state.setCurrentPreviewUrl,
    bumpPreviewRefreshToken,
    applyPreviewHandoff,
    mutateChat,
    mutateVersions,
    isShimOrMissingPreviewUrl,
    onBootstrapRecoverSucceeded: () => resetRecoverAfterBootstrapRef.current?.(),
  });

  const {
    previewBuildError,
    previewProdBuild,
    previewPending,
    previewSessionRecovering,
    activePreviewSessionMeta,
    setPreviewBuildError,
    setPreviewProdBuild,
    setPreviewPending,
    onPreviewSessionMeta,
    clearPreviewBuildError,
    clearPreviewSessionState,
    resetPreviewForNewChat,
  } = vmPreview;

  const { handlePreviewSessionSuspect, forcePreviewResync, resetRecoverAttempts, versionMismatchPayload } = usePreviewSession({
    chatId: state.chatId,
    activeVersionId: derived.activeVersionId,
    activeVersionFailedWithoutPreviewUrl,
    currentPreviewUrl: state.currentPreviewUrl,
    activePreviewSessionMeta,
    setCurrentPreviewUrl: state.setCurrentPreviewUrl,
    setPreviewSessionRecovering: vmPreview.setPreviewSessionRecovering,
    previewBootstrapDoneKeysRef: vmPreview.previewBootstrapDoneKeysRef,
    setForcedPreviewRestartKey: vmPreview.setForcedPreviewRestartKey,
    setPreviewBootstrapRetryNonce: vmPreview.setPreviewBootstrapRetryNonce,
    onRecoverFailed: ({ reason, detail }) => {
      setPreviewBuildError({
        stage: reason === "build_error" ? "preview-build-error" : "preview-recover",
        message:
          reason === "build_error"
            ? detail?.trim()
              ? `Live-preview stoppade på ett byggfel: ${detail.trim()}`
              : "Live-preview stoppade på ett byggfel — koden kompilerar inte. En omstart hjälper inte; åtgärda felet."
            : reason === "status_unavailable"
              ? "Live-preview kunde inte verifieras mot servern efter flera försök."
              : "Live-preview kunde inte återansluta efter flera försök.",
      });
      setPreviewPending(false);
    },
  });
  /* eslint-disable react-hooks/refs -- wire bootstrap success callback without putting resetRecoverAttempts in effect deps */
  resetRecoverAfterBootstrapRef.current = resetRecoverAttempts;
  /* eslint-enable react-hooks/refs */

  const resetBeforeCreateChat = useCallback(() => {
    setCurrentPreviewUrl(null);
    currentPreviewUrlRef.current = null;
    lastPreviewHandoffKeyRef.current = null;
    setPreviewRefreshToken(0);
    resetPreviewForNewChat();
  }, [
    setCurrentPreviewUrl,
    setPreviewRefreshToken,
    resetPreviewForNewChat,
    currentPreviewUrlRef,
    lastPreviewHandoffKeyRef,
  ]);

  // ── Chat messaging ───────────────────────────────────────────────────
  const { isCreatingChat, createNewChat, sendMessage: rawSendMessage, cancelActiveGeneration } =
    useChatMessaging({
      chatId: state.chatId,
      activeVersionId: derived.activeVersionId,
      // 5-2 stale-base gate: the client's current notion of the newest version,
      // distinct from `activeVersionId` (which can be a deliberately-selected
      // older version). Forwarded as `meta.engineLatestKnownVersionId`.
      latestKnownVersionId: derived.latestVersionId,
      setChatId: state.setChatId,
      chatIdParam: state.chatIdParam,
      router,
      appProjectId: state.appProjectId,
      linkedProjectId: state.externalProjectId,
      selectedModelTier: state.selectedModelTier,
      enableImageGenerations: state.enableImageGenerations,
      enableImageMaterialization: derived.mediaEnabled,
      enableThinking: state.effectiveThinking,
      chatPrivacy: state.chatPrivacy,
      designThemePreset: state.designTheme,
      systemPrompt: state.customInstructions,
      promptAssistModel: state.promptAssistModel,
      promptAssistDeep: state.promptAssistDeep,
      buildIntent: state.resolvedBuildIntent,
      setBuildIntent: state.setBuildIntent,
      buildMethod: state.buildMethod,
      scaffoldMode: state.scaffoldMode,
      scaffoldId: state.scaffoldId,
      themeColors: state.themeColors,
      paletteState: state.paletteState,
      pendingBriefRef: state.pendingBriefRef,
      mutateVersions,
      setCurrentPreviewUrl: state.setCurrentPreviewUrl,
      setPreviewBuildError,
      setPreviewProdBuild,
      setPreviewPending,
      applyPreviewHandoff,
      onVersionStatusRefresh: bumpVersionStatusRefresh,
      onDeterministicF3Settled: handleDeterministicF3Settled,
      onGenerationComplete: deployActions.handleGenerationComplete,
      onPreviewSessionMeta,
      onLinkedProjectId: (nextId) => state.setExternalProjectId(nextId),
      setMessages: state.setMessages,
      resetBeforeCreateChat,
    });

  const sendMessage = rawSendMessage;

  // ── Init brief (Deep Brief) ─────────────────────────────────────────
  const { generateDynamicInstructions } = useInitBrief({
    model: state.promptAssistModel,
    deep: state.promptAssistDeep,
    imageGenerations: state.enableImageGenerations,
    buildIntent: state.resolvedBuildIntent,
    themeColors: state.themeColors,
  });

  // ── Prompt actions ───────────────────────────────────────────────────
  const promptActions = useBuilderPromptActions({
    chatId: state.chatId,
    templateId: state.templateId,
    scaffoldMode: state.scaffoldMode,
    customInstructions: state.customInstructions,
    applyInstructionsOnce: state.applyInstructionsOnce,
    promptAssistModel: state.promptAssistModel,
    themeColors: state.themeColors,
    paletteState: state.paletteState,
    selectedModelTier: state.selectedModelTier,
    isCreatingChat,
    isAnyStreaming: derived.isAnyStreaming,
    isTemplateLoading: state.isTemplateLoading,
    isPreparingPrompt: state.isPreparingPrompt,
    buildMethod: state.buildMethod,
    designTheme: state.designTheme,
    appProjectId: state.appProjectId,
    pendingBriefRef: state.pendingBriefRef,
    pendingInstructionsRef: state.pendingInstructionsRef,
    pendingInstructionsOnceRef: state.pendingInstructionsOnceRef,
    templateInitAttemptKeyRef: state.templateInitAttemptKeyRef,
    router,
    searchParams,
    setChatId: state.setChatId,
    setMessages: state.setMessages,
    setCurrentPreviewUrl: state.setCurrentPreviewUrl,
    setSelectedVersionId: state.setSelectedVersionId,
    setEntryIntentActive: state.setEntryIntentActive,
    setIsPreparingPrompt: state.setIsPreparingPrompt,
    setCustomInstructions: state.setCustomInstructions,
    setDesignTheme: state.setDesignTheme,
    setPaletteState: state.setPaletteState,
    generateDynamicInstructions,
    createNewChat,
    cancelActiveGeneration,
    resetBeforeCreateChat,
    applyAppProjectId: projectActions.applyAppProjectId,
  });

  // ── Preview / version callbacks ──────────────────────────────────────
  const builderCallbacks = useBuilderCallbacks({
    chatId: state.chatId,
    currentPreviewUrl: state.currentPreviewUrl,
    sendMessage,
    effectiveVersionsList: derived.effectiveVersionsList,
    bumpPreviewRefreshToken,
    setCurrentPreviewUrl: state.setCurrentPreviewUrl,
    setSelectedVersionId: state.setSelectedVersionId,
    setIsVersionPanelCollapsed: state.setIsVersionPanelCollapsed,
  });

  const routeMessages = Array.isArray((chat as { messages?: unknown[] } | null)?.messages)
    ? (((chat as { messages?: ChatMessage[] }).messages) ?? [])
    : [];
  const restoreMessages = routeMessages.length > 0 ? routeMessages : state.serverProjectMessages;
  const restoreMessagesChatId = routeMessages.length > 0 ? state.chatId : state.serverProjectChatId;

  // ── Persisted messages ───────────────────────────────────────────────
  usePersistedChatMessages({
    chatId: state.chatId,
    isCreatingChat,
    isAnyStreaming: derived.isAnyStreaming,
    messages: state.messages,
    setMessages: state.setMessages,
    serverMessages: restoreMessages,
    serverMessagesChatId: restoreMessagesChatId,
  });

  // ── Template init effects ────────────────────────────────────────────
  useBuilderEffects({
    auditPromptLoaded: state.auditPromptLoaded,
    templateId: state.templateId,
    chatId: state.chatId,
    isCreatingChat,
    isAnyStreaming: derived.isAnyStreaming,
    selectedModelTier: state.selectedModelTier,
    appProjectId: state.appProjectId,
    applyAppProjectId: projectActions.applyAppProjectId,
    searchParams,
    router,
    setChatId: state.setChatId,
    setCurrentPreviewUrl: state.setCurrentPreviewUrl,
    setIsTemplateLoading: state.setIsTemplateLoading,
    templateInitAttemptKeyRef: state.templateInitAttemptKeyRef,
  });

  // =====================================================================
  // EFFECTS — cross-cutting concerns, localStorage sync, URL sync
  // =====================================================================

  useBuilderEntryHydration({
    entry,
    chatId,
    chatIdParam,
    promptId,
    promptParam,
    projectParam,
    buildIntentParam,
    isAuthenticated,
    isAuthLoading,
    isCreatingChat,
    fetchUser,
    cancelActiveGeneration,
    pendingBriefRef,
    promptFetchDoneRef,
    promptFetchInFlightRef,
    router,
    searchParams,
    setAppProjectId,
    setAuditPromptLoaded,
    setAuthModalReason,
    setBuildIntent,
    setBuildMethod,
    setChatId,
    setCurrentPreviewUrl,
    setEntryIntentActive,
    setExternalProjectId,
    setMessages,
    setResolvedPrompt,
    setSelectedVersionId,
  });

  useBuilderGenerationPreferences({
    chatId,
    enableThinking,
    setEnableThinking,
    selectedModelTier,
    setSelectedModelTier,
    enableImageGenerations,
    setEnableImageGenerations,
    enableBlobMedia,
    setEnableBlobMedia,
    designTheme,
    setDesignTheme,
    applyingGenerationSettingsRef,
    loadedGenerationSettingsChatRef,
  });

  useBuilderProjectHydration({
    appProjectId,
    chatId,
    chatIdParam,
    entryKind: entry.entryKind,
    forceNew: entry.forceNew,
    hasEntryParams,
    isAuthLoading,
    paletteState,
    projectParam,
    autoProjectInitRef,
    lastPaletteSavedRef,
    lastProjectIdRef,
    paletteLoadedRef,
    router,
    searchParams,
    setAppProjectId,
    setAppProjectName,
    setAuthModalReason,
    setClearedPreviewVersionId,
    setEntryIntentActive,
    setPaletteState,
    setServerProjectChatId,
    setServerProjectDemoUrl,
    setServerProjectMessages,
    setServerProjectPreviewOverrideUrl,
    setServerProjectPreviewOverrideVersionId,
  });

  useBuilderInstructionPreferences({
    chatId,
    showStructuredChat,
    setShowStructuredChat,
    tipsEnabled,
    setTipsEnabled,
    customInstructions,
    setCustomInstructions,
    applyInstructionsOnce,
    setApplyInstructionsOnce,
    hasLoadedInstructionsRef: hasLoadedInstructions,
    hasLoadedInstructionsOnceRef: hasLoadedInstructionsOnce,
    pendingInstructionsRef,
    pendingInstructionsOnceRef,
  });

  useBuilderFeatureFlags({
    fetchHealthFeatures,
    featureWarnedRef,
    setEnableImageGenerations,
    setIsImageGenerationsSupported,
    setIsMediaEnabled,
  });

  useBuilderRouteFeedback({
    chatId,
    isAuditEntry: entry.isAuditEntry,
    isChatError,
    promptId,
    pendingBriefRef,
    router,
    searchParams,
    setAuditPromptLoaded,
    setChatId,
    setCurrentPreviewUrl,
    setIsIntentionalReset,
    setMessages,
  });

  const { pendingCreatedVersionRef } = useBuilderVersionSelectionSync({
    chatId,
    chatIdParam,
    chatExternalProjectId: derived.chatExternalProjectId,
    entryIntentActive,
    externalProjectId,
    hasEntryParams,
    isIntentionalReset,
    selectedVersionId,
    versionIdSet: derived.versionIdSet,
    router,
    setChatId,
    setExternalProjectId,
    setIsIntentionalReset,
    setSelectedVersionId,
  });

  const previewLifecycle = useBuilderPreviewVersionSync({
    activeVersionId: derived.activeVersionId,
    latestVersionId: derived.latestVersionId,
    effectiveVersionsList: derived.effectiveVersionsList,
    selectedVersionId,
    chat: chat as ChatData,
    chatId,
    clearedPreviewVersionId,
    currentPreviewUrl,
    currentPreviewUrlRef,
    lastActiveVersionIdRef,
    previewBuildError,
    previewPending,
    previewSessionRecovering,
    serverProjectChatId,
    serverProjectDemoUrl,
    serverProjectPreviewOverrideUrl,
    serverProjectPreviewOverrideVersionId,
    applyPreviewHandoff,
    setClearedPreviewVersionId,
    setCurrentPreviewUrl,
    setPreviewPending,
    setPreviewRefreshToken,
  });

  const handleFilesSaved = useBuilderFilesContext({
    chatId,
    activeVersionId: derived.activeVersionId,
    previewRefreshToken: state.previewRefreshToken,
    filesContextKeyRef,
    promptFetchDoneRef,
    pendingCreatedVersionRef,
    mutateVersions,
    onVersionStatusRefresh: bumpVersionStatusRefresh,
    onPreviewSessionMeta,
    setCurrentPageCode,
    setExistingUiComponents,
    setPreviewRefreshToken,
    setSelectedVersionId,
    state,
    vmPreview,
  });

  useBuilderAutoStartGeneration({
    isAuthenticated,
    templateId,
    buildMethod,
    resolvedPrompt,
    chatId,
    setSelectedModelTier,
    promptActions,
  });

  // =====================================================================
  // Return view model
  // =====================================================================
  return {
    // Auth
    authModalReason,
    setAuthModalReason,
    isAuthenticated,

    // Router
    router,
    searchParams,

    // State (pass through what the shell needs)
    chatId: state.chatId,
    messages: state.messages,
    buildMethod: state.buildMethod,
    selectedModelTier: state.selectedModelTier,
    promptAssistModel: state.promptAssistModel,
    promptAssistDeep: state.promptAssistDeep,
    customInstructions: state.customInstructions,
    applyInstructionsOnce: state.applyInstructionsOnce,
    enableImageGenerations: state.enableImageGenerations,
    enableThinking: state.enableThinking,
    chatPrivacy: state.chatPrivacy,
    setChatPrivacy: state.setChatPrivacy,
    isImageGenerationsSupported: state.isImageGenerationsSupported,
    isMediaEnabled: state.isMediaEnabled,
    enableBlobMedia: state.enableBlobMedia,
    showStructuredChat: state.showStructuredChat,
    tipsEnabled,
    designTheme: state.designTheme,
    scaffoldMode: state.scaffoldMode,
    scaffoldId: state.scaffoldId,
    isImportModalOpen: state.isImportModalOpen,
    isDeploying: state.isDeploying,
    isSavingProject: state.isSavingProject,
    isTemplateLoading: state.isTemplateLoading,
    isPreparingPrompt: state.isPreparingPrompt,
    deployNameDialogOpen: state.deployNameDialogOpen,
    deployNameInput: state.deployNameInput,
    deployNameError: state.deployNameError,
    domainSearchOpen: state.domainSearchOpen,
    domainManagerOpen: state.domainManagerOpen,
    domainQuery: state.domainQuery,
    domainResults: state.domainResults,
    isDomainSearching: state.isDomainSearching,
    lastDeployVercelProjectId: state.lastDeployVercelProjectId,
    activeDeploymentId: state.activeDeploymentId,
    deploymentStatus: deploymentStatus.status,
    deploymentUrl: deploymentStatus.url,
    deploymentInspectorUrl: deploymentStatus.inspectorUrl,
    // Hydrated publish state (survives reloads; see useDeploymentHistory).
    liveDeploymentUrl: liveDeployment?.url ?? null,
    liveDeploymentVersionId: liveDeployment?.versionId ?? null,
    liveDeploymentId: liveDeployment?.deploymentId ?? null,
    deploymentHistoryHydrationFailed,
    refetchDeploymentHistory,
    hydratedVercelProjectId: hydratedProject?.vercelProjectId ?? null,
    hydratedVercelProjectName,
    deployReadiness,
    isDeployReadinessLoading,
    externalProjectId: state.externalProjectId,
    paletteState: state.paletteState,
    currentPreviewUrl: state.currentPreviewUrl,
    previewBuildError,
    previewProdBuild,
    previewPending,
    activePreviewSessionId: activePreviewSessionMeta?.previewSessionId ?? null,
    activePreviewLifecycleToken: activePreviewSessionMeta?.lifecycleToken,
    previewLifecycle,
    handleDeterministicF3Settled,
    handlePreviewSessionSuspect,
    forcePreviewResync,
    versionMismatchPayload,
    clearPreviewBuildError,
    clearPreviewSessionState,
    serverProjectPreviewOverrideVersionId: state.serverProjectPreviewOverrideVersionId,
    previewRefreshToken: state.previewRefreshToken,
    bumpPreviewRefreshToken,
    versionStatusNonce,
    isVersionPanelCollapsed: state.isVersionPanelCollapsed,
    currentPageCode: state.currentPageCode,
    existingUiComponents: state.existingUiComponents,
    appProjectId: state.appProjectId,
    appProjectName: state.appProjectName,

    // Setters the shell needs for onChange handlers
    setSelectedModelTier: state.setSelectedModelTier,
    setPromptAssistDeep: state.setPromptAssistDeep,
    setCustomInstructions: state.setCustomInstructions,
    setApplyInstructionsOnce: state.setApplyInstructionsOnce,
    setEnableImageGenerations: state.setEnableImageGenerations,
    setEnableThinking: state.setEnableThinking,
    setEnableBlobMedia: state.setEnableBlobMedia,
    setShowStructuredChat: state.setShowStructuredChat,
    setTipsEnabled,
    setDesignTheme: state.setDesignTheme,
    setScaffoldMode: state.setScaffoldMode,
    setScaffoldId: state.setScaffoldId,
    setIsImportModalOpen: state.setIsImportModalOpen,
    setDeployNameDialogOpen: state.setDeployNameDialogOpen,
    setDeployNameInput: state.setDeployNameInput,
    setDeployNameError: state.setDeployNameError,
    setDomainSearchOpen: state.setDomainSearchOpen,
    setDomainManagerOpen: state.setDomainManagerOpen,
    seoReport: state.seoReport,
    setSeoReport: state.setSeoReport,
    setDomainQuery: state.setDomainQuery,
    setCurrentPreviewUrl: state.setCurrentPreviewUrl,
    setPreviewPending,
    setServerProjectPreviewOverrideUrl: state.setServerProjectPreviewOverrideUrl,
    setServerProjectPreviewOverrideVersionId: state.setServerProjectPreviewOverrideVersionId,
    setClearedPreviewVersionId: state.setClearedPreviewVersionId,
    setChatId: state.setChatId,
    setMessages: state.setMessages,

    // Derived
    isAnyStreaming: derived.isAnyStreaming,
    isAwaitingInput: derived.isAwaitingInput,
    activeVersionId: derived.activeVersionId,
    latestVersionId: derived.latestVersionId,
    mediaEnabled: derived.mediaEnabled,
    initialPrompt: derived.initialPrompt,
    auditPromptLoaded: state.auditPromptLoaded,

    // External data
    versions,
    effectiveVersionsList: derived.effectiveVersionsList,
    mutateVersions,

    // Messaging
    isCreatingChat,
    sendMessage,
    cancelActiveGeneration,

    // Project actions
    applyAppProjectId: projectActions.applyAppProjectId,
    handleSaveProject: projectActions.handleSaveProject,
    resetToNewChat: useCallback(() => {
      if (state.chatId && state.messages.length > 0) {
        if (!window.confirm("Vill du verkligen starta en ny chat? Osparade ändringar försvinner.")) {
          return;
        }
      }
      autoProjectInitRef.current = false;
      projectActions.resetToNewChat();
    }, [projectActions, autoProjectInitRef, state.chatId, state.messages.length]),

    // Deploy actions
    handleOpenDeployDialog: deployActions.handleOpenDeployDialog,
    handleDomainSearch: deployActions.handleDomainSearch,
    handleConfirmDeploy: deployActions.handleConfirmDeploy,
    // A3: manuell deploy-repair ("Publicera om med fix") + dess laddningsstate.
    republishWithFix: deployActions.republishWithFix,
    isRepublishRepairing: deployActions.isRepublishRepairing,

    // Prompt actions
    requestCreateChat: promptActions.requestCreateChat,
    handleStartFromTemplate: promptActions.handleStartFromTemplate,
    templateSwitchDialog: promptActions.templateSwitchDialog,
    confirmTemplateSwitchDialog: promptActions.confirmTemplateSwitchDialog,
    cancelTemplateSwitchDialog: promptActions.cancelTemplateSwitchDialog,
    handleGoHome: promptActions.handleGoHome,
    handlePaletteSelection: promptActions.handlePaletteSelection,

    // Preview / version callbacks
    handleClearPreview: builderCallbacks.handleClearPreview,
    handleFixPreview: builderCallbacks.handleFixPreview,
    handleRestartGeneration: builderCallbacks.handleRestartGeneration,
    handleVersionSelect: builderCallbacks.handleVersionSelect,
    handleToggleVersionPanel: builderCallbacks.handleToggleVersionPanel,
    handleFilesSaved,
    versionlessAborted,

  };
}

export type BuilderViewModel = ReturnType<typeof useBuilderPageController>;
